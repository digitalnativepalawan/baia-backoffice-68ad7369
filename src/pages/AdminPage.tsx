import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const AdminPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Data queries
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').limit(1).single();
      return data;
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').order('unit_name');
      return data || [];
    },
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('resort_tables').select('*').order('table_name');
      return data || [];
    },
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_items').select('*').order('category').order('sort_order');
      return data || [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
  });

  // Settings state
  const [whatsapp, setWhatsapp] = useState('');
  const [brkStart, setBrkStart] = useState('');
  const [brkEnd, setBrkEnd] = useState('');

  // Initialize settings values
  useState(() => {
    if (settings) {
      setWhatsapp(settings.kitchen_whatsapp_number || '');
      setBrkStart(settings.breakfast_start_time || '07:00');
      setBrkEnd(settings.breakfast_end_time || '11:00');
    }
  });

  const saveSettings = async () => {
    if (!settings) return;
    await supabase.from('settings').update({
      kitchen_whatsapp_number: whatsapp,
      breakfast_start_time: brkStart,
      breakfast_end_time: brkEnd,
    }).eq('id', settings.id);
    qc.invalidateQueries({ queryKey: ['settings'] });
    toast.success('Settings saved');
  };

  // Units
  const [newUnit, setNewUnit] = useState('');
  const addUnit = async () => {
    if (!newUnit.trim()) return;
    await supabase.from('units').insert({ unit_name: newUnit.trim() });
    setNewUnit('');
    qc.invalidateQueries({ queryKey: ['units-admin'] });
  };

  // Tables
  const [newTable, setNewTable] = useState('');
  const addTable = async () => {
    if (!newTable.trim()) return;
    await supabase.from('resort_tables').insert({ table_name: newTable.trim() });
    setNewTable('');
    qc.invalidateQueries({ queryKey: ['tables-admin'] });
  };

  // Menu item editor
  const [editItem, setEditItem] = useState<any>(null);
  const [itemForm, setItemForm] = useState({
    name: '', category: 'Starters', description: '', price: '', food_cost: '', sort_order: '0',
  });

  const openNewItem = () => {
    setEditItem('new');
    setItemForm({ name: '', category: 'Starters', description: '', price: '', food_cost: '', sort_order: '0' });
  };

  const openEditItem = (item: any) => {
    setEditItem(item);
    setItemForm({
      name: item.name,
      category: item.category,
      description: item.description || '',
      price: String(item.price),
      food_cost: String(item.food_cost || ''),
      sort_order: String(item.sort_order),
    });
  };

  const saveItem = async () => {
    const payload = {
      name: itemForm.name,
      category: itemForm.category,
      description: itemForm.description,
      price: parseFloat(itemForm.price) || 0,
      food_cost: parseFloat(itemForm.food_cost) || 0,
      sort_order: parseInt(itemForm.sort_order) || 0,
    };

    if (editItem === 'new') {
      await supabase.from('menu_items').insert(payload);
    } else {
      await supabase.from('menu_items').update(payload).eq('id', editItem.id);
    }
    setEditItem(null);
    qc.invalidateQueries({ queryKey: ['menu-admin'] });
    toast.success('Menu item saved');
  };

  return (
    <div className="min-h-screen bg-navy-texture">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate('/')} className="text-cream-dim hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-xl tracking-wider text-foreground">Admin Dashboard</h1>
        </div>

        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="w-full bg-secondary mb-6">
            <TabsTrigger value="settings" className="font-display text-xs tracking-wider flex-1">Setup</TabsTrigger>
            <TabsTrigger value="menu" className="font-display text-xs tracking-wider flex-1">Menu</TabsTrigger>
            <TabsTrigger value="orders" className="font-display text-xs tracking-wider flex-1">Orders</TabsTrigger>
          </TabsList>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-8">
            {/* WhatsApp & Hours */}
            <section>
              <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Kitchen Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="font-body text-xs text-cream-dim">WhatsApp Number (with country code)</label>
                  <Input value={whatsapp || settings?.kitchen_whatsapp_number || ''} onChange={e => setWhatsapp(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body mt-1" placeholder="639171234567" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-body text-xs text-cream-dim">Breakfast Start</label>
                    <Input type="time" value={brkStart || settings?.breakfast_start_time || '07:00'} onChange={e => setBrkStart(e.target.value)}
                      className="bg-secondary border-border text-foreground font-body mt-1" />
                  </div>
                  <div>
                    <label className="font-body text-xs text-cream-dim">Breakfast End</label>
                    <Input type="time" value={brkEnd || settings?.breakfast_end_time || '11:00'} onChange={e => setBrkEnd(e.target.value)}
                      className="bg-secondary border-border text-foreground font-body mt-1" />
                  </div>
                </div>
                <Button onClick={saveSettings} className="font-display tracking-wider w-full">Save Settings</Button>
              </div>
            </section>

            {/* Units */}
            <section>
              <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Units / Rooms</h3>
              <div className="space-y-2">
                {units.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b border-border">
                    <span className="font-body text-sm text-foreground">{u.unit_name}</span>
                    <Switch
                      checked={u.active}
                      onCheckedChange={async (checked) => {
                        await supabase.from('units').update({ active: checked }).eq('id', u.id);
                        qc.invalidateQueries({ queryKey: ['units-admin'] });
                      }}
                    />
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="New unit name"
                    className="bg-secondary border-border text-foreground font-body" />
                  <Button onClick={addUnit} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </section>

            {/* Tables */}
            <section>
              <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Dine-In Tables</h3>
              <div className="space-y-2">
                {tables.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-border">
                    <span className="font-body text-sm text-foreground">{t.table_name}</span>
                    <Switch
                      checked={t.active}
                      onCheckedChange={async (checked) => {
                        await supabase.from('resort_tables').update({ active: checked }).eq('id', t.id);
                        qc.invalidateQueries({ queryKey: ['tables-admin'] });
                      }}
                    />
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <Input value={newTable} onChange={e => setNewTable(e.target.value)} placeholder="New table name"
                    className="bg-secondary border-border text-foreground font-body" />
                  <Button onClick={addTable} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </section>
          </TabsContent>

          {/* MENU TAB */}
          <TabsContent value="menu" className="space-y-4">
            <Button onClick={openNewItem} className="font-display tracking-wider w-full" variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Add Menu Item
            </Button>
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => openEditItem(item)}
                className="w-full text-left p-3 border border-border hover:border-gold/50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-display text-sm text-foreground">{item.name}</p>
                    <p className="font-body text-xs text-cream-dim">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-sm text-foreground">₱{item.price}</p>
                    {!item.available && <span className="font-body text-xs text-destructive">Unavailable</span>}
                  </div>
                </div>
              </button>
            ))}
          </TabsContent>

          {/* ORDERS TAB */}
          <TabsContent value="orders" className="space-y-3">
            {orders.length === 0 && <p className="font-body text-cream-dim text-center py-8">No orders yet</p>}
            {orders.map(order => (
              <div key={order.id} className="p-3 border border-border">
                <div className="flex justify-between mb-2">
                  <span className="font-display text-sm text-foreground">{order.order_type} — {order.location_detail}</span>
                  <span className="font-body text-xs text-cream-dim">
                    {new Date(order.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="font-body text-xs text-cream-dim">
                  {(order.items as any[])?.map((i: any, idx: number) => (
                    <span key={idx}>{i.qty}x {i.name}{idx < (order.items as any[]).length - 1 ? ', ' : ''}</span>
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="font-body text-xs text-gold">₱{order.total}</span>
                  <span className={`font-body text-xs ${order.status === 'New' ? 'text-gold' : 'text-cream-dim'}`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* Menu item edit dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider">
              {editItem === 'new' ? 'New Item' : 'Edit Item'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name" className="bg-secondary border-border text-foreground font-body" />
            <Select value={itemForm.category} onValueChange={v => setItemForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="Breakfast" className="font-body text-foreground">Breakfast</SelectItem>
                <SelectItem value="Starters" className="font-body text-foreground">Starters</SelectItem>
                <SelectItem value="Main Courses" className="font-body text-foreground">Main Courses</SelectItem>
              </SelectContent>
            </Select>
            <Input value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description" className="bg-secondary border-border text-foreground font-body" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs text-cream-dim">Price (₱)</label>
                <Input value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))}
                  type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
              <div>
                <label className="font-body text-xs text-cream-dim">Food Cost (₱)</label>
                <Input value={itemForm.food_cost} onChange={e => setItemForm(f => ({ ...f, food_cost: e.target.value }))}
                  type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-cream-dim">Sort Order</label>
              <Input value={itemForm.sort_order} onChange={e => setItemForm(f => ({ ...f, sort_order: e.target.value }))}
                type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            {editItem && editItem !== 'new' && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="font-body text-sm text-foreground">Available</span>
                <Switch
                  checked={editItem.available}
                  onCheckedChange={async (checked) => {
                    await supabase.from('menu_items').update({ available: checked }).eq('id', editItem.id);
                    qc.invalidateQueries({ queryKey: ['menu-admin'] });
                    setEditItem({ ...editItem, available: checked });
                  }}
                />
              </div>
            )}
            <Button onClick={saveItem} className="font-display tracking-wider w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;
