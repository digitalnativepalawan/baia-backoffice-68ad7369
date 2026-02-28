

## Add WhatsApp and Messenger Send Buttons to Task List

### What This Does
When you create or view a task in the Tasks section, each task will have both a **Messenger** button and a **WhatsApp** button. Tapping either one opens the respective app with a pre-formatted message containing the task details (title, description, due date) ready to send to that employee.

### Changes

#### 1. Pass full employee contact data to the Task List (`PayrollDashboard.tsx`)
- Currently the Tasks section only passes employee `id` and `name` -- it strips out contact info
- Update line 1155 to also pass `messenger_link`, `whatsapp_number`, `display_name`, and `active` so the send buttons can work

#### 2. Update the Task List Props to include WhatsApp (`EmployeeTaskList.tsx`)
- Add `whatsapp_number` to the employee interface in the Props type
- Add a green WhatsApp icon button next to the existing Messenger button on each task
- When tapped, it formats a message with the task title, description, and due date, then opens WhatsApp via `wa.me`
- The WhatsApp button is disabled if the employee has no WhatsApp number configured

#### 3. Use existing messenger utilities (`src/lib/messenger.ts`)
- Reuse the existing `openWhatsApp` helper already in the codebase -- no new utility code needed

### How It Works
1. Admin goes to Team, taps Tasks
2. Each task shows a Messenger icon (existing) and a new green WhatsApp icon
3. Tapping WhatsApp opens WhatsApp with: "Hi {name}, Task: {title} {description} Due: {date} -- {resort} Admin"
4. Tapping Messenger works as before (copies message to clipboard and opens Messenger)
5. Buttons are grayed out if the employee has no WhatsApp number or Messenger link configured

### Files to Update
1. `src/components/admin/PayrollDashboard.tsx` -- pass full employee data to EmployeeTaskList
2. `src/components/employee/EmployeeTaskList.tsx` -- add `whatsapp_number` to props, add WhatsApp send button

