

# Employee Access Control + Room Guest Dashboard

## Overview
Two major features: (1) a per-tab permission system so you can control which admin tabs each employee can access, and (2) a comprehensive room/unit guest dashboard showing all guest information in one place.

---

## Part 1: Employee Access Control

### How it works
- New "Staff Access" section in the Admin Setup tab
- For each employee, you toggle which tabs they can see: Orders, Menu, Reports, Inventory, Payroll, Resort Ops, and the new Rooms dashboard
- When an employee logs in via the Employee Portal, they get a "Manager View" button that opens a restricted version of the admin dashboard showing only their permitted tabs
- You (James) keep full admin access to everything

### Database changes
- New `employee_permissions` table:
  - `id` (uuid), `employee_id` (uuid), `permission` (text -- e.g. 'orders', 'menu', 'reports', 'inventory', 'payroll', 'resort_ops', 'rooms'), `created_at`
  - Unique constraint on (employee_id, permission)
  - Public RLS (matching existing pattern)

### UI changes
- **Admin Setup tab**: New "Staff Access" section with a grid showing each employee and toggle switches for each permission
- **Employee Portal**: If an employee has any permissions, show a "Dashboard" tab that loads a filtered version of the admin page showing only their allowed tabs
- New route `/manager` that checks employee permissions from localStorage employee ID and renders only permitted tabs

---

## Part 2: Room/Unit Guest Dashboard

### How it works
- New "Rooms" tab in the admin dashboard (and available to permitted employees)
- Shows all units as cards. Click a unit to see its full guest profile:
  - Current booking info (guest name, check-in/out, platform)
  - All orders made by that room (pulled from `orders` table where `location_detail` matches the unit name and `order_type = 'Room'`)
  - Guest notes and special requests
  - Passport/ID scans (uploaded images)
  - Tour bookings

### Database changes
- New `guest_documents` table for passport/ID uploads:
  - `id`, `guest_id` (uuid, references resort_ops_guests), `document_type` (text -- 'passport', 'id', 'other'), `image_url` (text), `notes` (text), `created_at`
- New `guest_notes` table for special requests and notes:
  - `id`, `booking_id` (uuid), `unit_name` (text), `note_type` (text -- 'request', 'allergy', 'preference', 'general'), `content` (text), `created_by` (text), `created_at`
- New `guest_tours` table for tour bookings:
  - `id`, `booking_id` (uuid), `tour_name` (text), `tour_date` (date), `pax` (integer), `price` (numeric), `status` (text -- 'booked', 'completed', 'cancelled'), `notes` (text), `created_at`
- Storage bucket `guest-documents` for passport/ID image uploads

### UI: Room Dashboard page
- Grid of unit cards showing current guest (if any) and occupancy status
- Click a unit to open a detail view with tabs:
  - **Guest Info**: Current booking details, guest name, check-in/out dates
  - **Orders**: All food/drink orders for this room, with timestamps and items
  - **Documents**: Upload and view passport/ID scans (camera or file upload)
  - **Notes**: Add/view special requests, allergies, preferences
  - **Tours**: Add/view booked tours and activities

---

## Technical Details

### Files to create
- `src/components/admin/StaffAccessManager.tsx` -- permission toggles UI
- `src/components/admin/RoomsDashboard.tsx` -- rooms overview + detail view
- `src/pages/ManagerPage.tsx` -- restricted admin view for permitted employees

### Files to modify
- `src/pages/AdminPage.tsx` -- add Rooms tab, add Staff Access section in Setup
- `src/pages/EmployeePortal.tsx` -- add Dashboard button for employees with permissions
- `src/App.tsx` -- add `/manager` route

### Database migrations
1. Create `employee_permissions` table with RLS
2. Create `guest_documents` table with RLS
3. Create `guest_notes` table with RLS
4. Create `guest_tours` table with RLS
5. Create `guest-documents` storage bucket

### Implementation order
1. Database tables and storage bucket
2. Staff Access Manager component + Admin Setup integration
3. Room Dashboard component
4. Manager Page with permission filtering
5. Employee Portal integration

