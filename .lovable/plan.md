

## Make Rooms Section Fully Functional

### Problem
The Docs and Tours tabs currently show "Go to Check-In" when no guest is checked in, and even after check-in, they lack key features: no document download, no URL option, no camera capture for passport photos, no document type selector, and tours have no notes field. The section needs to be a complete guest management hub.

### Changes

#### 1. Enhance Documents Tab (`RoomsDashboard.tsx`)
- Add **document type selector** (Passport, Government ID, Booking Confirmation, Other) when uploading
- Add **"Take Photo" button** using camera capture (`capture="environment"`) with a clear camera icon -- separate from file upload
- Add **download button** on each uploaded document (opens in new tab)
- Add **URL input option** so staff can paste a link to an external document (stored as a document record with the URL)
- Add **notes field** per document for context (e.g., "expires March 2027")
- Allow Docs tab to work even without a booking -- store documents by `unit_name` as fallback so docs aren't blocked by check-in status

#### 2. Enhance Tours Tab (`RoomsDashboard.tsx`)
- Remove the booking requirement -- allow adding tours by `unit_name` so tours work even without a formal check-in
- Add **notes/instructions textarea** to the tour add form
- Add **tour provider field** (text input for vendor name)
- Add **pickup time** field
- Add **delete tour** action button

#### 3. Enhance Check-In Form (`RoomsDashboard.tsx`)
- Add **number of children** field
- Add **special requests** text area (separate from notes, specifically for pre-arrival requests)

#### 4. Database Changes
- Add columns to `guest_documents`: `unit_name` (text, default ''), allowing docs without a guest_id
- Add columns to `guest_tours`: `unit_name` (text, default ''), `provider` (text, default ''), `pickup_time` (text, default ''), allowing tours without a booking_id
- Add column to `resort_ops_bookings`: `children` (integer, default 0), `special_requests` (text, default '')

#### 5. Updated Query Logic
- Documents: query by `unit_name` when no `guestId`, by `guest_id` when available
- Tours: query by `unit_name` always (not just by booking_id), so tours persist across check-in/out cycles
- Both tabs become immediately usable for any selected room

### Files to Update
1. **`supabase/migrations/<timestamp>_enhance_rooms_features.sql`** -- add new columns to `guest_documents`, `guest_tours`, and `resort_ops_bookings`
2. **`src/components/admin/RoomsDashboard.tsx`** -- all UI and logic enhancements above

### Technical Details

**Document upload flow:**
- Camera button: `<input type="file" accept="image/*" capture="environment">` with camera icon
- File upload button: `<input type="file" accept="image/*,application/pdf">` with upload icon  
- URL input: text field + "Add Link" button that inserts a document record with the URL
- Download: anchor tag opening `doc.image_url` in `_blank`

**Tours without booking:**
- Store `unit_name` on every tour record
- Query tours by `unit_name` matching the selected room
- Remove the "Go to Check-In" gate entirely from the Tours tab

**Documents without booking:**
- Store `unit_name` on every document record  
- When `guestId` exists, also store it for cross-referencing
- Query by `unit_name` so documents are always visible for the room

