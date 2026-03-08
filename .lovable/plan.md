

## Plan: Fix Schedule Delete & Add Multi-Day Shift Creation

### Problems Identified

1. **Delete race condition**: In `DeleteConfirm`, `AlertDialogAction`'s `onClick` fires after `onOpenChange` already sets `deleteId` to `null`. So `onConfirm(deleteId)` passes `null`. The shift never gets deleted.

2. **Tedious schedule entry**: To give one employee the same shift Mon–Sun, admin must create 7 individual shifts. There's no way to select multiple days at once.

### Changes (single file: `WeeklyScheduleManager.tsx`)

**Fix 1: Delete reliability**
- In `DeleteConfirm`, capture `deleteId` in a ref so the confirm handler always has the correct value, even if React state clears first. Same pattern already used for `deleteTaskId` (line 542-543).

**Fix 2: Multi-day shift creation with checkboxes**
- In the `ShiftModal` (Add mode only), replace the single date picker with a row of 7 day-of-week checkboxes (Mon, Tue, Wed...) pre-checked for the selected day.
- Add an "All Week" toggle button to quickly check all 7 days.
- On save, insert one shift per checked day (batch insert).
- Edit mode keeps the single date picker (editing one shift at a time).
- The `shiftForm` state gets a new `selected_days: string[]` array holding `yyyy-MM-dd` strings of checked days.

### Files to Edit
- `src/components/admin/WeeklyScheduleManager.tsx`

