

# Employee Messenger Setup in Admin Settings

## Overview
Add centralized employee contact configuration in the Admin Settings tab, a reusable messenger send utility, and "Send to Employee" buttons in the Task module.

## Database Changes

### Migration: Add `preferred_contact_method` column to `employees` table
- Add `preferred_contact_method text NOT NULL DEFAULT 'messenger'` to the `employees` table
- The existing `messenger_link` column already stores Facebook profile URLs

No other schema changes needed -- the `employees` table already has `messenger_link`, `display_name`, `name`, `active`, etc.

## New Component: `EmployeeContactConfig.tsx`

Create `src/components/admin/EmployeeContactConfig.tsx`:
- Section titled "Employee Contact Configuration" placed in the Admin Settings tab
- Fetches all employees (active and inactive)
- Displays an editable card/list for each employee with:
  - Full Name (read-only display)
  - Facebook Profile URL (editable Input, maps to `messenger_link`)
  - Preferred Contact Method (Select dropdown: Messenger, WhatsApp, SMS)
  - Active Toggle (Switch)
  - Save button per row (auto-saves on change)
- Admin can inline-edit the Facebook URL and preferred contact method
- No add/delete employees here (that's handled in Payroll) -- just contact config editing

## New Utility: `src/lib/messenger.ts`

Create a reusable `sendMessengerMessage` function:

```text
sendMessengerMessage(employee, messageContent, resortName)
  1. Check if employee.messenger_link is empty -> toast error "No Messenger link configured"
  2. Check if employee.active is false -> toast error "Employee is inactive"
  3. Format message: "Hi {name},\n{messageContent}\n\n-- {resortName} Admin"
  4. URL-encode message
  5. Open https://m.me/{messenger_link} in new tab
     (The messenger_link field stores the Facebook username/ID)
  6. Toast info: "Messenger opened -- paste and send your message"
```

Note: Facebook Messenger deep links don't support pre-filled text via URL params for m.me links. The function will open the Messenger conversation and copy the formatted message to clipboard so admin can paste it.

## Integration: Task Module "Send to Employee" Button

In `EmployeeTaskList.tsx`:
- Add a small "Send" (MessageCircle icon) button on each task card
- When clicked, calls `sendMessengerMessage()` with the task title + description as the message content
- Button is disabled if the employee is inactive
- Looks up the employee from the employees list to get their messenger_link

## Admin Settings Tab Update

In `AdminPage.tsx` Settings tab:
- Import and render `<EmployeeContactConfig />` after `<StaffAccessManager />`

## Technical Details

### Files Created
- `src/components/admin/EmployeeContactConfig.tsx` -- contact config editor
- `src/lib/messenger.ts` -- reusable send function

### Files Modified
- `src/components/employee/EmployeeTaskList.tsx` -- add Send button per task
- `src/pages/AdminPage.tsx` -- add EmployeeContactConfig to Settings tab
- Database migration: add `preferred_contact_method` column

### Design
- Mobile-first, consistent with existing admin UI patterns (font-display, font-body, border-border, bg-secondary)
- Send button disabled for inactive employees
- No auto-send, no API tokens -- manual trigger only
- Clipboard copy of formatted message for pasting into Messenger

