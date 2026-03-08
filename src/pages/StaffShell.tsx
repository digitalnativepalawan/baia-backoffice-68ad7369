import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasAccess } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { LogOut, Home } from 'lucide-react';
import ReceptionHome from '@/components/staff/ReceptionHome';
import HousekeepingHome from '@/components/staff/HousekeepingHome';
import KitchenHome from '@/components/staff/KitchenHome';
import BarHome from '@/components/staff/BarHome';
import ExperiencesHome from '@/components/staff/ExperiencesHome';
import StaffOrderHome from '@/components/staff/StaffOrderHome';

const SESSION_KEY = 'staff_home_session';

const getSession = () => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const s = JSON.parse(stored);
      if (s.expiresAt > Date.now()) return s;
    }
  } catch {}
  return null;
};

interface RoleDef {
  key: string;
  label: string;
  perm: string;
}

const ROLES: RoleDef[] = [
  { key: 'reception', label: 'Reception', perm: 'reception' },
  { key: 'housekeeping', label: 'Housekeeping', perm: 'housekeeping' },
  { key: 'kitchen', label: 'Kitchen', perm: 'kitchen' },
  { key: 'bar', label: 'Bar', perm: 'bar' },
  { key: 'experiences', label: 'Experiences', perm: 'experiences' },
  { key: 'orders', label: 'Orders', perm: 'orders' },
];

const StaffShell = () => {
  const navigate = useNavigate();
  const session = getSession();
  const perms: string[] = session?.permissions || [];
  const isAdmin = perms.includes('admin');

  const availableRoles = useMemo(() => {
    if (isAdmin) return ROLES;
    return ROLES.filter(r => hasAccess(perms, r.perm));
  }, [perms, isAdmin]);

  const [activeRole, setActiveRole] = useState(() => availableRoles[0]?.key || 'reception');

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('emp_id');
    localStorage.removeItem('emp_name');
    navigate('/');
  };

  if (!session) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
              <Home className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-display text-lg tracking-wider text-foreground">{session.name}</h1>
              <p className="font-body text-xs text-muted-foreground">Staff Console</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => navigate('/employee-portal')} className="text-muted-foreground font-body text-xs">
              My Portal
            </Button>
            <Button size="sm" variant="ghost" onClick={handleLogout} className="text-muted-foreground font-body text-xs gap-1">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Role switcher — only show if multiple roles */}
        {availableRoles.length > 1 && (
          <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide pb-1">
            {availableRoles.map(r => (
              <button
                key={r.key}
                onClick={() => setActiveRole(r.key)}
                className={`font-display text-xs tracking-wider whitespace-nowrap min-h-[40px] px-4 py-2 rounded-md border transition-colors ${
                  activeRole === r.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Role-specific home screen */}
        {activeRole === 'reception' && <ReceptionHome />}
        {activeRole === 'housekeeping' && <HousekeepingHome />}
        {activeRole === 'kitchen' && <KitchenHome />}
        {activeRole === 'bar' && <BarHome />}
        {activeRole === 'experiences' && <ExperiencesHome />}
        {activeRole === 'orders' && <StaffOrderHome />}
      </div>
    </div>
  );
};

export default StaffShell;
