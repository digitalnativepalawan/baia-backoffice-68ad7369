

## Bulk Reservation CSV Import

### Overview
Add an "Import Reservations" button next to the existing "Add Booking" button in the Reservations Ledger section. It opens a dialog modal for uploading a CSV file, previewing rows, selecting which to import, and batch-creating guests + bookings.

### New File: `src/components/admin/ImportReservationsModal.tsx`

A self-contained modal component that handles the full import flow:

**1. Template Download**
- Button that generates and downloads a CSV file with headers: `Guest Name,Units,Guests,Platform,Check In,Check Out,Total Amount Projected,Paid So Far Realized,Notes`
- Includes one example row

**2. File Upload**
- Simple file input styled as a drop zone (click to browse)
- Accepts `.csv` files only
- Parses CSV client-side using basic string splitting (no extra dependency needed)

**3. Preview Table**
- Shows all parsed rows as stacked mobile-friendly cards (no horizontal scrolling)
- Each card shows: Guest Name, Units, Dates, Amount, and a checkbox to include/exclude
- Validation errors shown inline per row (red text) for: missing guest name, missing dates, invalid date format
- "Select All / Deselect All" toggle

**4. Import Logic (on confirm)**
For each selected row:
1. Look up guest by `full_name` (case-insensitive match against existing `resort_ops_guests`). If not found, insert new guest
2. Split the Units column by comma (e.g. "G1,G2" becomes two separate bookings)
3. For multi-unit rows, split `Total Amount Projected` evenly across units
4. Look up each unit name in `resort_ops_units`. If unit not found, mark row as error and skip that unit
5. Insert into `resort_ops_bookings` with: guest_id, unit_id, platform, check_in, check_out, room_rate (projected / unit count), paid_amount (realized / unit count), adults from Guests column

**5. Result Summary**
- After processing, show a summary card inside the modal: "X reservations imported, Y rows skipped"
- List specific errors (e.g. "Row 3: Unit 'G99' not found")
- Close button that refreshes all queries via `invalidateAll()`

### Modified File: `src/components/admin/ResortOpsDashboard.tsx`
- Import `ImportReservationsModal`
- Add `Upload` icon from lucide-react
- Add state `const [importOpen, setImportOpen] = useState(false)`
- In the Reservations Ledger card header, add an "Import CSV" button next to the section title
- Render `<ImportReservationsModal open={importOpen} onOpenChange={setImportOpen} guests={guests} units={units} onComplete={invalidateAll} />` at the bottom of the card
- Pass existing `guests` and `units` arrays so the modal can do lookups without extra queries

### Technical Details

**CSV Parsing**: Pure client-side parsing -- split by newline, then by comma with basic quoted-field handling (handles values like `"G1,G2"` correctly).

**No new dependencies**: Uses built-in FileReader API and string manipulation. No papa-parse or similar library needed.

**No database changes**: Uses existing `resort_ops_guests`, `resort_ops_bookings`, and `resort_ops_units` tables as-is.

**Mobile-first**: The modal uses `DialogContent` with `max-h-[80vh] overflow-y-auto`. Preview rows are stacked cards, not tables. All inputs and buttons are full-width.

**Date validation**: Checks that Check In and Check Out are valid `YYYY-MM-DD` format and that Check Out is after Check In.

