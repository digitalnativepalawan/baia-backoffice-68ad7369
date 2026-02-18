

# Add Category Functionality to Expenses Section

This is a significant enhancement to the Expenses section in Resort Ops. Here's the full plan.

## 1. Database Migration

The `resort_ops_expenses` table already has `name`, `category`, `amount`, `expense_date`. We need to add:

- `notes` (text, nullable)
- `image_url` (text, nullable)
- `updated_at` (timestamptz, default now())

Also attach the existing `update_updated_at_column` trigger so `updated_at` auto-updates on edits.

## 2. Define Category Constants

Create a shared constant array of the 14 expense categories to be used across the add form, edit form, filter dropdown, and reports:

```
Food & Beverage, Utilities (Electric/Water/Gas/Fuel), Labor/Staff, Housekeeping,
Maintenance/Repairs, Operations/Supplies, Marketing/Admin, Professional Services,
Permits/Licenses, Transportation, Guest Services, Taxes/Government,
Capital Expenditures, Miscellaneous
```

## 3. Update Add Expense Form (lines 680-686)

Replace the current 4-input grid + button with an expanded form:

- **Name**: text input (unchanged)
- **Category**: `<Select>` dropdown with the 14 categories (replaces free-text input)
- **Amount**: number input (unchanged)
- **Date**: date input (unchanged)
- **Notes**: `<Textarea>` (optional, new)
- **Image URL**: text input (optional, new)
- **Save / Cancel** buttons

Update `newExpense` state to include `notes` and `image_url` fields. Update `addExpense()` to send these new fields.

## 4. Update Edit Expense Form (lines 656-664)

Same fields as Add form. Replace the free-text category input with the dropdown. Add notes and image_url fields. Update `saveExpense()` to persist the new fields.

## 5. Category Filter

Add a filter dropdown above the expense list (below the card header):

- "All Categories" default option + all 14 categories
- New state: `expenseCategoryFilter`
- Filter `monthExpenses` by selected category before rendering

Stack filters on mobile (flex-wrap).

## 6. Category Summary Bar

Above the expense list, show a small summary line:

```
Total: P XX,XXX | Categories: N | This period: [Month Year]
```

Calculated from the filtered `monthExpenses`.

## 7. Expense Reports Modal

Add a "Reports" button next to "+ Add Expense". When clicked, show a Dialog with:

- **Summary cards**: Total Expenses amount, number of categories used
- **Bar chart** (using recharts, already installed): expenses by category
- **Breakdown table**: Category | Total Amount | # of Expenses | % of Total
- **Clickable rows**: clicking a category closes the modal and sets the category filter
- **Export buttons**: CSV download and PDF export (using jspdf, already installed)

## 8. Bulk Import

Add an "Import" button that opens a dialog with:

- A downloadable CSV template with columns: `Date, Name, Category, Amount, Notes, Image URL`
- A file upload input accepting `.csv`
- Parse the CSV, validate rows, and bulk insert into `resort_ops_expenses`
- Show summary of imported rows with error count

## 9. Expense List Display Update

Update each expense row to show notes (truncated) and an image link icon when `image_url` is present.

## Technical Details

### Files Modified

| File | Changes |
|---|---|
| `src/components/admin/ResortOpsDashboard.tsx` | Add category constants, filter state, reports modal state, update add/edit forms, add summary bar, add reports button, add bulk import button. This file is already large (~846 lines) so the new Expense Reports and Bulk Import dialogs will be extracted into a new component. |
| `src/components/admin/ExpenseReportsModal.tsx` | **New file** - Dialog with bar chart, breakdown table, CSV/PDF export |
| `src/components/admin/ExpenseBulkImportModal.tsx` | **New file** - CSV template download, file upload, parse and insert |

### Database Migration

```sql
ALTER TABLE resort_ops_expenses
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON resort_ops_expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### No new RLS policies needed

The table already has full public CRUD policies matching the rest of the resort ops tables.

