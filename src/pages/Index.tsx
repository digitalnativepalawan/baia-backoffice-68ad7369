import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResortProfile } from '@/hooks/useResortProfile';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { setGuestSession } from '@/hooks/useGuestSession';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogIn, LogOut, UtensilsCrossed, DoorOpen } from 'lucide-react';
import { toast } from 'sonner';

const STAFF_SESSION_KEY = 'staff_home_session';

const getStoredSession = () => {
  try {
    const stored = sessionStorage.getItem(STAFF_SESSION_KEY);
    if (stored) {
      const s = JSON.parse(stored);
      if (s.expiresAt > Date.now()) return s;
      sessionStorage.removeItem(STAFF_SESSION_KEY);
    }
  } catch { sessionStorage.removeItem(STAFF_SESSION_KEY); }
  return null;
};

const Index = () => {
  const navigate = useNavigate();
  const { data: profile } = useResortProfile();
  const logoSize = profile?.logo_size || 128;

  const [session, setSession] = useState(getStoredSession);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Guest ordering state
  const [showGuestOrder, setShowGuestOrder] = useState(false);
  const [guestRoom, setGuestRoom] = useState('');
  const [guestNameInput, setGuestNameInput] = useState('');
  const [guestPassword, setGuestPassword] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);

  // Fetch all active units for guest ordering room selection
  const { data: allUnits = [] } = useQuery({
    queryKey: ['active-units-landing'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('id, unit_name').eq('active', true).order('unit_name');
      return data || [];
    },
  });

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
      sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(s));
      localStorage.setItem('emp_id', data.employee.id);
      localStorage.setItem('emp_name', data.employee.name);
      setSession(s);
      setPin('');
      setShowLogin(false);
      toast.success(`Welcome, ${data.employee.name}`);
    } catch {
      toast.error('Login failed');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(STAFF_SESSION_KEY);
    localStorage.removeItem('emp_id');
    localStorage.removeItem('emp_name');
    setSession(null);
    setName('');
    setPin('');
  };

  const handleGuestVerify = async () => {
    if (!guestRoom || !guestNameInput.trim() || !guestPassword.trim()) return;
    setGuestLoading(true);
    try {
      const unit = allUnits.find(u => u.unit_name === guestRoom);
      if (!unit) {
        toast.error('Room not found');
        setGuestLoading(false);
        return;
      }

      // Resolve room name to resort_ops_units (bookings reference that table)
      const { data: opsUnit } = await supabase
        .from('resort_ops_units')
        .select('id')
        .ilike('name', guestRoom.trim())
        .maybeSingle();

      if (!opsUnit) {
        toast.error('Room not found in booking system');
        setGuestLoading(false);
        return;
      }

      // Find booking with matching password
      const { data: booking } = await supabase
        .from('resort_ops_bookings')
        .select('id, guest_id, check_in, check_out, room_password, password_expires_at, resort_ops_guests(id, full_name)')
        .eq('unit_id', opsUnit.id)
        .eq('room_password', guestPassword.trim())
        .gte('password_expires_at', new Date().toISOString())
        .maybeSingle();

      if (!booking) {
        toast.error('Invalid room password');
        setGuestLoading(false);
        return;
      }

      // Verify guest name matches
      const guestName = (booking as any).resort_ops_guests?.full_name;
      if (!guestName || guestName.toLowerCase().trim() !== guestNameInput.toLowerCase().trim()) {
        toast.error('Guest name does not match our records');
        setGuestLoading(false);
        return;
      }

      setGuestSession({
        room_id: unit.id,
        room_name: unit.unit_name,
        guest_name: guestName,
        booking_id: booking.id,
      });

      toast.success(`Welcome, ${guestNameInput.trim()}!`);
      navigate('/menu?mode=guest-order');
    } catch {
      toast.error('Verification failed');
    }
    setGuestLoading(false);
  };

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col items-center justify-center px-6">
      {profile?.logo_url && (
        <img
          src={profile.logo_url}
          alt={profile.resort_name || 'Resort logo'}
          style={{ width: logoSize, height: logoSize }}
          className="object-contain mb-6"
        />
      )}

      {profile?.resort_name && (
        <h1 className="font-display text-4xl md:text-5xl tracking-[0.2em] text-foreground text-center mb-2">
          {profile.resort_name}
        </h1>
      )}

      {profile?.tagline && (
        <p className="font-body text-sm text-cream-dim/70 tracking-wider mb-1">{profile.tagline}</p>
      )}
      <div className="mb-12" />

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => navigate('/guest-portal')}
          className="flex items-center justify-center gap-2 font-display text-base tracking-wider py-4 border border-accent/30 text-accent hover:bg-accent/5 transition-colors"
        >
          <DoorOpen className="w-4 h-4" />
          Guest Portal
        </button>
        <button
          onClick={() => navigate('/menu?mode=guest')}
          className="font-display text-base tracking-wider py-4 border border-foreground/30 text-foreground hover:bg-foreground/5 transition-colors"
        >
          View Menu
        </button>

        {/* Staff section */}
        {session ? (
          <>
            <button
              onClick={() => navigate('/order-type?mode=staff')}
              className="font-display text-base tracking-wider py-4 border border-foreground/20 text-cream-dim hover:bg-foreground/5 transition-colors"
            >
              Staff Order
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/kitchen')}
                className="font-display text-sm tracking-wider py-3 flex-1 border border-foreground/10 text-cream-dim hover:bg-foreground/5 transition-colors"
              >
                🍳 Kitchen
              </button>
              <button
                onClick={() => navigate('/bar')}
                className="font-display text-sm tracking-wider py-3 flex-1 border border-foreground/10 text-cream-dim hover:bg-foreground/5 transition-colors"
              >
                🍹 Bar
              </button>
            </div>
            <button
              onClick={() => navigate('/housekeeper')}
              className="font-display text-sm tracking-wider py-3 border border-foreground/10 text-cream-dim hover:bg-foreground/5 transition-colors"
            >
              🧹 Housekeeping
            </button>
            {session.isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="font-body text-sm tracking-wider py-3 text-cream-dim/60 hover:text-cream-dim transition-colors"
              >
                Admin
              </button>
            )}
            {!session.isAdmin && session.permissions && session.permissions.length > 0 && (
              <button
                onClick={() => navigate('/manager')}
                className="font-body text-sm tracking-wider py-3 text-cream-dim/60 hover:text-cream-dim transition-colors"
              >
                Manager
              </button>
            )}
            <button
              onClick={() => navigate('/employee')}
              className="font-body text-sm tracking-wider py-3 text-cream-dim/60 hover:text-cream-dim transition-colors"
            >
              Employee Portal
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 font-body text-xs tracking-wider py-2 text-cream-dim/40 hover:text-cream-dim/70 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out ({session.name})
            </button>
          </>
        ) : (
          <>
            {/* Staff Login */}
            {!showLogin ? (
              <button
                onClick={() => { setShowLogin(true); setShowGuestOrder(false); }}
                className="flex items-center justify-center gap-2 font-display text-base tracking-wider py-4 border border-foreground/20 text-cream-dim hover:bg-foreground/5 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Staff Login
              </button>
            ) : (
              <div className="space-y-3 pt-2">
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
                  onClick={() => { setShowLogin(false); setName(''); setPin(''); }}
                  className="w-full font-body text-xs text-cream-dim/40 hover:text-cream-dim/60 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Guest Ordering */}
            {!showGuestOrder ? (
              <button
                onClick={() => { setShowGuestOrder(true); setShowLogin(false); }}
                className="flex items-center justify-center gap-2 font-display text-base tracking-wider py-4 border border-foreground/20 text-cream-dim hover:bg-foreground/5 transition-colors"
              >
                <UtensilsCrossed className="w-4 h-4" />
                Guest Ordering
              </button>
            ) : (
              <div className="space-y-3 pt-2 border-t border-foreground/10 mt-1">
                <p className="font-body text-xs text-cream-dim/70 text-center pt-2">
                  Place orders directly to our kitchen & bar
                </p>
                <Select onValueChange={setGuestRoom} value={guestRoom}>
                  <SelectTrigger className="bg-secondary border-border text-foreground font-body text-center h-12">
                    <SelectValue placeholder="Select your room" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {allUnits.map(u => (
                      <SelectItem key={u.id} value={u.unit_name} className="text-foreground font-body">
                        {u.unit_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={guestNameInput}
                  onChange={e => setGuestNameInput(e.target.value)}
                  placeholder="Your full name"
                  className="bg-secondary border-border text-foreground font-body text-center text-lg h-12"
                  onKeyDown={e => { if (e.key === 'Enter') document.getElementById('guest-password')?.focus(); }}
                />
                <Input
                  id="guest-password"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={guestPassword}
                  onChange={e => setGuestPassword(e.target.value.replace(/\D/g, ''))}
                  placeholder="Room Password"
                  className="bg-secondary border-border text-foreground font-body text-center text-2xl tracking-[0.5em] h-14"
                  onKeyDown={e => { if (e.key === 'Enter') handleGuestVerify(); }}
                />
                <Button
                  onClick={handleGuestVerify}
                  disabled={guestLoading || !guestRoom || !guestNameInput.trim() || !guestPassword.trim()}
                  className="w-full font-display text-sm tracking-wider h-12"
                >
                  {guestLoading ? 'Verifying...' : 'Start Ordering'}
                </Button>
                <button
                  onClick={() => { setShowGuestOrder(false); setGuestRoom(''); setGuestNameInput(''); setGuestPassword(''); }}
                  className="w-full font-body text-xs text-cream-dim/40 hover:text-cream-dim/60 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
