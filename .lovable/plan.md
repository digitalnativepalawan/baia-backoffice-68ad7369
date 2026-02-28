

## Auto-Send Tasks via WhatsApp/Messenger on Save

### Problem 1: Facebook Messenger Links Are Broken
The Messenger link field stores full Facebook URLs like `https://www.facebook.com/davidlesmith`, but the code wraps it again as `https://m.me/https://www.facebook.com/...` -- resulting in a broken URL. We need to handle both formats: if someone enters a full URL, extract the username; if they enter just a username, use it directly.

### Problem 2: Tasks Don't Auto-Send
Currently, after creating a task, the admin has to manually tap a send button. The user wants: **save the task and it automatically sends to the employee** via their preferred contact method (WhatsApp or Messenger).

### Changes

#### 1. Fix Messenger URL handling (`src/lib/messenger.ts`)
- Update `sendMessengerMessage` to detect if the link is already a full Facebook URL
- If the value starts with `http` or contains `facebook.com`, extract the username and build a proper `m.me` link
- If it's just a username, use it as-is with `m.me`
- This fixes the broken Messenger links for David and James

#### 2. Auto-send task on save (`src/components/employee/EmployeeTaskList.tsx`)
- After the task is successfully inserted into the database, automatically trigger the send
- Look up the assigned employee's `preferred_contact_method`
- If "whatsapp" and they have a WhatsApp number: call `openWhatsApp` with the task message
- If "messenger" and they have a Messenger link: call `sendMessengerMessage` with the task message
- Fall back to whichever method has data configured if the preferred one is missing
- Pass `preferred_contact_method` in the employee prop from `PayrollDashboard.tsx`

#### 3. Pass preferred contact method to task list (`src/components/admin/PayrollDashboard.tsx`)
- Add `preferred_contact_method` to the employee data passed to `EmployeeTaskList`

### How It Works
1. Admin goes to Team > Tasks, fills in a task for David
2. Hits Save
3. Task is saved to the database
4. App automatically opens WhatsApp or Messenger (based on David's preferred method) with the task details pre-filled
5. Admin just hits send in the messaging app

### Files to Update
1. `src/lib/messenger.ts` -- fix Facebook URL parsing for Messenger links
2. `src/components/employee/EmployeeTaskList.tsx` -- add auto-send after task save, add `preferred_contact_method` to props
3. `src/components/admin/PayrollDashboard.tsx` -- pass `preferred_contact_method` to EmployeeTaskList
