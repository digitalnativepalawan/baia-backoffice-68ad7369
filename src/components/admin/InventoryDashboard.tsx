import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, AlertTriangle, Download, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

const UNITS = ['grams', 'ml', 'pcs', 'kg', 'liters', 'bottles', 'cans'];

const InventoryDashboard = () => {
  const qc = useQueryClient();

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data } = await supabase.from('ingredients').select('*').order('name');
      return data || [];
    },
  });

  const [search, setSearch] = useState('');
  const [editIng, setEditIng] = useState<any>(null);
  const [form, setForm] = useState({ name: '', unit: 'grams', cost_per_unit: '', current_stock: '', low_stock_threshold: '' });

  const openNew = () => {
    setEditIng('new');
    setForm({ name: '', unit: 'grams', cost_per_unit: '', current_stock: '', low_stock_threshold: '' });
  };

  const openEdit = (ing: any) => {
    setEditIng(ing);
    setForm({
      name: ing.name,
      unit: ing.unit,
      cost_per_unit: String(ing.cost_per_unit),
      current_stock: String(ing.current_stock),
      low_stock_threshold: String(ing.low_stock_threshold),
    });
  };

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      cost_per_unit: parseFloat(form.cost_per_unit) || 0,
      current_stock: parseFloat(form.current_stock) || 0,
      low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
    };
    if (!payload.name) return;

    if (editIng === 'new') {
      await supabase.from('ingredients').insert(payload);
    } else {
      // Log stock change if stock changed
      const oldStock = editIng.current_stock;
      if (payload.current_stock !== oldStock) {
        await supabase.from('inventory_logs').insert({
          ingredient_id: editIng.id,
          change_qty: payload.current_stock - oldStock,
          reason: 'manual_adjustment',
        });
      }
      await supabase.from('ingredients').update(payload).eq('id', editIng.id);
    }
    setEditIng(null);
    qc.invalidateQueries({ queryKey: ['ingredients'] });
    toast.success('Ingredient saved');
  };

  const deleteIng = async (id: string) => {
    await supabase.from('ingredients').delete().eq('id', id);
    setEditIng(null);
    qc.invalidateQueries({ queryKey: ['ingredients'] });
    toast.success('Ingredient deleted');
  };

  const lowStockItems = ingredients.filter((i: any) => i.current_stock <= i.low_stock_threshold && i.low_stock_threshold > 0);

  const filtered = ingredients.filter((i: any) => {
    if (!search.trim()) return true;
    return i.name.toLowerCase().includes(search.toLowerCase());
  });

  const downloadCSV = () => {
    let csv = 'Name,Unit,Cost Per Unit,Current Stock,Low Stock Threshold,Status\n';
    ingredients.forEach((i: any) => {
      const status = i.current_stock <= i.low_stock_threshold && i.low_stock_threshold > 0 ? 'LOW' : 'OK';
      csv += `"${i.name}","${i.unit}",${i.cost_per_unit},${i.current_stock},${i.low_stock_threshold},${status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Low stock alerts */}
      {lowStockItems.length > 0 && (
        <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="font-display text-xs tracking-wider text-destructive">Low Stock Alert</span>
          </div>
          {lowStockItems.map((i: any) => (
            <p key={i.id} className="font-body text-xs text-foreground">
              {i.name}: {i.current_stock} {i.unit} (threshold: {i.low_stock_threshold})
            </p>
          ))}
        </div>
      )}

      {/* Search + actions */}
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search ingredients..."
          className="bg-secondary border-border text-foreground font-body flex-1"
        />
        <Button variant="outline" onClick={downloadCSV} className="font-display tracking-wider">
          <Download className="w-4 h-4" />
        </Button>
      </div>

      <Button onClick={openNew} className="font-display tracking-wider w-full" variant="outline">
        <Plus className="w-4 h-4 mr-2" /> Add Ingredient
      </Button>

      {/* Ingredients list */}
      {filtered.map((ing: any) => {
        const isLow = ing.current_stock <= ing.low_stock_threshold && ing.low_stock_threshold > 0;
        return (
          <button key={ing.id} onClick={() => openEdit(ing)}
            className={`w-full text-left p-3 border rounded-lg transition-colors ${
              isLow ? 'border-destructive/40 bg-destructive/5' : 'border-border hover:border-gold/50'
            }`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-cream-dim" />
                  <p className="font-display text-sm text-foreground">{ing.name}</p>
                  {isLow && <Badge variant="destructive" className="text-[10px] py-0">LOW</Badge>}
                </div>
                <p className="font-body text-xs text-cream-dim mt-0.5">
                  ₱{ing.cost_per_unit}/{ing.unit}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-sm text-foreground">{ing.current_stock}</p>
                <p className="font-body text-[10px] text-cream-dim">{ing.unit}</p>
              </div>
            </div>
          </button>
        );
      })}

      {filtered.length === 0 && (
        <p className="font-body text-sm text-cream-dim text-center py-8">No ingredients found</p>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editIng} onOpenChange={() => setEditIng(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider">
              {editIng === 'new' ? 'New Ingredient' : 'Edit Ingredient'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ingredient name" className="bg-secondary border-border text-foreground font-body" />
            <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {UNITS.map(u => (
                  <SelectItem key={u} value={u} className="font-body text-foreground">{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <label className="font-body text-xs text-cream-dim">Cost per unit (₱)</label>
              <Input value={form.cost_per_unit} onChange={e => setForm(f => ({ ...f, cost_per_unit: e.target.value }))}
                type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs text-cream-dim">Current Stock</label>
                <Input value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))}
                  type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
              <div>
                <label className="font-body text-xs text-cream-dim">Low Threshold</label>
                <Input value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                  type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
            </div>
            <Button onClick={save} className="font-display tracking-wider w-full">Save</Button>
            {editIng && editIng !== 'new' && (
              <Button variant="destructive" onClick={() => deleteIng(editIng.id)} className="font-display tracking-wider w-full">
                Delete Ingredient
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryDashboard;
