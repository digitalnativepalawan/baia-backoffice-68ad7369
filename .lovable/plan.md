
## The Problem

Line 218 in `ActionRequiredPanel.tsx`:
```tsx
{task.status === 'in_progress' ? 'Continue' : 'Start Task'}
```

This label is shown to **everyone** regardless of who the task belongs to. Ron (admin) sees David's task and sees "Start Task" — implying Ron should do David's work. That's wrong.

The button logic should be:

| Viewer | Task belongs to them | Button |
|---|---|---|
| Admin | No | **Manage** |
| Admin | Yes | **Start Task** / **Continue** |
| Staff | Yes (always) | **Start Task** / **Continue** |

The button text for admins viewing **someone else's** task should be **"Manage"** — it navigates to the task board where the admin can comment, reassign, or update status, but it doesn't imply the admin is doing the task themselves.

## Fix — One file, one condition

**`src/components/staff/ActionRequiredPanel.tsx`**

1. Read `empId` from `localStorage` inside the render loop (it's already fetched in `useEffect`, just needs to be lifted to state or passed down)
2. Store `isAdmin` and `currentEmpId` in component state after the session read
3. In the button label logic, check if the task is assigned to the current user:

```tsx
const isMyTask = task.employee_id === currentEmpId;
const buttonLabel = isMyTask
  ? (task.status === 'in_progress' ? 'Continue' : 'Start Task')
  : 'Manage';
```

4. Admin's "Manage" button uses `variant="outline"` to visually differentiate it from action buttons (which are solid primary/destructive)

No other files need to change. The navigation destination stays `/employee-portal` for all buttons — the admin naturally lands on the full task board where they can comment, reassign, and track all tasks.
