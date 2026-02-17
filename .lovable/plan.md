

# Sirvoy Webhook Integration for Resort Ops

## Overview
Create a backend function that receives webhook callbacks from Sirvoy whenever a booking is created, modified, canceled, or restored. The function will automatically sync these events into your existing Reservations Ledger.

---

## How It Works

1. **Sirvoy sends a webhook** (JSON) to your backend whenever a booking changes
2. Your backend function processes the event and updates your database
3. The Reservations Ledger refreshes automatically

---

## What Gets Built

### 1. Backend Function: `sirvoy-webhook`
A new backend function that:
- Accepts POST requests from Sirvoy with booking JSON
- Responds to GET requests with `200 OK` (required health check)
- Handles all 4 event types: `new`, `modified`, `canceled`, `restored`

### 2. Database Changes
Add two new columns to the `resort_ops_bookings` table:
- `sirvoy_booking_id` (integer) -- links to Sirvoy's bookingId for deduplication
- `notes` (text) -- stores guest messages/comments

Add a new column to `resort_ops_guests`:
- `sirvoy_guest_ref` (text) -- stores Sirvoy's guest reference for matching

### 3. Event Handling Logic

| Sirvoy Event | Action |
|---|---|
| `new` | Create guest (if not exists) + create booking(s) for each room |
| `modified` | Update guest info + update booking dates/amounts/rooms |
| `canceled` | Delete the booking(s) associated with that Sirvoy booking |
| `restored` | Re-create the booking (same as `new`) |

### 4. Data Mapping (Sirvoy to Your System)

| Sirvoy Field | Your Field |
|---|---|
| `guest.firstName + lastName` | `resort_ops_guests.full_name` |
| `guest.phone` | `resort_ops_guests.phone` |
| `guest.email` | `resort_ops_guests.email` |
| `bookingSource` | `resort_ops_bookings.platform` (mapped: "Front desk" becomes "Direct") |
| `rooms[].arrivalDate` | `resort_ops_bookings.check_in` |
| `rooms[].departureDate` | `resort_ops_bookings.check_out` |
| `rooms[].roomTotal` | `resort_ops_bookings.room_rate` |
| `rooms[].adults` | `resort_ops_bookings.adults` |
| `totalPriceIncludingSurcharges - room totals` | `resort_ops_bookings.addons_total` (split across rooms) |
| `payments[].amount` (sum) | `resort_ops_bookings.paid_amount` |
| `rooms[].RoomName` | Matched to unit by name/type (G1/G2/G3) |

### 5. Room-to-Unit Matching
The function will match Sirvoy room names to your existing units:
- You will need to configure your Sirvoy room names to match **G1**, **G2**, or **G3** (or "Seaside 1 Cabin", "Seaside 2 Cabin", "Mountainview Family Room")
- If a room name doesn't match, the booking is still created but without a unit link

---

## Setup Steps (After Implementation)

1. The backend function URL will be available immediately after build
2. Go to **Sirvoy > Settings > Sirvoy account > Booking event webhook**
3. Add the webhook URL provided
4. All future bookings will sync automatically

---

## Technical Details

### Edge Function: `supabase/functions/sirvoy-webhook/index.ts`

- Public endpoint (no JWT verification needed -- it's called by Sirvoy's servers)
- Validates the incoming JSON structure
- Uses service role key to write to database (bypasses RLS)
- Platform mapping: `"Front desk"` -> `"Direct"`, `"Booking.com"` -> `"Booking.com"`, etc.
- For multi-room bookings, creates one `resort_ops_bookings` row per room
- Payment distribution: total payments split proportionally across rooms by room price
- Handles idempotency via `sirvoy_booking_id` -- re-processing the same booking won't create duplicates

### Database Migration SQL

```sql
ALTER TABLE resort_ops_bookings 
  ADD COLUMN IF NOT EXISTS sirvoy_booking_id integer,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';

ALTER TABLE resort_ops_guests 
  ADD COLUMN IF NOT EXISTS sirvoy_guest_ref text;

CREATE INDEX IF NOT EXISTS idx_bookings_sirvoy_id 
  ON resort_ops_bookings(sirvoy_booking_id);
```

### Config Update: `supabase/config.toml`

```toml
[functions.sirvoy-webhook]
verify_jwt = false
```

### No UI Changes
The existing Reservations Ledger already displays all the data this webhook writes. New bookings from Sirvoy will appear automatically on page refresh or next query refetch.

