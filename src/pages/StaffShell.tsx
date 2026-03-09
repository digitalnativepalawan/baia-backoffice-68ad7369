import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasAccess } from '@/lib/permissions';
import { getStaffSession } from '@/lib/session';
import ReceptionHome from '@/components/staff/ReceptionHome';
import HousekeepingHome from '@/components/staff/HousekeepingHome';
import KitchenHome from '@/components/staff/KitchenHome';
import BarHome from '@/components/staff/BarHome';
import ExperiencesHome from '@/components/staff/ExperiencesHome';
import StaffOrderHome from '@/components/staff/StaffOrderHome';
import ActionRequiredPanel from '@/components/staff/ActionRequiredPanel';
import StaffNavBar from '@/components/StaffNavBar';

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
  const session = getStaffSession();
  const perms: string[] = session?.permissions || [];
  const isAdmin = perms.includes('admin');

  const availableRoles = useMemo(() => {
    if (isAdmin) return ROLES;
    return ROLES.filter(r => hasAccess(perms, r.perm));
  }, [perms, isAdmin]);

  const [activeRole, setActiveRole] = useState(() => availableRoles[0]?.key || 'reception');

  if (!session) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      {/* Global navigation bar */}
      <StaffNavBar activeDepartment={activeRole} />

      <div className="max-w-2xl mx-auto px-4 pb-4">

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

        {/* Action Required — always visible, sorted by urgency */}
        <ActionRequiredPanel />

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
