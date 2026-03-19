

## Plan: Fix Schedule Delete & Enhance Task/Assignment Scheduling

### Issues Found

1. **Delete button bug**: The trash icon on shift blocks triggers `setDeleteId(s.id)`, but the parent div's `onClick={() => openEdit(s)}` fires simultaneously despite `stopPropagation`. On mobile, the tiny button (3x3 icon) is nearly impossible to tap. The AlertDialog `onOpenChange={() => setDeleteId(null)}` also races with the confirm action.

2. **Missing scheduling features**: The schedule only manages time shifts. There's no way to assign tasks like housecleaning, reception duty, or track completion from within the schedule view.

### Changes

**1. Fix Delete Button** (`WeeklyScheduleManager.tsx`)
- Make `confirmDelete` capture `deleteId` before the dialog closes by saving it in a ref or local variable
- Increase touch target size for edit/delete buttons on shift blocks
- Prevent edit modal from opening when clicking edit/delete icons (the `stopPropagation` exists but the parent click handler on the entire timeline area also fires)

**2. Add Task/Assignment Creation from Schedule** (`WeeklyScheduleManager.tsx`)
- Add an "Assign Task" button alongside "Add Shift" 
- New modal to create a task assignment: select employee, pick type (Housecleaning, Reception, Custom), set date/time, add notes
- For housecleaning: select a room/unit to clean, auto-creates a `housekeeping_orders` entry assigned to the selected employee
- For other tasks: creates an `employee_tasks` entry with due date and description
- Tasks appear as colored pills on the timeline (already partially implemented)

**3. Show Completion Info on Task Detail** (`WeeklyScheduleManager.tsx`)
- In the task detail dialog, show who completed the task and when (`completed_at`)
- For housekeeping pills, show completion status (`cleaning_completed_at`, `completed_by_name`)
- Make housekeeping pills clickable to show full details (room, status, who inspected/cleaned)

**4. Enhance Task Detail Dialog** (`WeeklyScheduleManager.tsx`)
- Add edit capability: change title, description, due date, reassign to different employee
- Add delete capability for tasks
- Show completion audit trail

### Files to Edit
- `src/components/admin/WeeklyScheduleManager.tsx` — all changes in this single file

