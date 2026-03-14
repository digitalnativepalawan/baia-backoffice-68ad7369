

## Plan: Add 5 New Role Templates & Display Staff Position Badges

### 1. Add new role templates to `BUILTIN_ROLE_TEMPLATES` (line 17-61)

Add these 5 entries and rename `tours` to `toursManager`:

| Key | Label | Core Permissions |
|-----|-------|-----------------|
| `waiters` | Waiters | orders:edit, kitchen:view, bar:view, rooms:view, schedules:view, timesheet:edit |
| `kitchenHelper` | Kitchen Helper | kitchen:view, orders:view, inventory:view, tasks:edit, schedules:view, timesheet:edit |
| `toursManager` | Tours Manager | experiences:manage, reports:view, inventory:view, orders:view, reception:view, schedules:edit, tasks:edit, resort_ops:view, rooms:view, documents:view, timesheet:edit |
| `fbManager` | F&B Manager | orders:manage, kitchen:manage, bar:manage, inventory:manage, menu:edit, reports:view, schedules:edit, tasks:edit, timesheet:manage, rooms:view, reception:view, resort_ops:view, experiences:view, setup:view, documents:view |
| `assistantGM` | Assistant GM | orders:manage, kitchen:edit, bar:edit, housekeeping:edit, reception:manage, experiences:manage, reports:view, inventory:view, payroll:view, resort_ops:edit, rooms:manage, schedules:edit, setup:view, tasks:manage, timesheet:manage, documents:view |

Keep old `tours` key for backward compatibility (existing employee_roles may reference `builtin:tours`).

### 2. Update `BUILTIN_ROLE_LABELS` (line 63-76)

Add the 5 new labels. Keep `tours: 'Tours'` for backward compat but also add the new keys.

### 3. Display role badges in employee list

The employee list already shows role pills (lines 416-454). This is working. The only enhancement needed is to show role badges next to the employee name line itself for quick visibility. Update the employee name row (line 411-413) to inline the role badges next to the name for a cleaner display.

### File to edit

| File | Change |
|------|--------|
| `src/components/admin/StaffAccessManager.tsx` | Add 5 new entries to `BUILTIN_ROLE_TEMPLATES`, add 5 entries to `BUILTIN_ROLE_LABELS`, move role badges inline with employee name |

### No database changes needed
The `employee_roles` table already stores `role_key` as text — new builtin keys like `builtin:waiters` work immediately.

