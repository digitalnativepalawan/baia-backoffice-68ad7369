
Goal: upgrade the existing admin reservation bulk import in-place so it accepts both the simplified template and the real Cloudbeds export CSV, while keeping Reception, guests, rooms, and Housekeeping behavior intact.

What I found
- The existing importer already lives in the correct place: `src/components/admin/ImportReservationsModal.tsx`, used by `src/components/admin/ResortOpsDashboard.tsx`.
- Right now it is fixed-index based and only supports the old simple CSV:
  - template header is `Guest Name,Units,Guests,Platform,Check In,Check Out,Price Per Night,Paid So Far Realized,Notes`
  - dates are parsed as `mm/dd/yyyy`
  - room/unit names must already exist
  - it inserts only minimal booking fields
- Reception/Rooms logic depends on this mapping:
  - display rooms are in `units`
  - operational bookings point to `resort_ops_units`
  - matching is case-insensitive by normalized room name
  - active same-day bookings drive occupancy and housekeeping behavior in `ReceptionPage`, `RoomsDashboard`, and `MorningBriefing`

Implementation plan
1. Replace the current importer logic inside `ImportReservationsModal.tsx` instead of creating a new flow.
2. Change the downloadable template to your exact simplified Cloudbeds-style header row.
3. Rebuild CSV parsing to be header-based:
   - read the first row
   - normalize header labels
   - resolve values through aliases instead of hardcoded positions
   - support both the short template and the larger export with extra guest/document/address columns
4. Change date parsing from the current US format to `dd/mm/yyyy` for import files.
5. Expand parsed row data to include:
   - name, email, phone
   - reservation number / third-party confirmation
   - adults, children
   - room number, room type
   - amount paid, accommodation total, grand total, deposit, balance due
   - source, status, country, reservation date
   - raw row payload for traceability
6. Update validation rules:
   - require guest name, check-in, check-out, and room number
   - require check-out after check-in
   - auto-deselect cancelled rows
   - support multi-room values like `COT(1), COT(2)`
   - flag duplicates by reservation number / external reference and skip them
7. Upgrade import behavior:
   - find or create guest by normalized name, then update email/phone if provided
   - find or create `resort_ops_units` by normalized room name
   - find or create matching display `units` entry by normalized room name so Reception/Housekeeping can use it
   - insert one booking per room for multi-room rows
   - store source / external reservation id / extra raw metadata in existing booking fields where supported
8. Add same-day operational sync after each imported room:
   - if booking is active today, set matching display room status to `occupied`
   - do not create housekeeping orders on import
   - preserve existing check-in/checkout and checkout-to-housekeeping flows
9. Keep the admin UX pattern:
   - template download
   - upload
   - preview rows
   - inline validation errors
   - status badge
   - source badge
   - select/deselect valid rows
   - bulk import summary with imported/skipped/errors
10. Revalidate the same existing query keys after import so the admin view, Reception, and room views refresh correctly.

Files to update
- `src/components/admin/ImportReservationsModal.tsx` — main upgrade
- Possibly a tiny shared helper only if needed for room-name normalization; otherwise keep logic local to avoid ripple effects
- No duplicate modal, no duplicate route, no replacement of Reception/Rooms logic

Compatibility safeguards
- Keep using existing tables and fields; no schema change is required for the requested upgrade.
- Reuse existing room matching convention: case-insensitive trimmed room-name matching between `units` and `resort_ops_units`.
- Do not change current manual reservation, walk-in, check-in, checkout, or housekeeping order creation behavior.
- Duplicate handling will follow your preference: existing reservation numbers should be skipped.
- Cancelled CSV rows will be visible in preview but deselected and non-importable.

Technical details
- Current app already has useful booking fields available:
  - `resort_ops_bookings.source`
  - `resort_ops_bookings.external_reservation_id`
  - `resort_ops_bookings.external_data`
  - guest `email` and `phone`
- Header aliases to implement:
  - `guestName: Name`
  - `email: Email`
  - `phone: Phone Number | Mobile`
  - `reservationNumber: Reservation Number`
  - `thirdPartyConfirmation: Third Party Confirmation Number`
  - `adults: Adults`
  - `children: Children`
  - `roomNumber: Room Number`
  - `accommodationTotal: Accommodation Total`
  - `amountPaid: Amount Paid`
  - `checkIn: Check in Date`
  - `checkOut: Check out Date`
  - `nights: Nights`
  - `roomType: Room Type`
  - `grandTotal: Grand Total`
  - `deposit: Deposit`
  - `balanceDue: Balance Due`
  - `reservationDate: Reservation Date`
  - `source: Source`
  - `status: Status`
  - `country: Country`
- Import mapping I would use:
  - booking `platform`: normalized from `Source`
  - booking `source`: original source text
  - booking `external_reservation_id`: reservation number, fallback to third-party confirmation
  - booking `paid_amount`: amount paid
  - booking `room_rate`: derive per-room nightly rate primarily from `Accommodation Total / Nights / room count`, fallback safely to available totals
  - booking `notes`: compact summary of imported metadata
  - booking `external_data`: raw import metadata for future debugging/reference
- Same-day room sync will follow existing occupancy logic:
  - active booking = `check_in <= today && check_out > today`
  - matching display `units.status` becomes `occupied` for imported active stays

Validation/testing plan
- Test with:
  1. the simplified downloadable template
  2. the uploaded single-row sample
  3. the larger Cloudbeds export sample
  4. a cancelled row
  5. a duplicate reservation number
  6. a multi-room row like `COT(1), COT(2)`
  7. a same-day arrival to confirm Reception sees the room as occupied/operationally usable
- After implementation, verify that:
  - imported rooms appear in admin reservations
  - matching display rooms remain usable in Reception
  - Housekeeping only triggers from existing checkout/send-to-clean flows
  - no existing manual reservation flow regresses on mobile/tablet/desktop

Expected result
- One upgraded importer in the existing admin modal
- Exact new template download
- Cloudbeds export compatibility via header mapping
- Safer preview and duplicate skipping
- Automatic room/unit onboarding and same-day ops visibility without breaking current Reception, guest, or Housekeeping flows
