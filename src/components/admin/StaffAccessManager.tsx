import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { type PermissionLevel, getPermissionLevel } from '@/lib/permissions';

const GRANULAR_PERMISSIONS = [
  { key: 'orders', label: 'Orders' },
  { key: 'menu', label: 'Menu' },
  { key: 'kitchen', label: 'Kitchen Display' },
  { key: 'bar', label: 'Bar Display' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'reception', label: 'Reception' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'reports', label: 'Reports' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'resort_ops', label: 'Resort Ops' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'schedules', label: 'Schedules' },
  { key: 'setup', label: 'Setup' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'timesheet', label: 'Timesheet' },
] as const;

/** Sections that support 3-level (view/edit/manage) permissions */
const THREE_LEVEL_SECTIONS = new Set(['reception', 'experiences']);

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  off: 'Off',
  view: 'View',
  edit: 'Edit',
  manage: 'Manage',
};

const LEVEL_COLORS: Record<PermissionLevel, string> = {
  off: 'bg-muted text-muted-foreground',
  view: 'bg-blue-600/20 text-blue-400 border-blue-500/40',
  edit: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40',
  manage: 'bg-purple-600/20 text-purple-400 border-purple-500/40',
};

const StaffAccessManager = () => {
  const qc = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-access'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('active', true).order('name');
      return data || [];
    },
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['employee-permissions'],
    queryFn: async () => {
      const { data } = await (supabase.from('employee_permissions' as any) as any).select('*');
      return (data || []) as { id: string; employee_id: string; permission: string }[];
    },
  });

  const getEmpPermissions = (empId: string) =>
    permissions.filter(p => p.employee_id === empId).map(p => p.permission);

  const isAdmin = (empId: string) =>
    getEmpPermissions(empId).includes('admin');

  const toggleAdmin = async (empId: string) => {
    const existing = permissions.find(p => p.employee_id === empId && p.permission === 'admin');
    if (existing) {
      await (supabase.from('employee_permissions' as any) as any).delete().eq('id', existing.id);
    } else {
      await (supabase.from('employee_permissions' as any) as any).insert({ employee_id: empId, permission: 'admin' });
    }
    qc.invalidateQueries({ queryKey: ['employee-permissions'] });
    toast.success('Permission updated');
  };

  /** Cycle a section permission: off → view → edit → (manage →) off */
  const cyclePermission = async (empId: string, section: string) => {
    const empPerms = getEmpPermissions(empId);
    const current = getPermissionLevel(empPerms, section);
    const isThreeLevel = THREE_LEVEL_SECTIONS.has(section);

    // Remove existing permissions for this section
    const toRemove = permissions.filter(
      p => p.employee_id === empId && (p.permission === section || p.permission === `${section}:view` || p.permission === `${section}:edit` || p.permission === `${section}:manage`)
    );
    for (const p of toRemove) {
      await (supabase.from('employee_permissions' as any) as any).delete().eq('id', p.id);
    }

    // Insert next level
    let nextLevel: PermissionLevel;
    if (isThreeLevel) {
      nextLevel = current === 'off' ? 'view' : current === 'view' ? 'edit' : current === 'edit' ? 'manage' : 'off';
    } else {
      nextLevel = current === 'off' ? 'view' : current === 'view' ? 'edit' : 'off';
    }
    if (nextLevel !== 'off') {
      await (supabase.from('employee_permissions' as any) as any).insert({
        employee_id: empId,
        permission: `${section}:${nextLevel}`,
      });
    }

    qc.invalidateQueries({ queryKey: ['employee-permissions'] });
    toast.success(`${section} → ${LEVEL_LABELS[nextLevel]}`);
  };

  /** Toggle documents permission (off → view → edit → off) */
  const cycleDocuments = async (empId: string) => {
    await cyclePermission(empId, 'documents');
  };

  if (employees.length === 0) {
    return (
      <section>
        <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Staff Access</h3>
        <p className="font-body text-xs text-muted-foreground">No active employees found.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="font-display text-sm tracking-wider text-foreground mb-2">Staff Access</h3>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Tap each section badge to cycle: <span className="text-muted-foreground">Off</span> → <span className="text-blue-400">View</span> → <span className="text-emerald-400">Edit</span> → <span className="text-purple-400">Manage</span> (Reception/Experiences) → Off
      </p>
      <div className="space-y-4">
        {employees.map((emp: any) => {
          const empPerms = getEmpPermissions(emp.id);
          const empIsAdmin = empPerms.includes('admin');

          return (
            <div key={emp.id} className="border border-border rounded-lg p-3">
              <p className="font-display text-sm text-foreground tracking-wider mb-2">
                {emp.display_name || emp.name}
              </p>

              {/* Admin toggle */}
              <label className="flex items-center gap-2 cursor-pointer mb-1">
                <Switch
                  checked={empIsAdmin}
                  onCheckedChange={() => toggleAdmin(emp.id)}
                  className="data-[state=checked]:bg-amber-600"
                />
                <span className="font-display text-xs tracking-wider text-foreground">
                  Admin (Full Access)
                </span>
              </label>
              {empIsAdmin && (
                <p className="font-body text-[11px] text-amber-500/80 mb-2 ml-[3.25rem]">
                  Full access to all sections
                </p>
              )}

              {/* Granular permissions - 3-way badges */}
              <div className={`space-y-1.5 mt-2 ${empIsAdmin ? 'opacity-40 pointer-events-none' : ''}`}>
                {GRANULAR_PERMISSIONS.map(({ key, label }) => {
                  const level = empIsAdmin ? 'edit' : getPermissionLevel(empPerms, key);
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="font-body text-xs text-muted-foreground">{label}</span>
                      <button
                        onClick={() => cyclePermission(emp.id, key)}
                        disabled={empIsAdmin}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-display tracking-wider border transition-colors ${LEVEL_COLORS[level]}`}
                      >
                        {LEVEL_LABELS[level]}
                      </button>
                    </div>
                  );
                })}

                {/* Documents (Sensitive) — separate */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50 mt-1.5">
                  <span className="font-body text-xs text-muted-foreground">
                    📄 Documents <span className="text-[10px] text-amber-500/70">(Sensitive)</span>
                  </span>
                  <button
                    onClick={() => cycleDocuments(emp.id)}
                    disabled={empIsAdmin}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-display tracking-wider border transition-colors ${LEVEL_COLORS[empIsAdmin ? 'edit' : getPermissionLevel(empPerms, 'documents')]}`}
                  >
                    {LEVEL_LABELS[empIsAdmin ? 'edit' : getPermissionLevel(empPerms, 'documents')]}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default StaffAccessManager;
