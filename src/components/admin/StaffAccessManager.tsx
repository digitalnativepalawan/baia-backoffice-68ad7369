import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { type PermissionLevel, getPermissionLevel } from '@/lib/permissions';
import { Plus, Pencil, Copy, Trash2 } from 'lucide-react';

const from = (table: string) => supabase.from(table as any);

const BUILTIN_ROLE_TEMPLATES: Record<string, string[]> = {
  admin: ['admin'],
  gm: ['admin'],
  receptionist: ['reception:edit', 'experiences:edit', 'rooms:edit', 'housekeeping:view', 'orders:manage', 'documents:view'],
  cook: ['kitchen:edit', 'orders:view', 'inventory:view'],
  chef: ['kitchen:edit', 'menu:edit', 'orders:manage', 'inventory:edit'],
  bartender: ['bar:edit', 'orders:view', 'inventory:view'],
  tours: ['experiences:edit', 'orders:view'],
  transportation: ['experiences:view', 'tasks:edit'],
  maintenance: ['resort_ops:edit', 'tasks:edit', 'housekeeping:view'],
  landscaping: ['tasks:edit', 'resort_ops:view'],
};

const BUILTIN_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  gm: 'GM',
  receptionist: 'Receptionist',
  cook: 'Cook',
  chef: 'Chef',
  bartender: 'Bartender / Barista',
  tours: 'Tours',
  transportation: 'Transportation',
  maintenance: 'Maintenance',
  landscaping: 'Landscaping',
};

const GRANULAR_PERMISSIONS = [
  { key: 'orders', label: 'Orders' },
  { key: 'menu', label: 'Menu' },
  { key: 'kitchen', label: 'Kitchen Display' },
  { key: 'bar', label: 'Bar Display' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'reception', label: 'Reception' },
  { key: 'reception_display', label: 'Reception Display' },
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
  { key: 'documents', label: 'Documents' },
] as const;

const THREE_LEVEL_SECTIONS = new Set(['reception', 'experiences', 'orders']);

const LEVEL_LABELS: Record<PermissionLevel, string> = { off: 'Off', view: 'View', edit: 'Edit', manage: 'Manage' };
const LEVEL_COLORS: Record<PermissionLevel, string> = {
  off: 'bg-muted text-muted-foreground',
  view: 'bg-blue-600/20 text-blue-400 border-blue-500/40',
  edit: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40',
  manage: 'bg-purple-600/20 text-purple-400 border-purple-500/40',
};

type CustomRole = { id: string; name: string; permissions: string[]; created_at: string };

