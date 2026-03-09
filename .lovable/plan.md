

## Plan: Add "Guest Services" Tab to Admin Dashboard

### Problem
Transport bookings, bike rentals, messages, and towel/linen requests are only visible per-room inside the billing tab. There's no centralized admin view to see and manage all pending guest service requests across all rooms at once.

### Solution
Embed the existing `ExperiencesPage` component (which already queries all tours, transport, and rental requests across rooms) as a new tab in the Admin dashboard. The ExperiencesPage already supports `embedded` mode and handles confirm/cancel/complete actions.

Additionally, the ExperiencesPage currently filters out "Message" and "Towels & Linens" type requests. We need to include ALL request types so admin can manage everything from one place.

### Changes

**1. `src/pages/AdminPage.tsx`**
- Add "Guest Services" as a new tab option (icon: Palmtree or ConciergeBell)
- Render the existing `ExperiencesPage embedded` component when this tab is active
- Place it logically near Rooms/Resort Ops tabs

**2. `src/pages/ExperiencesPage.tsx`**
- Currently only shows requests with types containing "transport" or "rent/scooter/bike" icons — but it already fetches ALL `guest_requests` with pending/confirmed status
- No filter by request_type exists, so Messages and Towels requests are already included in the query
- Add icon support for "Message" and "Towels" request types in `getRequestIcon`
- This makes the Experiences page a true "Guest Services" hub

### Files
```
EDIT  src/pages/AdminPage.tsx         — Add "Guest Services" tab rendering ExperiencesPage embedded
EDIT  src/pages/ExperiencesPage.tsx   — Add icons for Message/Towels request types
```

