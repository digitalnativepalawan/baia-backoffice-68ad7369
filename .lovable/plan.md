

# Fix Food Cost Override Confusion and Reports Accuracy

## The Problem

There's a circular bug in how food cost works:

1. You add recipe ingredients to a menu item (e.g., Longganisa - total recipe cost = P131.25)
2. The `onFoodCostUpdate` callback **auto-fills the "Food Cost Override" field** with that same P131.25
3. Now the system thinks you manually entered an override, so it shows the scary red warning: "Food cost override is active -- recipe-based auto-calculation is disabled"
4. When you save, it stores P131.25 as a manual override in the database `food_cost` column
5. But the real problem: for items where you **haven't** opened and triggered this auto-fill, `food_cost` stays `null` in the database, so reports show P0 for those items

This means your Reports dashboard is only showing correct food costs for items you've manually edited, and P0 for everything else.

## The Fix

### 1. Stop auto-filling the override field

Remove the `onFoodCostUpdate` callback that copies the recipe cost into the override field. The override field should ONLY contain a value if you deliberately type one in.

### 2. Save recipe cost to the database automatically

When saving a menu item, if no manual override is entered, calculate the recipe cost from the database and store it in `food_cost`. This ensures every item with a recipe has an accurate food cost stored.

### 3. Change the label and helper text

Rename from "Food Cost Override (P)" to just "Food Cost Override (P)" with clearer helper text: "Only fill this if you want to ignore the recipe calculation."

### 4. Keep the warning -- but only show it when appropriate

The warning will only appear when:
- A recipe exists AND
- The override field has a **different** value than the recipe calculation (meaning you truly overrode it)

---

## Technical Changes

### File: `src/pages/AdminPage.tsx`

1. **Remove the auto-fill in `onFoodCostUpdate`** -- stop copying recipe cost into the override field
2. **Track recipe cost separately** -- add a `recipeCost` state that holds the calculated value from the recipe editor
3. **Update `saveItem()`** -- when saving, if override is empty/zero, use the recipe-calculated cost instead:
   ```
   const foodCost = manualOverride > 0 ? manualOverride : recipeCost > 0 ? recipeCost : null;
   ```
4. **Update the helper text** below the override field to say "Only enter a value to override recipe calculation"

### File: `src/components/admin/RecipeEditor.tsx`

- Keep `onFoodCostUpdate` for passing the calculated cost up (used for save logic)
- Keep the warning, but it will now only show when `hasOverride` is true -- which will only be true when the user has actually typed a manual value

### One-time data fix

Run a query to update all menu items that have recipes but `food_cost = null`, setting their food cost from the recipe calculation. This ensures existing reports are accurate immediately.