const StaffAccessManager = () => {
  const qc = useQueryClient();
  const [roleModal, setRoleModal] = useState<{ mode: 'create' | 'edit'; role?: CustomRole } | null>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePerms, setRolePerms] = useState<string[]>([]);

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
      const { data } = await (from('employee_permissions') as any).select('*');
      return (data || []) as { id: string; employee_id: string; permission: string }[];
    },
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ['staff-roles'],
    queryFn: async () => {
      const { data } = await (from('staff_roles') as any).select('*').order('created_at');
      return (data || []) as CustomRole[];
    },
  });

  const getEmpPermissions = (empId: string) =>
    permissions.filter(p => p.employee_id === empId).map(p => p.permission);

  const applyRole = async (empId: string, permsArray: string[]) => {
    const empPerms = permissions.filter(p => p.employee_id === empId);
    for (const p of empPerms) {
      await from('employee_permissions').delete().eq('id', p.id);
    }
    for (const perm of permsArray) {
      await from('employee_permissions').insert({ employee_id: empId, permission: perm });
    }
    qc.invalidateQueries({ queryKey: ['employee-permissions'] });
    toast.success('Role applied');
  };

  const toggleAdmin = async (empId: string) => {
    const existing = permissions.find(p => p.employee_id === empId && p.permission === 'admin');
    if (existing) {
      await from('employee_permissions').delete().eq('id', existing.id);
    } else {
      await from('employee_permissions').insert({ employee_id: empId, permission: 'admin' });
    }
    qc.invalidateQueries({ queryKey: ['employee-permissions'] });
    toast.success('Permission updated');
  };

  const cyclePermission = async (empId: string, section: string) => {
    const empPerms = getEmpPermissions(empId);
    const current = getPermissionLevel(empPerms, section);
    const isThreeLevel = THREE_LEVEL_SECTIONS.has(section);

    const toRemove = permissions.filter(
      p => p.employee_id === empId && (p.permission === section || p.permission === `${section}:view` || p.permission === `${section}:edit` || p.permission === `${section}:manage`)
    );
    for (const p of toRemove) {
      await from('employee_permissions').delete().eq('id', p.id);
    }

    let nextLevel: PermissionLevel;
    if (isThreeLevel) {
      nextLevel = current === 'off' ? 'view' : current === 'view' ? 'edit' : current === 'edit' ? 'manage' : 'off';
    } else {
      nextLevel = current === 'off' ? 'view' : current === 'view' ? 'edit' : 'off';
    }
    if (nextLevel !== 'off') {
      await from('employee_permissions').insert({ employee_id: empId, permission: `${section}:${nextLevel}` });
    }
    qc.invalidateQueries({ queryKey: ['employee-permissions'] });
    toast.success(`${section} → ${LEVEL_LABELS[nextLevel]}`);
  };

  // Role CRUD
  const openCreateRole = () => {
    setRoleName('');
    setRolePerms([]);
    setRoleModal({ mode: 'create' });
  };

  const openEditRole = (role: CustomRole) => {
    setRoleName(role.name);
    setRolePerms([...role.permissions]);
    setRoleModal({ mode: 'edit', role });
  };

  const duplicateRole = (role: CustomRole) => {
    setRoleName(`${role.name} (copy)`);
    setRolePerms([...role.permissions]);
    setRoleModal({ mode: 'create' });
  };

  const deleteRole = async (roleId: string) => {
    await from('staff_roles').delete().eq('id', roleId);
    qc.invalidateQueries({ queryKey: ['staff-roles'] });
    toast.success('Role deleted');
  };

  const toggleRolePerm = (perm: string) => {
    setRolePerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  const cycleRolePerm = (section: string) => {
    const current = getPermissionLevel(rolePerms, section);
    const isThreeLevel = THREE_LEVEL_SECTIONS.has(section);

    // Remove existing for this section
    const cleaned = rolePerms.filter(p => p !== section && p !== `${section}:view` && p !== `${section}:edit` && p !== `${section}:manage`);

    let nextLevel: PermissionLevel;
    if (isThreeLevel) {
      nextLevel = current === 'off' ? 'view' : current === 'view' ? 'edit' : current === 'edit' ? 'manage' : 'off';
    } else {
      nextLevel = current === 'off' ? 'view' : current === 'view' ? 'edit' : 'off';
    }
    if (nextLevel !== 'off') {
      cleaned.push(`${section}:${nextLevel}`);
    }
    setRolePerms(cleaned);
  };

  const saveRole = async () => {
    if (!roleName.trim()) { toast.error('Enter a role name'); return; }
    if (roleModal?.mode === 'edit' && roleModal.role) {
      await from('staff_roles').update({ name: roleName.trim(), permissions: rolePerms }).eq('id', roleModal.role.id);
      toast.success('Role updated');
    } else {
      await from('staff_roles').insert({ name: roleName.trim(), permissions: rolePerms });
      toast.success('Role created');
    }
    setRoleModal(null);
    qc.invalidateQueries({ queryKey: ['staff-roles'] });
  };

  // Build combined role options: built-in + custom
  const allRoleOptions = [
    ...Object.entries(BUILTIN_ROLE_LABELS).map(([key, label]) => ({
      key: `builtin:${key}`, label, perms: BUILTIN_ROLE_TEMPLATES[key], isBuiltin: true,
    })),
    ...customRoles.map(r => ({
      key: `custom:${r.id}`, label: r.name, perms: r.permissions, isBuiltin: false,
    })),
  ];

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
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-sm tracking-wider text-foreground">Staff Access</h3>
        <Button size="sm" variant="outline" className="font-display text-xs h-8" onClick={openCreateRole}>
          <Plus className="h-3 w-3 mr-1" /> Create Role
        </Button>
      </div>
      <p className="font-body text-xs text-muted-foreground mb-3">
        Tap each section badge to cycle: <span className="text-muted-foreground">Off</span> → <span className="text-blue-400">View</span> → <span className="text-emerald-400">Edit</span> → <span className="text-purple-400">Manage</span> (Orders/Reception/Experiences) → Off. Orders Edit = take orders only; Manage = advance pipeline.
      </p>

      {/* Custom Roles Management */}
      {customRoles.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Custom Roles</p>
          {customRoles.map(role => (
            <div key={role.id} className="border border-border rounded-lg p-2 flex items-center justify-between">
              <div>
                <span className="font-display text-xs text-foreground">{role.name}</span>
                <span className="font-body text-[10px] text-muted-foreground ml-2">({role.permissions.length} perms)</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEditRole(role)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-accent">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => duplicateRole(role)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-accent">
                  <Copy className="h-3 w-3" />
                </button>
                <button onClick={() => deleteRole(role.id)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {employees.map((emp: any) => {
          const empPerms = getEmpPermissions(emp.id);
          const empIsAdmin = empPerms.includes('admin');

          return (
            <div key={emp.id} className="border border-border rounded-lg p-3">
              <p className="font-display text-sm text-foreground tracking-wider mb-2">
                {emp.display_name || emp.name}
              </p>

              {/* Role template selector */}
              <div className="mb-2">
                <Select onValueChange={(val) => {
                  const opt = allRoleOptions.find(o => o.key === val);
                  if (opt) applyRole(emp.id, opt.perms);
                }}>
                  <SelectTrigger className="h-8 text-xs font-display tracking-wider">
                    <SelectValue placeholder="Apply role template…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__divider_builtin" disabled className="text-[10px] text-muted-foreground">— Built-in —</SelectItem>
                    {Object.entries(BUILTIN_ROLE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={`builtin:${key}`} className="text-xs">{label}</SelectItem>
                    ))}
                    {customRoles.length > 0 && (
                      <SelectItem value="__divider_custom" disabled className="text-[10px] text-muted-foreground">— Custom —</SelectItem>
                    )}
                    {customRoles.map(r => (
                      <SelectItem key={r.id} value={`custom:${r.id}`} className="text-xs">{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

              {/* Granular permissions */}
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Role Create/Edit Modal */}
      <Dialog open={!!roleModal} onOpenChange={() => setRoleModal(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">
              {roleModal?.mode === 'edit' ? 'Edit Role' : 'Create Role'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="font-body text-xs text-muted-foreground">Role Name</label>
              <Input value={roleName} onChange={e => setRoleName(e.target.value)}
                placeholder="e.g. Massage Manager" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div>
              <p className="font-body text-xs text-muted-foreground mb-2">Permissions (tap to cycle)</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-body text-xs text-muted-foreground">Admin (Full)</span>
                  <button
                    onClick={() => toggleRolePerm('admin')}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-display tracking-wider border transition-colors ${
                      rolePerms.includes('admin') ? 'bg-amber-600/20 text-amber-400 border-amber-500/40' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {rolePerms.includes('admin') ? 'On' : 'Off'}
                  </button>
                </div>
                {GRANULAR_PERMISSIONS.map(({ key, label }) => {
                  const level = getPermissionLevel(rolePerms, key);
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="font-body text-xs text-muted-foreground">{label}</span>
                      <button
                        onClick={() => cycleRolePerm(key)}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-display tracking-wider border transition-colors ${LEVEL_COLORS[level]}`}
                      >
                        {LEVEL_LABELS[level]}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 font-display text-xs" onClick={() => setRoleModal(null)}>Cancel</Button>
            <Button className="flex-1 font-display text-xs" onClick={saveRole}>
              {roleModal?.mode === 'edit' ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default StaffAccessManager;
