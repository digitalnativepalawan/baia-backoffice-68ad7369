
Goal

Add a one-click “Setup Data Download” inside Admin → Setup that exports the configuration you want as a ZIP of CSV files, ready to upload into the cloned onboarding app later.

What I’ll build

1. Add a dedicated export panel in Admin → Setup
- Place it near the top of the Setup tab so it’s easy to find.
- Include a clear label like “Download Setup Data”.
- Show one primary button to generate the ZIP.
- Because you chose full employee records, show a warning that the export includes sensitive employee login/PIN-related fields.

2. Export the setup data as a ZIP of CSV files
The ZIP will include these CSVs:
- resort_profile.csv
- invoice_settings.csv
- billing_config.csv
- payment_methods.csv
- resort_tables.csv
- order_types.csv
- menu_categories.csv
- room_types.csv
- housekeeping_checklists.csv
- cleaning_packages.csv
- cleaning_package_items.csv
- employees.csv
- employee_roles.csv
- employee_permissions.csv
- staff_roles.csv

3. Preserve the relationships needed for later import
Some setup data depends on other tables:
- housekeeping_checklists → room_types
- cleaning_packages → room_types
- cleaning_package_items → cleaning_packages + ingredients

To make the later upload easier, I’ll export relationship fields in a migration-friendly way:
- keep the raw IDs
- also include readable helper columns where useful, such as room type name and package name
This is especially important for housekeeping package items, so the cloned app can map records safely even if IDs differ.

4. Reuse the existing download pattern already in the app
I found the project already uses:
- JSZip for ZIP creation
- Blob + URL.createObjectURL for downloads
- CSV generation patterns in existing admin exports
So I’ll follow that same approach for consistency.

5. Keep this client-side only
- No database schema changes needed
- No backend function needed
- No migration needed
This is a pure admin export feature that reads existing setup tables and downloads a file locally.

Implementation approach

- Create a small reusable admin component, likely something like `SetupExportCard`
- Mount it inside `src/pages/AdminPage.tsx` under the Setup tab
- Use the existing Supabase client to query all required tables
- Build CSV content table-by-table
- Bundle everything with JSZip
- Download a file like `setup-export-YYYYMMDD-HHmm.zip`
- Show loading and success/error toast states

Important design decisions

- Include full employee records as requested, including current employee fields like pay/contact/login-related columns
- Also include employee roles, permissions, and custom staff roles so the cloned app can reconstruct access setup properly
- Include `room_types` even though you didn’t list it explicitly, because housekeeping checklist/package data depends on it
- For package items, include readable mapping columns to avoid import headaches later

Technical details

Files likely involved
- `src/pages/AdminPage.tsx`
- new component such as `src/components/admin/SetupExportCard.tsx`

Code patterns to follow
- ZIP export pattern from `src/components/admin/AccountingExport.tsx`
- CSV download pattern from menu/report exports
- Setup tab placement in `src/pages/AdminPage.tsx`

Data sources confirmed in code
- `resort_profile`
- `invoice_settings`
- `billing_config`
- `payment_methods`
- `resort_tables`
- `order_types`
- `menu_categories`
- `room_types`
- `housekeeping_checklists`
- `cleaning_packages`
- `cleaning_package_items`
- `employees`
- `employee_roles`
- `employee_permissions`
- `staff_roles`

Notes / caveats
- `cleaning_package_items` references ingredients, but ingredients were not requested. I’ll make the export more upload-safe by including readable ingredient-related mapping fields where possible, rather than relying only on IDs.
- Since this export contains sensitive employee data, I’ll add a visible warning and confirmation step before download.
- This plan covers download only; the later upload/import flow into the cloned app can be built against the same CSV structure.
