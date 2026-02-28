import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, LogOut } from 'lucide-react';
import { toast } from 'sonner';

interface AdminLoginGateProps {
  children: React.ReactNode;
}

const SESSION_KEY = 'admin_session';
const STAFF_SESSION_KEY = 'staff_home_session';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

const AdminLoginGate = ({ children }: AdminLoginGateProps) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check existing session on mount — reuse home staff session if admin
  useEffect(() => {
    try {
      // First check dedicated admin session
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        const session = JSON.parse(stored);
        if (session.expiresAt > Date.now()) {
          setAuthenticated(true);
          setAdminName(session.name);
          setChecking(false);
          return;
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
      // Then check if staff home session is admin — skip double login
      const staffStored = sessionStorage.getItem(STAFF_SESSION_KEY);
      if (staffStored) {
        const staffSession = JSON.parse(staffStored);
        if (staffSession.expiresAt > Date.now() && staffSession.isAdmin) {
          // Mirror into admin session so logout works independently
          const adminSession = {
            name: staffSession.name,
            employeeId: staffSession.employeeId,
            expiresAt: staffSession.expiresAt,
          };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminSession));
          setAuthenticated(true);
          setAdminName(staffSession.name);
          setChecking(false);
          return;
        }
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
    setChecking(false);
  }, []);

  const handleLogin = async () => {
    if (!loginName.trim() || !loginPin) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('employee-auth', {
        body: { action: 'admin-verify', name: loginName.trim(), pin: loginPin },
      });

      if (error) {
        let msg = 'Login failed';
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error) msg = ctx.error;
        } catch {
          if (typeof data === 'object' && data?.error) msg = data.error;
        }
        toast.error(msg);
        setLoading(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      if (data?.isAdmin) {
        const session = {
          name: data.employee.name,
          employeeId: data.employee.id,
          expiresAt: Date.now() + SESSION_DURATION,
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        setAuthenticated(true);
        setAdminName(data.employee.name);
        setLoginPin('');
        toast.success(`Welcome, ${data.employee.name}`);
      }
    } catch {
      toast.error('Login failed');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthenticated(false);
    setAdminName('');
    setLoginName('');
    setLoginPin('');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-navy-texture flex items-center justify-center">
        <p className="font-body text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-navy-texture flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-xl tracking-wider text-foreground">Admin Access</h1>
            <p className="font-body text-sm text-muted-foreground">Enter your name and PIN to continue</p>
          </div>
          <div className="space-y-3">
            <Input
              value={loginName}
              onChange={e => setLoginName(e.target.value)}
              placeholder="Your name"
              className="bg-secondary border-border text-foreground font-body text-center text-lg h-12"
              onKeyDown={e => { if (e.key === 'Enter') document.getElementById('admin-pin')?.focus(); }}
            />
            <Input
              id="admin-pin"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={loginPin}
              onChange={e => setLoginPin(e.target.value.replace(/\D/g, ''))}
              placeholder="PIN"
              className="bg-secondary border-border text-foreground font-body text-center text-2xl tracking-[0.5em] h-14"
              onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
            />
            <Button
              onClick={handleLogin}
              disabled={loading || !loginName.trim() || !loginPin}
              className="w-full font-display text-sm tracking-wider h-12"
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Logout button */}
      <button
        onClick={handleLogout}
        className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/80 backdrop-blur border border-border text-muted-foreground hover:text-foreground transition-colors"
        title={`Logged in as ${adminName}`}
      >
        <span className="font-body text-xs hidden sm:inline">{adminName}</span>
        <LogOut className="w-3.5 h-3.5" />
      </button>
      {children}
    </div>
  );
};

export default AdminLoginGate;
