

## Plan: Fresh Start — Clear All Operational Data

Keep all code, schema, settings, employees, menu items, categories, rooms/units, and configuration intact. Delete **data rows** from operational tables only.

### Tables to Clear (using insert/delete tool)

1. **Orders & related**: `orders` (all rows)
2. **Inventory logs**: `inventory_logs`
3. **Housekeeping orders**: `housekeeping_orders`
4. **Audit log**: `audit_log`
5. **Guest tours**: `guest_tours`
6. **Guest requests**: `guest_requests`
7. **Guest reviews**: `guest_reviews`
8. **Guest notes**: `guest_notes`
9. **Guest documents**: `guest_documents`
10. **Guest vibe records**: `guest_vibe_records` and `interventions`
11. **Employee shifts**: `employee_shifts`
12. **Employee tasks**: `employee_tasks`
13. **Expenses & expense history**: `expenses`, `expense_history`
14. **Payroll payments**: `payroll_payments`
15. **Employee bonuses**: `employee_bonuses`

### What stays untouched
- `menu_items`, `menu_categories`, `recipe_ingredients`, `ingredients` — menu stays
- `employees`, `employee_permissions` — staff stays
- `units`, `room_types`, `bookings` — room config stays
- `resort_profile`, `billing_config`, `invoice_settings`, `payroll_settings` — all settings
- `order_types`, `payment_methods`, `app_options`, `devices` — config
- `cleaning_packages`, `cleaning_package_items`, `housekeeping_checklists` — HK config
- `rental_rates`, `request_categories`, `tour packages` — service config
- All edge functions, code, and schema unchanged

### Execution
Run DELETE statements via the data tool for each table. Order matters for any FK dependencies (e.g., `interventions` before `guest_vibe_records`, `expense_history` before `expenses`).

