

## Plan: Split Order Permissions — "Take Order" vs "Pipeline Control"

### Problem
Currently, any staff with `orders:edit` or `kitchen:edit`/`bar:edit` can both place orders AND advance the pipeline (Preparing → Ready → Served → Paid). The admin needs to give someone like Jessa the ability to take orders and send them, but NOT let her move orders through preparation stages — only designated kitchen/bar staff should do that.

### Design Decision

Use the existing 3-level permission cycle for `orders` (already supported but not enforced):

| Level | Can Do |
|-------|--------|
| **View** | See orders only |
| **Edit** | Place/take orders, ring up items, send to kitchen/bar |
| **Manage** | Edit + advance pipeline (Start Preparing, Mark Ready, Mark Served, Mark Paid) |

Add `orders` to the `THREE_LEVEL_SECTIONS` set so the cycle becomes Off → View → Edit → Manage → Off.

### Changes

**1. `src/components/admin/StaffAccessManager.tsx`**
- Add `'orders'` to `THREE_LEVEL_SECTIONS` so admins can set the Manage level.
- Update the help text to mention Orders alongside Reception/Experiences for the 4-state cycle.

**2. `src/components/DepartmentOrdersView.tsx`**
- The `canAct` check currently uses `canEdit(perms, department)`. Add an additional check: pipeline actions (Start Preparing, Mark Ready) should require `canManage(perms, 'orders')` OR `canEdit(perms, department)` (kitchen/bar edit). Staff with only `orders:edit` should NOT see pipeline buttons here.

**3. `src/components/service/ServiceOrderCard.tsx`**
- Kitchen/bar pipeline actions (`kitchen-start`, `kitchen-ready`, `bar-start`, `bar-ready`) already require `canEdit(perms, 'kitchen')` or `canEdit(perms, 'bar')` — this is correct and stays.
- `canServe` (Mark Served / Mark Paid) currently allows anyone with `canEdit(perms, 'reception')` or `canEdit(perms, 'kitchen')` or `canEdit(perms, 'bar')`. Add `canManage(perms, 'orders')` as an alternative qualifier, and ensure staff with only `orders:edit` (no kitchen/bar/reception edit) cannot hit Served/Paid.
- Import `canManage` from permissions.

**4. `src/lib/permissions.ts`**
- No structural changes needed — `canManage` already exists and works.

**5. Built-in role templates** (`StaffAccessManager.tsx`)
- Update role templates to use the new level:
  - `receptionist`: change `'orders:view'` → `'orders:manage'` (receptionists need full pipeline)
  - `cook`/`bartender`: keep `'orders:view'` (they use kitchen/bar edit, not orders pipeline)
  - `chef`: change `'orders:edit'` → `'orders:manage'`

### Files to Edit

```
EDIT  src/components/admin/StaffAccessManager.tsx  — Add 'orders' to THREE_LEVEL_SECTIONS, update role templates
EDIT  src/components/DepartmentOrdersView.tsx      — Gate pipeline buttons behind canManage('orders') or canEdit(department)
EDIT  src/components/service/ServiceOrderCard.tsx   — Gate Served/Paid behind canManage('orders') or department edit
```

### Summary for Jessa's Case
- Admin sets Jessa's Orders to **Edit** → she can place orders, send to kitchen
- Admin sets Chef's Kitchen Display to **Edit** + Orders to **Manage** → chef can advance pipeline
- Admin sets Bartender's Bar Display to **Edit** → bartender can advance bar pipeline
- Jessa never sees "Start Preparing", "Mark Ready", "Mark Served", or "Mark Paid" buttons

