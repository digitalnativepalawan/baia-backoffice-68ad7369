

## Plan: Comprehensive Role Templates & Multi-Position Staff

### What exists today
- `StaffAccessManager.tsx` already has built-in role templates, custom role CRUD via `staff_roles` table, and per-employee granular permission cycling
- Housekeeping template is **missing** from built-in templates
- Role templates are applied as a one-shot copy to `employee_permissions` — no concept of "assigned roles" persisted on the employee
- No way to assign multiple roles with auto-combined permissions

### Changes

#### 1. Update `BUILTIN_ROLE_TEMPLATES` in `StaffAccessManager.tsx`

Replace the existing templates object with the user's detailed permission sets. Add `housekeeping` template. Update all others (admin, gm, receptionist, chef, cook, bartender, cashier, tours, transportation, maintenance, landscaping) to use the granular `module:level` format specified. This is a straightforward data change in the constants at the top of the file.

#### 2. Add "Base Template" dropdown in Role Create/Edit modal

In the existing role creation dialog, add a `Select` above the permissions list that lets admins pick a built-in template to pre-fill the permission toggles. On selection, call `setRolePerms(BUILTIN_ROLE_TEMPLATES[key])`.

#### 3. Database: `employee_roles` junction table

Create a new table to track which roles are assigned to each employee:

```sql
CREATE TABLE employee_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  role_key TEXT NOT NULL,        -- 'builtin:receptionist' or 'custom:<uuid>'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, role_key)
);
ALTER TABLE employee_roles ENABLE ROW LEVEL SECURITY;
-- Public CRUD policies (matching app pattern)
```

No changes to the `employees` table itself. The existing `employee_permissions` table continues to store the effective flattened permissions.

#### 4. Multi-role UI in `StaffAccessManager.tsx`

Replace the single "Apply role template" dropdown with:
- A row of pill badges showing currently assigned roles (from `employee_roles`)
- An "+ Add Role" button that opens a dropdown of available roles
- Clicking × on a badge removes that role
- When roles change, auto-recalculate combined permissions (highest level wins per module) and write to `employee_permissions`

Permission combination logic:
```typescript
const levels = { off: 0, view: 1, edit: 2, manage: 3 };
// For each module, take the max level across all assigned role templates
```

#### 5. Files to edit

| File | Change |
|------|--------|
| `src/components/admin/StaffAccessManager.tsx` | Update templates, add base-template picker in modal, multi-role assignment UI, combination logic |
| Migration | Create `employee_roles` table with RLS |

### Not changing
- `lib/permissions.ts` — unchanged, still works on flat permission arrays
- `employee_permissions` table — still the source of truth for effective permissions
- Existing custom roles system — kept as-is, just enhanced

