

# Update Invoice to Use Resort Profile Data Instead of Hardcoded Logo

## Overview

Remove the hardcoded "Binga Beach" logo image from the PDF invoice and WhatsApp text. Replace it with the resort name from the profile ("BAIA Palawan") and use all profile data (address, phone, email, website) dynamically.

## Changes to `src/lib/generateInvoicePdf.ts`

### PDF Generation (`generateInvoicePdf`)

1. **Remove** the hardcoded logo image loading (`INVOICE_LOGO_PATH`, `loadImageAsBase64` call, and `addImage` block)
2. **Add resort name as text header**: Display `profile.resort_name` ("BAIA Palawan") in bold, larger font, centered at the top
3. **Add tagline** if set in profile (currently empty but future-proof)
4. **Keep** address, phone, and email lines (already dynamic from profile)
5. **Update footer**: Replace hardcoded `www.bingabeach.com` with `profile.website_url` (currently empty, so fall back gracefully)

### WhatsApp Text (`buildInvoiceWhatsAppText`)

1. Already uses `profile.resort_name` for the header -- no change needed there
2. **Update footer**: Replace hardcoded `www.bingabeach.com` with `profile.website_url` or omit if empty

## Technical Details

### Lines changed in `generateInvoicePdf.ts`:

- Remove `const INVOICE_LOGO_PATH` (line 20)
- Remove `loadImageAsBase64` function can stay (unused, but clean to remove)
- Lines 51-59: Replace logo image block with text-based resort name header
- Line 163: Replace `www.bingabeach.com` with dynamic `profile?.website_url`
- Line 191: Same for WhatsApp text footer

### No database or schema changes needed

All data already exists in the `resort_profile` table:
- `resort_name`: "BAIA Palawan"
- `address`: "Sitio Panindigan, Barangay Poblacion, San Vicente Palawan..."
- `phone`: "+63 967 206 2327"
- `email`: "booking@baia.com"
- `website_url`: (currently empty)

