

# Employee Portal: Contact Info, Personal Login, Tasks System

## Overview

Transform the employee system from a shared clock-in page into a full employee portal where each employee logs in with their name + password, and gets access to their own dashboard with clock in/out, tasks, payments, and bonuses. Also add phone/messenger contact fields and a task management system for both admin and employees.

## Database Changes

### 1. Alter `employees` table

Add columns:
- `phone` (text, default '') -- phone number
- `messenger_link` (text, default '') -- FB Messenger link/username
- `password_hash` (text, default '') -- simple PIN/password (hashed)
- `display_name` (text, default '') -- changeable display name (login still uses original name)

### 2. New table: `employee_tasks`

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| employee_id | uuid | NOT NULL |
| title | text | NOT NULL |
| description | text | '' |
| status | text | 'pending' |
| due_date | timestamptz | NULL |
| completed_at | timestamptz | NULL |
| created_by | text | 'admin' |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

`status` values: `'pending'`, `'in_progress'`, `'completed'`
`created_by` values: `'admin'` or `'employee'`

RLS: Public read/insert/update/delete (matching existing pattern).

### 3. Password hashing approach

Since this is a resort staff tool (not auth-level security), we'll use a simple approach: store a bcrypt-hashed PIN via an edge function that handles login verification. The employee "logs in" by selecting their name and entering their PIN. The edge function verifies the PIN and returns employee data. No Supabase Auth needed -- this is a lightweight staff access system.

## New Edge Function: `employee-auth`

Handles:
- **POST /set-password**: Hash and store a PIN for an employee (admin action)
- **POST /verify**: Verify employee name + PIN, return employee record

Uses bcrypt from Deno standard library. Stores hashed password in `employees.password_hash`.

## File Changes

### 1. Admin: `PayrollDashboard.tsx` -- Employee Contact Fields

In the Employees sub-view:
- Add phone number input field when adding/editing employees
- Add Messenger link input field when adding/editing employees
- Add "Set PIN" button per employee to set their login password
- Display phone and messenger icons next to employee names
- Show quick-action links to call/message employees

### 2. New page: `src/pages/EmployeePortal.tsx`

Full employee self-service portal with:

**Login screen** (when not authenticated):
- Select name from dropdown of active employees
- Enter PIN
- Calls `employee-auth/verify` edge function
- Stores session in localStorage (employee_id + name)

**Dashboard** (after login, tabbed layout):
- **Clock In/Out** tab: Same clock-in/out functionality as current EmployeePage but for the logged-in employee only
- **My Tasks** tab: View assigned tasks, mark complete, add own tasks with due date/time
- **My Pay** tab: View shift history, payments, bonuses
- **Settings** tab: Change display name, view own info

### 3. Update `src/pages/EmployeePage.tsx`

Redirect to `/employee-portal` (the new page). Keep the old page as a redirect for backward compatibility.

### 4. New component: `src/components/employee/EmployeeTaskList.tsx`

Task list component used in both admin and employee views:
- List tasks with title, description, due date, status
- Add new task form (title, description, due date+time)
- Edit task inline
- Delete task
- Mark as completed (sets completed_at timestamp)
- Filter by status (all/pending/completed)

### 5. Admin: `PayrollDashboard.tsx` -- Tasks Sub-View

Add a new "Tasks" sub-view tab in PayrollDashboard:
- View all tasks across all employees
- Assign tasks to specific employees
- Add/edit/delete tasks with due date and time
- See completion status
- Filter by employee and status

### 6. Update `src/App.tsx`

- Add route `/employee-portal` for the new EmployeePortal page
- Keep `/employee` route pointing to redirect

### 7. Edge function: `supabase/functions/employee-auth/index.ts`

Two endpoints:
- `POST` with `action: 'set-password'`: Takes employee_id + pin, hashes with bcrypt, stores in employees.password_hash
- `POST` with `action: 'verify'`: Takes employee name + pin, finds employee, verifies bcrypt hash, returns employee data

## Technical Notes

- Employee login is lightweight (name + PIN), not full Supabase Auth. This is appropriate for a resort staff tool where the admin manages all accounts.
- The PIN is stored as a bcrypt hash for security.
- Employee session is stored in localStorage with the employee's ID -- simple but sufficient for this use case.
- Tasks have a `created_by` field so we can distinguish admin-assigned vs self-created tasks.
- The `due_date` is a timestamptz so it includes both date and time of expected completion.
- Phone and messenger fields enable the admin to quickly contact employees directly from the dashboard.

