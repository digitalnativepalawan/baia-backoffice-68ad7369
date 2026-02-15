import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface RecipeEditorProps {
  menuItemId: string;
  onFoodCostUpdate?: (cost: number) => void;
}

const RecipeEditor = ({ menuItemId, onFoodCostUpdate }: RecipeEditorProps) => {
  const qc = useQueryClient();

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data } = await supabase.from('ingredients').select('*').order('name');
      return data || [];
    },
  });

  const { data: recipeIngredients = [], isLoading } = useQuery({
    queryKey: ['recipe_ingredients', menuItemId],
    queryFn: async () => {
      const { data } = await supabase
        .from('recipe_ingredients')
        .select('*, ingredients(*)')
        .eq('menu_item_id', menuItemId);
      return data || [];
    },
  });

  // New ingredient form
  const [newIngId, setNewIngId] = useState('');
  const [newQty, setNewQty] = useState('');

  // Calculate food cost from recipe
  const calculatedCost = useMemo(() => {
    return recipeIngredients.reduce((sum: number, ri: any) => {
      const ing = ri.ingredients;
      if (!ing) return sum;
      return sum + (ri.quantity * ing.cost_per_unit);
    }, 0);
  }, [recipeIngredients]);

  useEffect(() => {
    onFoodCostUpdate?.(calculatedCost);
  }, [calculatedCost, onFoodCostUpdate]);

  const addIngredient = async () => {
    if (!newIngId || !newQty) return;
    const { error } = await supabase.from('recipe_ingredients').upsert({
      menu_item_id: menuItemId,
      ingredient_id: newIngId,
      quantity: parseFloat(newQty) || 0,
    }, { onConflict: 'menu_item_id,ingredient_id' });
    if (error) {
      toast.error('Failed to add ingredient');
      return;
    }
    setNewIngId('');
    setNewQty('');
    qc.invalidateQueries({ queryKey: ['recipe_ingredients', menuItemId] });
    toast.success('Ingredient added');
  };

  const removeIngredient = async (id: string) => {
    await supabase.from('recipe_ingredients').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['recipe_ingredients', menuItemId] });
  };

  const updateQty = async (id: string, qty: number) => {
    await supabase.from('recipe_ingredients').update({ quantity: qty }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['recipe_ingredients', menuItemId] });
  };

  // Ingredients not yet in this recipe
  const availableIngredients = ingredients.filter(
    (i: any) => !recipeIngredients.some((ri: any) => ri.ingredient_id === i.id)
  );

  if (isLoading) return <p className="font-body text-xs text-cream-dim">Loading recipe...</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-xs tracking-wider text-foreground">Recipe Ingredients</h4>
        {calculatedCost > 0 && (
          <span className="font-display text-xs text-gold">
            Cost: ₱{calculatedCost.toFixed(2)}
          </span>
        )}
      </div>

      {/* Existing ingredients */}
      {recipeIngredients.length === 0 && (
        <p className="font-body text-xs text-cream-dim">No ingredients added yet</p>
      )}
      {recipeIngredients.map((ri: any) => {
        const ing = ri.ingredients;
        if (!ing) return null;
        const lineCost = ri.quantity * ing.cost_per_unit;
        return (
          <div key={ri.id} className="flex items-center gap-2">
            <span className="font-body text-xs text-foreground flex-1 truncate">
              {ing.name} ({ing.unit})
            </span>
            <Input
              type="number"
              value={ri.quantity}
              onChange={e => updateQty(ri.id, parseFloat(e.target.value) || 0)}
              className="bg-secondary border-border text-foreground font-body w-20 h-8 text-xs"
            />
            <span className="font-body text-[10px] text-cream-dim w-14 text-right">
              ₱{lineCost.toFixed(2)}
            </span>
            <button onClick={() => removeIngredient(ri.id)} className="text-destructive hover:text-destructive/80">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Add new ingredient */}
      {availableIngredients.length > 0 && (
        <div className="flex items-end gap-2 pt-2 border-t border-border">
          <div className="flex-1">
            <Select value={newIngId} onValueChange={setNewIngId}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8">
                <SelectValue placeholder="Ingredient..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border max-h-48">
                {availableIngredients.map((i: any) => (
                  <SelectItem key={i.id} value={i.id} className="font-body text-xs text-foreground">
                    {i.name} ({i.unit}) — ₱{i.cost_per_unit}/{i.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            type="number"
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            placeholder="Qty"
            className="bg-secondary border-border text-foreground font-body w-20 h-8 text-xs"
          />
          <Button size="icon" variant="outline" onClick={addIngredient} className="h-8 w-8">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default RecipeEditor;
