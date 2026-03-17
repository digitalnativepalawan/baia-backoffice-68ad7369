
Problem identified:
- The importer is already calculating the 6 problematic rows correctly, but the UI only previews the first 8 rows total.
- Because of `const previewRows = rows.slice(0, 8)`, any invalid rows outside those first 8 never appear in the list, so the user sees “6 with issues” but cannot see which ones.

What to change
1. Update the preview logic in `src/components/admin/ImportReservationsModal.tsx` so invalid rows are always visible.
   - Do not limit the preview to the first 8 raw rows only.
   - Show all rows with errors first, then show a capped set of valid rows underneath.
2. Add a small summary area above the list:
   - “6 rows need attention”
   - optionally a button/chip like “Show only issues / Show all”
3. Keep inline row-level errors exactly where they are now, since that part already exists and is good.
4. Preserve current import behavior:
   - cancelled rows remain deselected
   - duplicates remain skipped
   - valid rows still selectable/importable
   - no changes to reservation, reception, guest, or housekeeping flows

Recommended implementation
- Replace:
  - `previewRows = rows.slice(0, 8)`
- With derived lists like:
  - `issueRows = rows.filter(row => row.errors.length > 0)`
  - `validRows = rows.filter(row => row.errors.length === 0)`
  - `previewRows = [...issueRows, ...validRows.slice(0, N)]`
- Adjust the “+ X more rows” message so it counts only hidden valid rows, not hidden issue rows.
- Optionally add a filter toggle:
  - default to “show issues first”
  - allow “show all parsed rows”

Why this fixes it
- The parser and validation are working.
- The problem is visibility, not import logic.
- By always surfacing invalid rows, the user can immediately see the exact 6 issue rows and their inline reasons.

Files to update
- `src/components/admin/ImportReservationsModal.tsx`

Expected result
- When the modal says “115 rows parsed · 6 with issues · 109 valid”, those 6 issue rows will always be visible in the preview with their exact error messages.
- The rest of the importer behavior remains unchanged.

Technical note
- Current row error rendering is already present at:
  - `row.errors.map(...)`
- So this is mainly a preview-list ordering/visibility fix, not a parser rewrite.
