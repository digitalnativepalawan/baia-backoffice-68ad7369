import { supabase } from '@/integrations/supabase/client';

/**
 * Deduct ingredient stock for all items in an order based on their recipes.
 * Called when an order moves to "Preparing" status.
 */
export async function deductInventoryForOrder(orderId: string, items: Array<{ name: string; qty: number }>) {
  // Get all menu items that match the order items by name
  const itemNames = items.map(i => i.name);
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name')
    .in('name', itemNames);

  if (!menuItems || menuItems.length === 0) return;

  // Get recipe ingredients for these menu items
  const menuItemIds = menuItems.map(m => m.id);
  const { data: recipes } = await supabase
    .from('recipe_ingredients')
    .select('*, ingredients(*)')
    .in('menu_item_id', menuItemIds);

  if (!recipes || recipes.length === 0) return;

  // Build a map of menu_item_id -> order qty
  const qtyMap: Record<string, number> = {};
  for (const item of items) {
    const match = menuItems.find(m => m.name === item.name);
    if (match) {
      qtyMap[match.id] = (qtyMap[match.id] || 0) + item.qty;
    }
  }

  // Deduct each ingredient
  for (const ri of recipes) {
    const orderQty = qtyMap[ri.menu_item_id] || 0;
    if (orderQty === 0) continue;

    const deduction = ri.quantity * orderQty;
    const ing = ri.ingredients as any;
    if (!ing) continue;

    const newStock = Math.max(0, ing.current_stock - deduction);

    // Update stock
    await supabase
      .from('ingredients')
      .update({ current_stock: newStock })
      .eq('id', ri.ingredient_id);

    // Log the deduction
    await supabase.from('inventory_logs').insert({
      ingredient_id: ri.ingredient_id,
      change_qty: -deduction,
      reason: 'order_deduction',
      order_id: orderId,
    });
  }
}
