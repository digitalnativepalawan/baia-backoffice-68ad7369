

## Fix: Single Login Across All Pages

### Problem
The home page login stores credentials in `sessionStorage` (`staff_home_session`), but the Employee Portal and Manager page look for credentials in `localStorage` (`emp_id` / `emp_name`). This forces employees to log in twice.

### Solution
When a user logs in on the home page, also write their credentials to `localStorage` so the Employee Portal and Manager page recognize them automatically.

### Changes

#### 1. `src/pages/Index.tsx`
- After a successful login, also write `emp_id` and `emp_name` to `localStorage` so the Employee Portal and Manager page pick them up without requiring a second login.
- On logout, also clear `emp_id` and `emp_name` from `localStorage`.

#### 2. `src/pages/EmployeePortal.tsx`
- On mount, check for `staff_home_session` in `sessionStorage`. If it exists and is valid, auto-populate `localStorage` with `emp_id` and `emp_name` so the portal recognizes the user immediately without a second login.

### No database or backend changes needed
Jessa's data is correct: she has a PIN set and permissions for Orders and Rooms. The Manager page already correctly filters tabs based on permissions -- so once she can get there without a double login, she will only see Orders and Rooms tabs.

