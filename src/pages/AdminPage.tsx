import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, ArrowLeft, Home, Eye, EyeOff, Receipt, Search, Download, Package } from 'lucide-react';
import ResortProfileForm from '@/components/admin/ResortProfileForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EditableRow from '@/components/admin/EditableRow';
import TimePicker from '@/components/admin/TimePicker';
import OrderCard from '@/components/admin/OrderCard';
import ReportsDashboard from '@/components/admin/ReportsDashboard';
import PayrollDashboard from '@/components/admin/PayrollDashboard';
import TabInvoice from '@/components/admin/TabInvoice';
import RecipeEditor from '@/components/admin/RecipeEditor';
import InventoryDashboard from '@/components/admin/InventoryDashboard';
import { deductInventoryForOrder } from '@/lib/inventoryDeduction';
import { formatDistanceToNow } from 'date-fns';

type DateFilter = 'today' | 'yesterday' | 'all';

const AdminPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Realtime subscription for orders and tabs
  useEffect(() => {
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['orders-admin'] });
        qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabs' }, () => {
        qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

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

  const { data: orderTypes = [] } = useQuery({
    queryKey: ['order-types-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('order_types').select('*').order('sort_order');
      return data || [];
    },
  });

  const { data: menuCategories = [] } = useQuery({
    queryKey: ['menu-categories-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_categories').select('*').order('sort_order');
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
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
      return data || [];
    },
  });

  const { data: tabs = [] } = useQuery({
    queryKey: ['tabs-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('tabs').select('*').order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
  });

  // Settings state
  const [whatsapp, setWhatsapp] = useState('');
  const [brkStart, setBrkStart] = useState('');
  const [brkEnd, setBrkEnd] = useState('');

  useEffect(() => {
    if (settings) {
      setWhatsapp(settings.kitchen_whatsapp_number || '');
      setBrkStart(settings.breakfast_start_time || '07:00');
      setBrkEnd(settings.breakfast_end_time || '11:00');
    }
  }, [settings]);

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

  // Order Types
  const [newOrderType, setNewOrderType] = useState('');
  const addOrderType = async () => {
    if (!newOrderType.trim()) return;
    const maxSort = orderTypes.reduce((m, ot) => Math.max(m, ot.sort_order), 0);
    await supabase.from('order_types').insert({
      label: newOrderType.trim(),
      type_key: newOrderType.trim().replace(/\s+/g, ''),
      input_mode: 'text',
      placeholder: '',
      sort_order: maxSort + 1,
    });
    setNewOrderType('');
    qc.invalidateQueries({ queryKey: ['order-types-admin'] });
  };

  // Menu Categories
  const [newCategory, setNewCategory] = useState('');
  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const maxSort = menuCategories.reduce((m: number, c: any) => Math.max(m, c.sort_order), 0);
    await supabase.from('menu_categories').insert({ name: newCategory.trim(), sort_order: maxSort + 1 });
    setNewCategory('');
    qc.invalidateQueries({ queryKey: ['menu-categories-admin'] });
  };

  // Menu item editor
  const [menuSearch, setMenuSearch] = useState('');
  const [editItem, setEditItem] = useState<any>(null);
  const defaultCategory = menuCategories.length > 0 ? menuCategories[0].name : '';
  const [itemForm, setItemForm] = useState({
    name: '', category: defaultCategory, description: '', price: '', food_cost: '', sort_order: '0',
  });

  const openNewItem = () => {
    setEditItem('new');
    setItemForm({ name: '', category: menuCategories.length > 0 ? menuCategories[0].name : '', description: '', price: '', food_cost: '', sort_order: '0' });
  };

  const openEditItem = (item: any) => {
    setEditItem(item);
    setItemForm({
      name: item.name, category: item.category, description: item.description || '',
      price: String(item.price), food_cost: String(item.food_cost || ''), sort_order: String(item.sort_order),
    });
  };

  const saveItem = async () => {
    const payload = {
      name: itemForm.name, category: itemForm.category, description: itemForm.description,
      price: parseFloat(itemForm.price) || 0, food_cost: parseFloat(itemForm.food_cost) || 0,
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

  // Orders pipeline state
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [showClosed, setShowClosed] = useState(false);
  const [activeStatus, setActiveStatus] = useState('New');
  const [ordersSubView, setOrdersSubView] = useState<'pipeline' | 'tabs'>('pipeline');
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Date filter
    const now = new Date();
    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(o => new Date(o.created_at) >= start);
    } else if (dateFilter === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(o => {
        const d = new Date(o.created_at);
        return d >= start && d < end;
      });
    }

    // Status filter
    if (activeStatus === 'Closed' || showClosed) {
      return filtered.filter(o => o.status === activeStatus);
    }
    return filtered.filter(o => o.status === activeStatus);
  }, [orders, dateFilter, activeStatus, showClosed]);

  const statusCounts = useMemo(() => {
    const now = new Date();
    let filtered = orders;
    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(o => new Date(o.created_at) >= start);
    } else if (dateFilter === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(o => {
        const d = new Date(o.created_at);
        return d >= start && d < end;
      });
    }
    const counts: Record<string, number> = { New: 0, Preparing: 0, Served: 0, Paid: 0, Closed: 0 };
    filtered.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [orders, dateFilter]);

  const advanceOrder = async (orderId: string, nextStatus: string) => {
    const updateData: any = { status: nextStatus };
    if (nextStatus === 'Closed') {
      updateData.closed_at = new Date().toISOString();
    }
    await supabase.from('orders').update(updateData).eq('id', orderId);

    // Deduct inventory when moving to Preparing
    if (nextStatus === 'Preparing') {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const items = (order.items as any[]) || [];
        await deductInventoryForOrder(orderId, items);
        qc.invalidateQueries({ queryKey: ['ingredients'] });
      }
    }

    qc.invalidateQueries({ queryKey: ['orders-admin'] });
    toast.success(`Order → ${nextStatus}`);
  };

  const statuses = showClosed
    ? ['New', 'Preparing', 'Served', 'Paid', 'Closed']
    : ['New', 'Preparing', 'Served', 'Paid'];

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate('/')} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Home className="w-5 h-5" />
          </button>
          <h1 className="font-display text-xl tracking-wider text-foreground">Admin Dashboard</h1>
        </div>

        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="w-full bg-secondary mb-6 flex-wrap h-auto">
            <TabsTrigger value="settings" className="font-display text-xs tracking-wider flex-1 min-h-[44px]">Setup</TabsTrigger>
            <TabsTrigger value="menu" className="font-display text-xs tracking-wider flex-1 min-h-[44px]">Menu</TabsTrigger>
            <TabsTrigger value="orders" className="font-display text-xs tracking-wider flex-1 min-h-[44px]">Orders</TabsTrigger>
            <TabsTrigger value="reports" className="font-display text-xs tracking-wider flex-1 min-h-[44px]">Reports</TabsTrigger>
            <TabsTrigger value="inventory" className="font-display text-xs tracking-wider flex-1 min-h-[44px]">Inventory</TabsTrigger>
            <TabsTrigger value="payroll" className="font-display text-xs tracking-wider flex-1 min-h-[44px]">Payroll</TabsTrigger>
          </TabsList>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-8">
            <ResortProfileForm />

            <section>
              <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Kitchen Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="font-body text-xs text-cream-dim">WhatsApp Number (with country code)</label>
                  <Input value={whatsapp || settings?.kitchen_whatsapp_number || ''} onChange={e => setWhatsapp(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body mt-1" placeholder="639171234567" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TimePicker label="Breakfast Start" value={brkStart || settings?.breakfast_start_time || '07:00'} onChange={setBrkStart} />
                  <TimePicker label="Breakfast End" value={brkEnd || settings?.breakfast_end_time || '11:00'} onChange={setBrkEnd} />
                </div>
                <Button onClick={saveSettings} className="font-display tracking-wider w-full">Save Settings</Button>
              </div>
            </section>

            <section>
              <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Units / Rooms</h3>
              <div className="space-y-0">
                {units.map(u => (
                  <EditableRow key={u.id} id={u.id} name={u.unit_name} active={u.active}
                    onRename={async (id, newName) => { await supabase.from('units').update({ unit_name: newName }).eq('id', id); qc.invalidateQueries({ queryKey: ['units-admin'] }); toast.success('Unit renamed'); }}
                    onDelete={async (id) => { await supabase.from('units').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['units-admin'] }); toast.success('Unit deleted'); }}
                    onToggle={async (id, checked) => { await supabase.from('units').update({ active: checked }).eq('id', id); qc.invalidateQueries({ queryKey: ['units-admin'] }); }}
                  />
                ))}
                <div className="flex gap-2 mt-3">
                  <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="New unit name"
                    className="bg-secondary border-border text-foreground font-body" />
                  <Button onClick={addUnit} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </section>

            <section>
              <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Dine-In Tables</h3>
              <div className="space-y-0">
                {tables.map(t => (
                  <EditableRow key={t.id} id={t.id} name={t.table_name} active={t.active}
                    onRename={async (id, newName) => { await supabase.from('resort_tables').update({ table_name: newName }).eq('id', id); qc.invalidateQueries({ queryKey: ['tables-admin'] }); toast.success('Table renamed'); }}
                    onDelete={async (id) => { await supabase.from('resort_tables').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['tables-admin'] }); toast.success('Table deleted'); }}
                    onToggle={async (id, checked) => { await supabase.from('resort_tables').update({ active: checked }).eq('id', id); qc.invalidateQueries({ queryKey: ['tables-admin'] }); }}
                  />
                ))}
                <div className="flex gap-2 mt-3">
                  <Input value={newTable} onChange={e => setNewTable(e.target.value)} placeholder="New table name"
                    className="bg-secondary border-border text-foreground font-body" />
                  <Button onClick={addTable} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </section>

            <section>
              <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Order Types</h3>
              <div className="space-y-3">
                {orderTypes.map(ot => (
                  <div key={ot.id} className="space-y-2 border border-border rounded-lg p-3">
                    <EditableRow id={ot.id} name={ot.label} active={ot.active}
                      onRename={async (id, newName) => { await supabase.from('order_types').update({ label: newName }).eq('id', id); qc.invalidateQueries({ queryKey: ['order-types-admin'] }); toast.success('Order type renamed'); }}
                      onDelete={async (id) => { await supabase.from('order_types').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['order-types-admin'] }); toast.success('Order type deleted'); }}
                      onToggle={async (id, checked) => { await supabase.from('order_types').update({ active: checked }).eq('id', id); qc.invalidateQueries({ queryKey: ['order-types-admin'] }); }}
                    />
                    <div className="flex gap-2 pl-2">
                      <Select value={ot.input_mode} onValueChange={async (val) => {
                        const update: any = { input_mode: val };
                        if (val === 'text') update.source_table = null;
                        await supabase.from('order_types').update(update).eq('id', ot.id);
                        qc.invalidateQueries({ queryKey: ['order-types-admin'] });
                      }}>
                        <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="text" className="text-foreground font-body text-xs">Text</SelectItem>
                          <SelectItem value="select" className="text-foreground font-body text-xs">Dropdown</SelectItem>
                        </SelectContent>
                      </Select>
                      {ot.input_mode === 'select' && (
                        <Select value={ot.source_table || ''} onValueChange={async (val) => {
                          await supabase.from('order_types').update({ source_table: val }).eq('id', ot.id);
                          qc.invalidateQueries({ queryKey: ['order-types-admin'] });
                        }}>
                          <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 w-36">
                            <SelectValue placeholder="Source table" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            <SelectItem value="units" className="text-foreground font-body text-xs">Rooms/Units</SelectItem>
                            <SelectItem value="resort_tables" className="text-foreground font-body text-xs">Tables</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <Input value={newOrderType} onChange={e => setNewOrderType(e.target.value)} placeholder="New order type label"
                    className="bg-secondary border-border text-foreground font-body" />
                  <Button onClick={addOrderType} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </section>

            <section>
              <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Menu Categories</h3>
              <div className="space-y-0">
                {menuCategories.map((cat: any) => (
                  <EditableRow key={cat.id} id={cat.id} name={cat.name} active={cat.active}
                    onRename={async (id, newName) => { await supabase.from('menu_categories').update({ name: newName }).eq('id', id); qc.invalidateQueries({ queryKey: ['menu-categories-admin'] }); toast.success('Category renamed'); }}
                    onDelete={async (id) => { await supabase.from('menu_categories').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['menu-categories-admin'] }); toast.success('Category deleted'); }}
                    onToggle={async (id, checked) => { await supabase.from('menu_categories').update({ active: checked }).eq('id', id); qc.invalidateQueries({ queryKey: ['menu-categories-admin'] }); }}
                  />
                ))}
                <div className="flex gap-2 mt-3">
                  <Input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category name"
                    className="bg-secondary border-border text-foreground font-body" />
                  <Button onClick={addCategory} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </section>
          </TabsContent>

          {/* MENU TAB */}
          <TabsContent value="menu" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dim" />
              <Input
                value={menuSearch}
                onChange={e => setMenuSearch(e.target.value)}
                placeholder="Search menu items..."
                className="bg-secondary border-border text-foreground font-body pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={openNewItem} className="font-display tracking-wider flex-1" variant="outline">
                <Plus className="w-4 h-4 mr-2" /> Add Menu Item
              </Button>
              <Button
                variant="outline"
                className="font-display tracking-wider"
                onClick={() => {
                  let csv = 'Category,Name,Description,Price,Food Cost\n';
                  menuItems.forEach(item => {
                    csv += `"${item.category}","${item.name}","${(item.description || '').replace(/"/g, '""')}",${item.price},${item.food_cost || 0}\n`;
                  });
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `menu-items-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
            {menuItems
              .filter(item => {
                if (!menuSearch.trim()) return true;
                const q = menuSearch.toLowerCase();
                return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
              })
              .map(item => (
              <button key={item.id} onClick={() => openEditItem(item)}
                className="w-full text-left p-3 border border-border hover:border-gold/50 transition-colors">
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

          {/* ORDERS TAB — Kitchen Pipeline + Tabs */}
          <TabsContent value="orders" className="space-y-4">
            {/* Sub-view toggle */}
            <div className="flex gap-2 mb-2">
              <Button size="sm" variant={ordersSubView === 'pipeline' ? 'default' : 'outline'}
                onClick={() => { setOrdersSubView('pipeline'); setSelectedTabId(null); }}
                className="font-display text-xs tracking-wider flex-1">
                Kitchen Pipeline
              </Button>
              <Button size="sm" variant={ordersSubView === 'tabs' ? 'default' : 'outline'}
                onClick={() => setOrdersSubView('tabs')}
                className="font-display text-xs tracking-wider flex-1 gap-1">
                <Receipt className="w-3.5 h-3.5" /> Open Tabs
              </Button>
            </div>

            {ordersSubView === 'pipeline' ? (
              <>
                {/* Date filter + closed toggle */}
                <div className="flex gap-2 items-center">
                  {(['today', 'yesterday', 'all'] as DateFilter[]).map(df => (
                    <Button key={df} size="sm" variant={dateFilter === df ? 'default' : 'outline'}
                      onClick={() => setDateFilter(df)} className="font-body text-xs flex-1 capitalize">
                      {df}
                    </Button>
                  ))}
                  <Button size="icon" variant="ghost" onClick={() => setShowClosed(!showClosed)}
                    className="text-cream-dim" title={showClosed ? 'Hide Closed' : 'Show Closed'}>
                    {showClosed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Status tabs */}
                <div className="flex flex-wrap gap-1">
                  {statuses.map(s => (
                    <button key={s} onClick={() => setActiveStatus(s)}
                      className={`px-3 py-1.5 font-body text-xs rounded-md whitespace-nowrap transition-colors ${
                        activeStatus === s
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-cream-dim hover:text-foreground'
                      }`}>
                      {s} {statusCounts[s] > 0 && <span className="ml-1 font-display">({statusCounts[s]})</span>}
                    </button>
                  ))}
                </div>

                {/* Order cards */}
                <div className="space-y-3">
                  {filteredOrders.length === 0 && (
                    <p className="font-body text-cream-dim text-center py-8">No {activeStatus.toLowerCase()} orders</p>
                  )}
                  {filteredOrders.map(order => (
                    <OrderCard key={order.id} order={order} onAdvance={advanceOrder} />
                  ))}
                </div>
              </>
            ) : selectedTabId ? (
              <TabInvoice tabId={selectedTabId} onClose={() => setSelectedTabId(null)} />
            ) : (
              /* Tabs list */
              <div className="space-y-3">
                {/* Filter open/closed tabs */}
                {(() => {
                  const openTabs = tabs.filter(t => t.status === 'Open');
                  const closedTabs = tabs.filter(t => t.status === 'Closed');
                  return (
                    <>
                      {openTabs.length === 0 && closedTabs.length === 0 && (
                        <p className="font-body text-cream-dim text-center py-8">No tabs yet</p>
                      )}
                      {openTabs.length > 0 && (
                        <>
                          <p className="font-display text-xs tracking-wider text-cream-dim uppercase">Open Tabs ({openTabs.length})</p>
                          {openTabs.map(tab => {
                            const tabOrders = orders.filter(o => o.tab_id === tab.id);
                            const tabTotal = tabOrders.reduce((s, o) => s + Number(o.total) + Number(o.service_charge || 0), 0);
                            return (
                              <button key={tab.id} onClick={() => setSelectedTabId(tab.id)}
                                className="w-full text-left p-3 border border-border hover:border-gold/50 transition-colors rounded-lg">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-display text-sm text-foreground">{tab.location_detail}</p>
                                    <p className="font-body text-xs text-cream-dim">
                                      {tab.location_type} · {tabOrders.length} order{tabOrders.length !== 1 ? 's' : ''} · {formatDistanceToNow(new Date(tab.created_at), { addSuffix: true })}
                                    </p>
                                  </div>
                                  <span className="font-display text-sm text-foreground">₱{tabTotal.toLocaleString()}</span>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      )}
                      {closedTabs.length > 0 && (
                        <>
                          <p className="font-display text-xs tracking-wider text-cream-dim uppercase mt-4">Closed Tabs ({closedTabs.length})</p>
                          {closedTabs.slice(0, 20).map(tab => {
                            const tabOrders = orders.filter(o => o.tab_id === tab.id);
                            const tabTotal = tabOrders.reduce((s, o) => s + Number(o.total) + Number(o.service_charge || 0), 0);
                            return (
                              <button key={tab.id} onClick={() => setSelectedTabId(tab.id)}
                                className="w-full text-left p-3 border border-border/50 transition-colors rounded-lg opacity-60">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-display text-sm text-foreground">{tab.location_detail}</p>
                                    <p className="font-body text-xs text-cream-dim">
                                      {tab.payment_method} · {tabOrders.length} order{tabOrders.length !== 1 ? 's' : ''}
                                    </p>
                                  </div>
                                  <span className="font-display text-sm text-foreground">₱{tabTotal.toLocaleString()}</span>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </TabsContent>

          {/* REPORTS TAB */}
          <TabsContent value="reports">
            <ReportsDashboard />
          </TabsContent>

          {/* INVENTORY TAB */}
          <TabsContent value="inventory">
            <InventoryDashboard />
          </TabsContent>

          {/* PAYROLL TAB */}
          <TabsContent value="payroll">
            <PayrollDashboard />
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
              <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border max-h-60">
                {menuCategories.filter((c: any) => c.active).map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.name} className="font-body text-foreground">{cat.name}</SelectItem>
                ))}
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
                <label className="font-body text-xs text-cream-dim">Food Cost (₱) — override</label>
                <Input value={itemForm.food_cost} onChange={e => setItemForm(f => ({ ...f, food_cost: e.target.value }))}
                  type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-cream-dim">Sort Order</label>
              <Input value={itemForm.sort_order} onChange={e => setItemForm(f => ({ ...f, sort_order: e.target.value }))}
                type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            {/* Recipe editor — only for existing items */}
            {editItem && editItem !== 'new' && (
              <div className="pt-3 border-t border-border">
                <RecipeEditor
                  menuItemId={editItem.id}
                  onFoodCostUpdate={(cost) => {
                    if (cost > 0) setItemForm(f => ({ ...f, food_cost: cost.toFixed(2) }));
                  }}
                />
              </div>
            )}
            {editItem && editItem !== 'new' && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="font-body text-sm text-foreground">Available</span>
                <Switch checked={editItem.available}
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
