import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, AlertTriangle, Download, Package, UtensilsCrossed, BarChart3, Calendar, ArrowRightLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { format, subDays } from 'date-fns';
import { Label } from '@/components/ui/label';

const UNITS = ['grams', 'ml', 'pcs', 'kg', 'liters', 'bottles', 'cans', 'slices'];
const DEPARTMENTS = ['kitchen', 'bar', 'gardens', 'housekeeping'] as const;
type Department = typeof DEPARTMENTS[number];

const DEPT_LABELS: Record<string, string> = {
  kitchen: '🍳 Kitchen',
  bar: '🍸 Bar',
  gardens: '🌿 Gardens',
  housekeeping: '🏨 Housekeeping',
};

const InventoryDashboard = ({ readOnly = false }: { readOnly?: boolean }) => {
  const qc = useQueryClient();
  const [selectedDept, setSelectedDept] = useState<Department | 'all'>('all');

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data } = await supabase.from('ingredients').select('*').order('name');
      return data || [];
    },
  });

  const { data: recipeLinks = [] } = useQuery({
    queryKey: ['recipe_ingredients_with_menu'],
    queryFn: async () => {
      const { data } = await supabase
        .from('recipe_ingredients')
        .select('ingredient_id, menu_item_id, quantity, menu_items(name)');
      return data || [];
    },
  });

  const [logDays, setLogDays] = useState(7);
  const { data: consumptionLogs = [] } = useQuery({
    queryKey: ['consumption-logs', logDays],
    queryFn: async () => {
      const since = subDays(new Date(), logDays).toISOString();
      const { data } = await supabase
        .from('inventory_logs')
        .select('*, ingredients(name, unit, department)')
        .eq('reason', 'order_deduction')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Build usage map
  const usageMap: Record<string, { dishName: string; quantity: number }[]> = {};
  recipeLinks.forEach((rl: any) => {
    const dishName = rl.menu_items?.name || 'Unknown';
    if (!usageMap[rl.ingredient_id]) usageMap[rl.ingredient_id] = [];
    usageMap[rl.ingredient_id].push({ dishName, quantity: rl.quantity });
  });

  // Filter by department
  const deptIngredients = selectedDept === 'all'
    ? ingredients
    : ingredients.filter((i: any) => i.department === selectedDept);

  // Dashboard stats (department-scoped)
  const totalValue = deptIngredients.reduce((sum: number, i: any) => sum + (i.current_stock * i.cost_per_unit), 0);
  const missingCostCount = deptIngredients.filter((i: any) => i.cost_per_unit === 0).length;
  const outOfStockCount = deptIngredients.filter((i: any) => i.current_stock <= 0).length;

  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [editIng, setEditIng] = useState<any>(null);
  const [form, setForm] = useState({ name: '', unit: 'grams', cost_per_unit: '', current_stock: '', low_stock_threshold: '', department: 'kitchen' as Department });

  // Transfer state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState({ fromDept: '' as string, toDept: '' as string, ingredientId: '', quantity: '', reason: '' });

  const openNew = () => {
    setEditIng('new');
    setForm({ name: '', unit: 'grams', cost_per_unit: '', current_stock: '', low_stock_threshold: '', department: (selectedDept === 'all' ? 'kitchen' : selectedDept) as Department });
  };

  const openEdit = (ing: any) => {
    setEditIng(ing);
    setForm({
      name: ing.name,
      unit: ing.unit,
      cost_per_unit: String(ing.cost_per_unit),
      current_stock: String(ing.current_stock),
      low_stock_threshold: String(ing.low_stock_threshold),
      department: ing.department || 'kitchen',
    });
  };

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      cost_per_unit: parseFloat(form.cost_per_unit) || 0,
      current_stock: parseFloat(form.current_stock) || 0,
      low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
      department: form.department,
    };
    if (!payload.name) return;

    if (editIng === 'new') {
      await supabase.from('ingredients').insert(payload);
    } else {
      const oldStock = editIng.current_stock;
      if (payload.current_stock !== oldStock) {
        await supabase.from('inventory_logs').insert({
          ingredient_id: editIng.id,
          change_qty: payload.current_stock - oldStock,
          reason: 'manual_adjustment',
          department: payload.department,
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

  const lowStockItems = deptIngredients.filter((i: any) => i.current_stock < i.low_stock_threshold && i.low_stock_threshold > 0);

  const filtered = deptIngredients.filter((i: any) => {
    if (search.trim() && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (unitFilter !== 'all' && i.unit !== unitFilter) return false;
    if (stockFilter === 'low' && !(i.current_stock < i.low_stock_threshold && i.low_stock_threshold > 0)) return false;
    if (stockFilter === 'out' && i.current_stock > 0) return false;
    return true;
  });

  const downloadCSV = () => {
    let csv = 'Name,Department,Unit,Cost Per Unit,Current Stock,Low Stock Threshold,Status\n';
    deptIngredients.forEach((i: any) => {
      const status = i.current_stock <= i.low_stock_threshold && i.low_stock_threshold > 0 ? 'LOW' : 'OK';
      csv += `"${i.name}","${i.department || 'kitchen'}","${i.unit}",${i.cost_per_unit},${i.current_stock},${i.low_stock_threshold},${status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${selectedDept}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const editIngUsage = editIng && editIng !== 'new' ? (usageMap[editIng.id] || []) : [];

  // Filter consumption logs by department
  const filteredLogs = selectedDept === 'all'
    ? consumptionLogs
    : consumptionLogs.filter((log: any) => log.department === selectedDept || log.ingredients?.department === selectedDept);

  const logsByDate: Record<string, Record<string, { name: string; total: number; unit: string }>> = {};
  filteredLogs.forEach((log: any) => {
    const date = format(new Date(log.created_at), 'yyyy-MM-dd');
    const ingName = log.ingredients?.name || 'Unknown';
    const ingUnit = log.ingredients?.unit || '';
    if (!logsByDate[date]) logsByDate[date] = {};
    if (!logsByDate[date][ingName]) logsByDate[date][ingName] = { name: ingName, total: 0, unit: ingUnit };
    logsByDate[date][ingName].total += Math.abs(log.change_qty);
  });

  // Transfer logic
  const transferIngredients = transfer.fromDept
    ? ingredients.filter((i: any) => i.department === transfer.fromDept)
    : [];

  const executeTransfer = async () => {
    const qty = parseFloat(transfer.quantity);
    if (!transfer.fromDept || !transfer.toDept || !transfer.ingredientId || !qty || qty <= 0) {
      toast.error('Please fill all transfer fields');
      return;
    }
    if (transfer.fromDept === transfer.toDept) {
      toast.error('Source and destination must be different');
      return;
    }
    const sourceIng = ingredients.find((i: any) => i.id === transfer.ingredientId);
    if (!sourceIng) return;
    if (qty > (sourceIng as any).current_stock) {
      toast.error('Insufficient stock to transfer');
      return;
    }

    // Deduct from source
    await supabase.from('ingredients').update({
      current_stock: (sourceIng as any).current_stock - qty,
    }).eq('id', sourceIng.id);

    // Find or create target ingredient
    const { data: existing } = await supabase
      .from('ingredients')
      .select('*')
      .eq('name', (sourceIng as any).name)
      .eq('department', transfer.toDept)
      .maybeSingle();

    if (existing) {
      await supabase.from('ingredients').update({
        current_stock: existing.current_stock + qty,
      }).eq('id', existing.id);
    } else {
      await supabase.from('ingredients').insert({
        name: (sourceIng as any).name,
        unit: (sourceIng as any).unit,
        cost_per_unit: (sourceIng as any).cost_per_unit,
        current_stock: qty,
        low_stock_threshold: 0,
        department: transfer.toDept,
      });
    }

    // Log both
    const reason = transfer.reason ? `transfer: ${transfer.reason}` : 'transfer';
    await supabase.from('inventory_logs').insert([
      { ingredient_id: sourceIng.id, change_qty: -qty, reason, department: transfer.fromDept },
      { ingredient_id: existing?.id || sourceIng.id, change_qty: qty, reason, department: transfer.toDept },
    ]);

    setShowTransfer(false);
    setTransfer({ fromDept: '', toDept: '', ingredientId: '', quantity: '', reason: '' });
    qc.invalidateQueries({ queryKey: ['ingredients'] });
    toast.success(`Transferred ${qty} ${(sourceIng as any).unit} of ${(sourceIng as any).name}`);
  };

  return (
    <div className="space-y-4">
      {/* Department pill selector */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedDept('all')}
          className={`px-3 py-2 rounded-full font-body text-xs border transition-colors min-h-[40px] ${
            selectedDept === 'all'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-secondary text-foreground border-border hover:bg-accent'
          }`}
        >
          All
        </button>
        {DEPARTMENTS.map(dept => (
          <button
            key={dept}
            onClick={() => setSelectedDept(dept)}
            className={`px-3 py-2 rounded-full font-body text-xs border transition-colors min-h-[40px] ${
              selectedDept === dept
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary text-foreground border-border hover:bg-accent'
            }`}
          >
            {DEPT_LABELS[dept]}
          </button>
        ))}
      </div>

      <Tabs defaultValue="stock" className="w-full">
        <TabsList className="w-full bg-secondary mb-4">
          <TabsTrigger value="stock" className="font-display text-xs tracking-wider flex-1">
            <Package className="w-3.5 h-3.5 mr-1" /> Stock
          </TabsTrigger>
          <TabsTrigger value="consumption" className="font-display text-xs tracking-wider flex-1">
            <BarChart3 className="w-3.5 h-3.5 mr-1" /> Usage Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-lg border border-border bg-secondary/50 text-center">
              <p className="font-display text-lg text-foreground">₱{totalValue.toLocaleString()}</p>
              <p className="font-body text-[10px] text-cream-dim">Inventory Value</p>
            </div>
            <button onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')}
              className={`p-2.5 rounded-lg border text-center transition-colors ${
                outOfStockCount > 0 ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-secondary/50'
              }`}>
              <p className="font-display text-lg text-foreground">{outOfStockCount}</p>
              <p className="font-body text-[10px] text-cream-dim">Out of Stock</p>
            </button>
            <button onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
              className={`p-2.5 rounded-lg border text-center transition-colors ${
                lowStockItems.length > 0 ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-secondary/50'
              }`}>
              <p className="font-display text-lg text-foreground">{lowStockItems.length}</p>
              <p className="font-body text-[10px] text-cream-dim">Low Stock</p>
            </button>
          </div>

          {/* Missing cost alert */}
          {missingCostCount > 0 && (
            <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="font-body text-xs text-foreground">
                {missingCostCount} ingredient{missingCostCount !== 1 ? 's' : ''} missing cost data — food costing won't be accurate
              </p>
            </div>
          )}

          {/* Low stock alerts */}
          {lowStockItems.length > 0 && stockFilter === 'all' && (
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 space-y-1">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="font-display text-xs tracking-wider text-destructive">
                  Low Stock Alert{selectedDept !== 'all' ? ` (${DEPT_LABELS[selectedDept]})` : ''}
                </span>
              </div>
              {lowStockItems.map((i: any) => (
                <p key={i.id} className="font-body text-xs text-foreground">
                  {i.name}: {i.current_stock} {i.unit} (threshold: {i.low_stock_threshold})
                </p>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ingredients..."
              className="bg-secondary border-border text-foreground font-body flex-1"
            />
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="font-body text-foreground">All</SelectItem>
                <SelectItem value="pcs" className="font-body text-foreground">pcs</SelectItem>
                <SelectItem value="grams" className="font-body text-foreground">grams</SelectItem>
                <SelectItem value="ml" className="font-body text-foreground">ml</SelectItem>
                <SelectItem value="slices" className="font-body text-foreground">slices</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={downloadCSV}>
              <Download className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button onClick={openNew} className="font-display tracking-wider flex-1" variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Add Ingredient
            </Button>
            <Button onClick={() => setShowTransfer(true)} className="font-display tracking-wider" variant="outline">
              <ArrowRightLeft className="w-4 h-4 mr-2" /> Transfer
            </Button>
          </div>

          {/* Ingredients list */}
          {filtered.map((ing: any) => {
            const isLow = ing.current_stock < ing.low_stock_threshold && ing.low_stock_threshold > 0;
            const isOut = ing.current_stock <= 0;
            const noCost = ing.cost_per_unit === 0;
            const dishCount = (usageMap[ing.id] || []).length;
            return (
              <button key={ing.id} onClick={() => openEdit(ing)}
                className={`w-full text-left p-3 border rounded-lg transition-colors ${
                  isOut ? 'border-destructive/60 bg-destructive/10' :
                  isLow ? 'border-destructive/40 bg-destructive/5' : 'border-border hover:border-gold/50'
                }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-cream-dim" />
                      <p className="font-display text-sm text-foreground">{ing.name}</p>
                      {isOut && <Badge variant="destructive" className="text-[10px] py-0">OUT</Badge>}
                      {isLow && !isOut && <Badge variant="destructive" className="text-[10px] py-0">LOW</Badge>}
                      {noCost && <Badge variant="outline" className="text-[10px] py-0 border-amber-500/50 text-amber-400">No Cost</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="font-body text-xs text-cream-dim">
                        {noCost ? '₱—' : `₱${ing.cost_per_unit}`}/{ing.unit}
                      </p>
                      {selectedDept === 'all' && (
                        <Badge variant="outline" className="text-[10px] py-0 border-muted-foreground/30">
                          {DEPT_LABELS[ing.department] || ing.department}
                        </Badge>
                      )}
                      {dishCount > 0 && (
                        <span className="font-body text-xs text-muted-foreground">
                          · {dishCount} {dishCount === 1 ? 'dish' : 'dishes'}
                        </span>
                      )}
                      {dishCount === 0 && (
                        <span className="font-body text-xs text-muted-foreground">· No recipe</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-display text-sm ${isOut ? 'text-destructive' : 'text-foreground'}`}>{ing.current_stock}</p>
                    <p className="font-body text-[10px] text-cream-dim">{ing.unit}</p>
                  </div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <p className="font-body text-sm text-cream-dim text-center py-8">No ingredients found</p>
          )}
        </TabsContent>

        {/* CONSUMPTION LOG TAB */}
        <TabsContent value="consumption" className="space-y-4">
          <div className="flex gap-2">
            {[7, 14, 30].map(d => (
              <Button key={d} size="sm" variant={logDays === d ? 'default' : 'outline'}
                onClick={() => setLogDays(d)} className="font-body text-xs flex-1">
                {d}d
              </Button>
            ))}
          </div>

          {Object.keys(logsByDate).length === 0 ? (
            <p className="font-body text-sm text-cream-dim text-center py-8">No consumption data yet</p>
          ) : (
            Object.entries(logsByDate)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, ings]) => (
                <div key={date} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-cream-dim" />
                    <span className="font-display text-xs tracking-wider text-foreground">
                      {format(new Date(date), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {Object.values(ings)
                    .sort((a, b) => b.total - a.total)
                    .map((ing, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="font-body text-xs text-foreground">{ing.name}</span>
                        <span className="font-body text-xs text-cream-dim">-{ing.total} {ing.unit}</span>
                      </div>
                    ))
                  }
                </div>
              ))
          )}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!editIng} onOpenChange={() => setEditIng(null)}>
        <DialogContent className="bg-card border-border max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider">
              {editIng === 'new' ? 'New Ingredient' : 'Edit Ingredient'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ingredient name" className="bg-secondary border-border text-foreground font-body" />

            {/* Department selector */}
            <div>
              <Label className="font-body text-xs text-cream-dim">Department</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DEPARTMENTS.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, department: dept }))}
                    className={`px-3 py-2 rounded-full font-body text-xs border transition-colors min-h-[36px] ${
                      form.department === dept
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary text-foreground border-border hover:bg-accent'
                    }`}
                  >
                    {DEPT_LABELS[dept]}
                  </button>
                ))}
              </div>
            </div>

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

            {/* Used in dishes section */}
            {editIngUsage.length > 0 && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-cream-dim" />
                  <span className="font-display text-xs tracking-wider text-foreground">
                    Used in {editIngUsage.length} {editIngUsage.length === 1 ? 'dish' : 'dishes'}
                  </span>
                </div>
                {editIngUsage
                  .sort((a, b) => a.dishName.localeCompare(b.dishName))
                  .map((u, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="font-body text-xs text-foreground">{u.dishName}</span>
                    <span className="font-body text-[10px] text-cream-dim">{u.quantity} per order</span>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={save} className="font-display tracking-wider w-full">Save</Button>
            {editIng && editIng !== 'new' && (
              <Button variant="destructive" onClick={() => deleteIng(editIng.id)} className="font-display tracking-wider w-full">
                Delete Ingredient
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider">Transfer Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="font-body text-xs text-cream-dim">From Department</Label>
              <Select value={transfer.fromDept} onValueChange={v => setTransfer(t => ({ ...t, fromDept: v, ingredientId: '' }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d} className="font-body text-foreground">{DEPT_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-body text-xs text-cream-dim">To Department</Label>
              <Select value={transfer.toDept} onValueChange={v => setTransfer(t => ({ ...t, toDept: v }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {DEPARTMENTS.filter(d => d !== transfer.fromDept).map(d => (
                    <SelectItem key={d} value={d} className="font-body text-foreground">{DEPT_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-body text-xs text-cream-dim">Ingredient</Label>
              <Select value={transfer.ingredientId} onValueChange={v => setTransfer(t => ({ ...t, ingredientId: v }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent className="bg-card border-border max-h-48">
                  {transferIngredients.map((i: any) => (
                    <SelectItem key={i.id} value={i.id} className="font-body text-xs text-foreground">
                      {i.name} ({i.current_stock} {i.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-body text-xs text-cream-dim">Quantity</Label>
              <Input value={transfer.quantity} onChange={e => setTransfer(t => ({ ...t, quantity: e.target.value }))}
                type="number" placeholder="Amount to transfer" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div>
              <Label className="font-body text-xs text-cream-dim">Reason (optional)</Label>
              <Input value={transfer.reason} onChange={e => setTransfer(t => ({ ...t, reason: e.target.value }))}
                placeholder="e.g. Bar ran out" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <Button onClick={executeTransfer} className="font-display tracking-wider w-full">
              <ArrowRightLeft className="w-4 h-4 mr-2" /> Transfer Stock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryDashboard;
