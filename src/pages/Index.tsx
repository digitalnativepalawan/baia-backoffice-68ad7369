import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResortProfile } from '@/hooks/useResortProfile';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DoorOpen, Users, Shield, LogIn } from 'lucide-react';
import { toast } from 'sonner';

const SESSION_KEY = 'staff_home_session';

const Index = () => {
  const navigate = useNavigate();
  const { data: profile } = useResortProfile();
  const logoSize = profile?.logo_size || 128;

  const [mode, setMode] = useState<null | 'staff' | 'admin'>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!name.trim() || !pin) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('employee-auth', {
        body: { action: 'verify', name: name.trim(), pin },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Login failed');
        setLoading(false);
        return;
      }
      const s = {
        name: data.employee.name,
        employeeId: data.employee.id,
        isAdmin: data.isAdmin || false,
        permissions: data.permissions || [],
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      localStorage.setItem('emp_id', data.employee.id);
      localStorage.setItem('emp_name', data.employee.name);
      toast.success(`Welcome, ${data.employee.name}`);

      if (mode === 'admin') {
        if (s.isAdmin || s.permissions.includes('admin')) {
          navigate('/admin');
        } else {
          toast.error('Admin access required');
        }
      } else {
        navigate('/staff');
      }
    } catch {
      toast.error('Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col items-center justify-center px-6">
      {profile?.logo_url && (
        <div className="mb-6" style={{ width: logoSize, height: logoSize }}>
          <img
            src={profile.logo_url}
            alt={profile.resort_name || 'Resort logo'}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {profile?.resort_name && (
        <h1 className="font-display text-4xl md:text-5xl tracking-[0.2em] text-foreground text-center mb-2">
          {profile.resort_name}
        </h1>
      )}

      {profile?.tagline && (
        <p className="font-body text-sm text-muted-foreground tracking-wider mb-1">{profile.tagline}</p>
      )}
      <div className="mb-12" />

      {!mode ? (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => navigate('/guest-portal')}
            className="flex items-center justify-center gap-3 font-display text-lg tracking-wider py-6 border border-accent/30 text-accent hover:bg-accent/5 transition-colors rounded-lg"
          >
            <DoorOpen className="w-5 h-5" />
            I'm a Guest
          </button>

          <button
            onClick={() => setMode('staff')}
            className="flex items-center justify-center gap-3 font-display text-lg tracking-wider py-6 border border-foreground/20 text-foreground hover:bg-foreground/5 transition-colors rounded-lg"
          >
            <Users className="w-5 h-5" />
            Staff
          </button>

          <button
            onClick={() => setMode('admin')}
            className="flex items-center justify-center gap-2 font-body text-sm tracking-wider py-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Shield className="w-4 h-4" />
            Admin
          </button>
        </div>
      ) : (
        <div className="w-full max-w-xs space-y-3">
          <p className="font-display text-sm tracking-wider text-foreground text-center mb-2">
            {mode === 'admin' ? 'Admin Login' : 'Staff Login'}
          </p>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="bg-secondary border-border text-foreground font-body text-center text-lg h-12"
            onKeyDown={e => { if (e.key === 'Enter') document.getElementById('home-pin')?.focus(); }}
            autoFocus
          />
          <Input
            id="home-pin"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="PIN"
            className="bg-secondary border-border text-foreground font-body text-center text-2xl tracking-[0.5em] h-14"
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
          />
          <Button
            onClick={handleLogin}
            disabled={loading || !name.trim() || !pin}
            className="w-full font-display text-sm tracking-wider h-12"
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </Button>
          <button
            onClick={() => { setMode(null); setName(''); setPin(''); }}
            className="w-full font-body text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default Index;
