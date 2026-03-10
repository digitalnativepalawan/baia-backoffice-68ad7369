

## Fix Stale Deleted Orders in Guest Bill + Add Bill Dispute System

### Problem 1: Deleted orders still show in guest portal
The guest bill's `room_transactions` query fetches by `booking_id` and `unit_id`. When staff deletes an order, the code removes linked `room_transactions` via `.delete().eq('order_id', orderId)`. However, the guest portal's realtime subscription only listens for changes filtered by `booking_id` — if the deleted transaction had a `null` booking_id (fetched via the `byUnit` fallback query on line 998), the realtime event won't trigger a cache refresh. Additionally, the `DELETE` event from postgres_changes may not fire for rows that no longer match the filter. Fix: invalidate all bill-related queries on any `room_transactions` or `orders` change, and broaden realtime listeners.

### Problem 2: No way for guest to contest the bill
Currently the guest can only "Agree." If a charge is wrong, the guest has no mechanism to flag it. Need a "Contest Bill" button that opens a form where the guest describes the issue, which creates a record visible to reception/admin. Reception can then respond with a resolution message.

### Changes

**1. New `bill_disputes` table** (database migration)
```sql
CREATE TABLE public.bill_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  room_id uuid,
  unit_name text NOT NULL DEFAULT '',
  guest_name text NOT NULL DEFAULT '',
  guest_message text NOT NULL DEFAULT '',
  staff_response text NOT NULL DEFAULT '',
  responded_by text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',  -- open, resolved, dismissed
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.bill_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bill_disputes" ON public.bill_disputes FOR SELECT TO public USING (true);
CREATE POLICY "Public insert bill_disputes" ON public.bill_disputes FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update bill_disputes" ON public.bill_disputes FOR UPDATE TO public USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.bill_disputes;
```

**2. `src/pages/GuestPortal.tsx` — BillView**
- Add realtime listener for `bill_disputes` table filtered by `booking_id`
- Broaden existing realtime listeners to also invalidate on DELETE events properly (remove filter restriction on `room_transactions` listener so it catches all changes for this unit)
- Add "Contest This Bill" button next to "I Agree to This Bill"
- When tapped, show a textarea modal for the guest to describe the issue (e.g., "I was charged for Pancakes but never received them")
- Insert into `bill_disputes` with `guest_name`, `booking_id`, `room_id`, `unit_name`, `guest_message`
- Show existing open disputes with their status and any staff response
- Once staff responds, show the response message to the guest. If resolved, guest can then agree.

**3. `src/components/rooms/RoomBillingTab.tsx` — Staff dispute panel**
- Query `bill_disputes` for the current booking
- Show alert banner when there's an open dispute with the guest's message
- Add a response form: text input + "Resolve" / "Dismiss" buttons
- On submit, update `bill_disputes` with `staff_response`, `responded_by` (staff name), `status`, `resolved_at`
- Log to `audit_log`

**4. `src/pages/ReceptionPage.tsx` — Dispute notification**
- In the guest card or action required section, show a badge/alert when any current guest has an open bill dispute
- Quick link to open the guest's Details (RoomsDashboard) billing tab to respond

### Files to Edit
1. Database migration — create `bill_disputes` table with RLS and realtime
2. `src/pages/GuestPortal.tsx` — Add contest button, dispute form, display disputes and staff responses, fix stale cache
3. `src/components/rooms/RoomBillingTab.tsx` — Show disputes, add response form
4. `src/pages/ReceptionPage.tsx` — Show dispute alerts on guest cards

