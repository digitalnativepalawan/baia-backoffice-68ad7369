

## Make Menu Categories Dynamic and Manageable

### Problem
The menu category tabs shown to guests/staff and the category dropdown in the admin menu editor are both hardcoded with old categories (Breakfast, Starters, Pasta, etc.) that don't match the actual items in the database (Beer, Cocktails, Food Menu, Fruit Shakes, Non-Alcoholic, Spirits, Wine).

### Solution
Create a new `menu_categories` database table so resort owners can add, edit, delete, and reorder categories from the Setup tab. Both the guest menu page and the admin menu editor will pull categories dynamically from this table.

### Steps

**1. Create `menu_categories` table**
- Columns: `id`, `name` (text), `sort_order` (integer), `active` (boolean), `created_at`
- RLS policies for public read/insert/update/delete (matching existing pattern)
- Seed with the 7 current categories: Food Menu, Non-Alcoholic, Fruit Shakes, Cocktails, Wine, Spirits, Beer

**2. Add "Menu Categories" management section in Admin Setup tab**
- Place it in the Setup tab (between Order Types and Kitchen Settings, or after Order Types)
- Reuse the existing `EditableRow` component for rename, delete, and active toggle
- Add input + button to create new categories
- Same pattern as Units, Tables, and Order Types management

**3. Update MenuPage.tsx - Guest/Staff menu**
- Remove the hardcoded `CATEGORIES` array
- Fetch active categories from `menu_categories` table, ordered by `sort_order`
- Default the active tab to the first category returned
- Category tabs render dynamically from database results

**4. Update AdminPage.tsx - Menu item editor**
- Remove the hardcoded category list in the Select dropdown (line 515)
- Use the fetched `menu_categories` data to populate the category dropdown
- Default new item category to the first available category

### Technical Details

```text
Database table: menu_categories
+------------+---------+-----------+--------+
| id (uuid)  | name    | sort_order| active |
+------------+---------+-----------+--------+
| ...        | Food Menu    | 1    | true   |
| ...        | Non-Alcoholic| 2    | true   |
| ...        | Fruit Shakes | 3    | true   |
| ...        | Cocktails    | 4    | true   |
| ...        | Wine         | 5    | true   |
| ...        | Spirits      | 6    | true   |
| ...        | Beer         | 7    | true   |
+------------+---------+-----------+--------+
```

Files to modify:
- New migration SQL for `menu_categories` table + seed data
- `src/pages/AdminPage.tsx` - add category management section + update menu item editor dropdown
- `src/pages/MenuPage.tsx` - replace hardcoded categories with dynamic query

