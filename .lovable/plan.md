

## Add Expenses Section to Admin Dashboard

### Overview
Add a new "Expenses" tab to the admin dashboard for tracking business expenses with receipt uploads, approval workflow, and pay-period filtering. Multi-admin features and AI scanning will be deferred to a later phase.

### Phase 1 Scope (this implementation)
- Expenses tab in admin with list view, summary cards, receipt upload, detail/edit, approve/delete workflow
- Pay period banner (reused from Payroll)
- Audit trail (edit history stored per expense)
- Soft delete with restore
- PDF generation for approved receipts
- Feature flag

### Deferred to later phases
- Multi-admin locking, @mentions, activity feed, comments (requires auth)
- AI receipt scanning (can be added once manual flow is solid)
- Monthly hard-delete cleanup job

---

### 1. Database Migration

Create two tables:

**`expenses`** - main expense records
- `id` uuid PK
- `status` text (draft / pending_review / approved / deleted) default 'draft'
- `image_url` text (receipt image in storage)
- `pdf_url` text (generated PDF URL)
- `vendor` text
- `expense_date` date
- `amount` numeric
- `vat_type` text (e.g. 'vatable', 'vat_exempt', 'zero_rated')
- `tin` text
- `tax_amount` numeric default 0
- `category` text
- `notes` text
- `created_by` text (admin name, manual for now)
- `created_at` timestamptz default now()
- `reviewed_by` text
- `reviewed_at` timestamptz
- `pay_period_start` date
- `pay_period_end` date
- `deleted_at` timestamptz (soft delete timestamp)

**`expense_history`** - audit trail
- `id` uuid PK
- `expense_id` uuid FK -> expenses
- `action` text (created / updated / approved / deleted / restored)
- `user_name` text
- `field` text
- `old_value` text
- `new_value` text
- `created_at` timestamptz default now()

**Storage bucket**: `receipts` (public) for receipt images and generated PDFs.

RLS: Public access policies (matching existing pattern in this project).

### 2. New Component: `ExpensesDashboard.tsx`

Located at `src/components/admin/ExpensesDashboard.tsx`. Follows the same pattern as PayrollDashboard and InventoryDashboard.

**Sub-views** (toggle buttons at top, same style as Payroll):
- **List** (default) - summary cards + expense list
- **Add/Edit** - form view (opens in-page, not a dialog, for split-screen on desktop)

**List view contains:**
- Pay period banner (Sun-Sat, reused logic from Payroll)
- Summary cards row: "Total Expenses" (sum of approved), "Pending Review" (count)
- Filter dropdown matching Payroll style (Pay Period / This Month / All)
- Two sections: "Pending Review" and "Approved" with expense cards
- Each card shows: vendor, date, amount, category badge, status badge
- Tap a card to open detail view

**Add/Edit view contains:**
- Receipt image upload (to `receipts` storage bucket) with loading spinner
- Image preview (left side on desktop, top on mobile)
- Editable form (right side on desktop, below on mobile):
  - Vendor (text input)
  - Expense Date (date input)
  - Amount (number input with peso sign)
  - VAT Type (dropdown: Vatable / VAT Exempt / Zero Rated)
  - TIN (text input)
  - Tax Amount (number)
  - Category (dropdown: Food & Beverage / Supplies / Maintenance / Utilities / Transport / Other)
  - Notes (textarea)
  - Created By (text input, pre-filled if previously set via localStorage as convenience)
- Action buttons: Save Draft / Submit for Review / Approve / Delete
- Delete uses two-click confirmation (matching existing pattern)
- Edit history log at the bottom showing all changes

**Feature flag**: `FEATURE_EXPENSES` constant at top of AdminPage; the Expenses tab only renders when true.

### 3. AdminPage.tsx Changes (minimal)

- Add `FEATURE_EXPENSES = true` constant
- Import `ExpensesDashboard`
- Add one `TabsTrigger` for "Expenses" between Inventory and Payroll
- Add one `TabsContent` rendering `<ExpensesDashboard />`
- No other modifications to existing tabs

### 4. PDF Generation

Reuse the existing `jspdf` dependency. When an expense is approved:
- Generate a single-page PDF with receipt image, all form data, and audit trail
- Upload PDF to `receipts` bucket
- Save URL to `pdf_url` column
- "Download PDF" button on approved expenses

### 5. Soft Delete Flow

- Delete sets `status = 'deleted'` and `deleted_at = now()`
- Deleted expenses hidden from main list
- "Show Deleted" toggle reveals them with a "Restore" button
- Restore sets `status = 'draft'` and clears `deleted_at`

### Technical Details

- All form saves record changes to `expense_history` table (field, old value, new value)
- Storage bucket created via SQL migration
- Pay period calculation reuses the same `previousSunday`/`nextSaturday` logic from PayrollDashboard
- Component file ~400-500 lines following existing dashboard patterns
- Mobile-first: single column stacked layout, all touch targets 44px minimum

### Files to create
- `supabase/migrations/[timestamp]_create_expenses_tables.sql`
- `src/components/admin/ExpensesDashboard.tsx`

### Files to modify
- `src/pages/AdminPage.tsx` (add tab trigger + content, feature flag, import)

