import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, AlertTriangle, Upload, Pencil, Check, X } from 'lucide-react';
import ImportReservationsModal from './ImportReservationsModal';
import { format, startOfMonth, endOfMonth, getDaysInMonth, eachDayOfInterval, isWithinInterval, parseISO, isBefore } from 'date-fns';

const MONTHS = [
  '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
  '2026-06', '2026-07', '2026-08', '2026-09',
];

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(mo) - 1]} ${y}`;
};

const from = (table: string) => supabase.from(table as any);

const ResortOpsDashboard = () => {
  const qc = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return MONTHS.includes(cur) ? cur : MONTHS[0];
  });

  const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = getDaysInMonth(monthStart);
  const daysArray = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  // ── Data queries ──
  const { data: units = [] } = useQuery({
    queryKey: ['resort-ops-units'],
    queryFn: async () => { const { data } = await from('resort_ops_units').select('*').order('name'); return data || []; },
  });
  const { data: guests = [] } = useQuery({
    queryKey: ['resort-ops-guests'],
    queryFn: async () => { const { data } = await from('resort_ops_guests').select('*').order('full_name'); return data || []; },
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ['resort-ops-bookings'],
    queryFn: async () => { const { data } = await from('resort_ops_bookings').select('*').order('check_in'); return data || []; },
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ['resort-ops-expenses'],
    queryFn: async () => { const { data } = await from('resort_ops_expenses').select('*').order('expense_date', { ascending: false }); return data || []; },
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ['resort-ops-tasks'],
    queryFn: async () => { const { data } = await from('resort_ops_tasks').select('*').order('due_date'); return data || []; },
  });
  const { data: assets = [] } = useQuery({
    queryKey: ['resort-ops-assets'],
    queryFn: async () => { const { data } = await from('resort_ops_assets').select('*').order('name'); return data || []; },
  });
  const { data: payments = [] } = useQuery({
    queryKey: ['resort-ops-payments'],
    queryFn: async () => { const { data } = await from('resort_ops_incoming_payments').select('*').order('expected_date'); return data || []; },
  });
  const { data: orders = [] } = useQuery({
    queryKey: ['resort-ops-orders', selectedMonth],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*')
        .gte('created_at', monthStartStr)
        .lte('created_at', monthEndStr + 'T23:59:59')
        .in('status', ['Paid', 'Closed']);
      return data || [];
    },
  });
  const { data: menuItems = [] } = useQuery({
    queryKey: ['resort-ops-menu'],
    queryFn: async () => { const { data } = await supabase.from('menu_items').select('*'); return data || []; },
  });

  // ── Filtered data ──
  const monthBookings = useMemo(() => bookings.filter((b: any) => b.check_in >= monthStartStr && b.check_in <= monthEndStr), [bookings, monthStartStr, monthEndStr]);
  const monthExpenses = useMemo(() => expenses.filter((e: any) => e.expense_date >= monthStartStr && e.expense_date <= monthEndStr), [expenses, monthStartStr, monthEndStr]);
  const monthTasks = useMemo(() => tasks.filter((t: any) => t.due_date >= monthStartStr && t.due_date <= monthEndStr), [tasks, monthStartStr, monthEndStr]);
  const monthPayments = useMemo(() => payments.filter((p: any) => p.expected_date >= monthStartStr && p.expected_date <= monthEndStr), [payments, monthStartStr, monthEndStr]);

  // ── KPI calculations ──
  const revenue = useMemo(() => monthBookings.reduce((s: number, b: any) => s + Number(b.paid_amount || 0), 0), [monthBookings]);
  const totalExpenses = useMemo(() => monthExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0), [monthExpenses]);
  const foodCost = useMemo(() => {
    const menuMap = new Map(menuItems.map((m: any) => [m.name, m.food_cost || 0]));
    return orders.reduce((sum: number, o: any) => {
      const items = (o.items as any[]) || [];
      return sum + items.reduce((s: number, i: any) => s + (Number(menuMap.get(i.name) || 0) * (i.qty || 1)), 0);
    }, 0);
  }, [orders, menuItems]);
  const netProfit = revenue - totalExpenses;
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // ── Lookup helpers ──
  const guestMap = useMemo(() => new Map(guests.map((g: any) => [g.id, g.full_name])), [guests]);
  const unitMap = useMemo(() => new Map(units.map((u: any) => [u.id, u])), [units]);

  // ── Occupancy ──
  const occupancyData = useMemo(() => {
    return units.map((unit: any) => {
      const unitBookings = bookings.filter((b: any) => b.unit_id === unit.id);
      let bookedDays = 0;
      daysArray.forEach(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isBooked = unitBookings.some((b: any) => dayStr >= b.check_in && dayStr < b.check_out);
        if (isBooked) bookedDays++;
      });
      const pct = daysInMonth > 0 ? (bookedDays / daysInMonth) * 100 : 0;
      return { unit, bookedDays, pct, unitBookings };
    });
  }, [units, bookings, daysArray, daysInMonth]);

  // ── Unit performance ──
  const unitPerformance = useMemo(() => {
    return units.map((unit: any) => {
      const projected = Number(unit.base_price) * daysInMonth;
      const realized = monthBookings.filter((b: any) => b.unit_id === unit.id).reduce((s: number, b: any) => s + Number(b.paid_amount || 0), 0);
      const variance = realized - projected;
      const occPct = occupancyData.find((o: any) => o.unit.id === unit.id)?.pct || 0;
      const status = occPct > 90 ? 'HIGH' : occPct >= 50 ? 'ON_TRACK' : 'LOW';
      return { unit, projected, realized, variance, status };
    });
  }, [units, monthBookings, daysInMonth, occupancyData]);

  // ── Inline add forms state ──
  const [newExpense, setNewExpense] = useState({ name: '', category: '', amount: '', expense_date: '' });
  const [newTask, setNewTask] = useState({ title: '', category: '', due_date: '', priority: 'medium', description: '' });
  const [newAsset, setNewAsset] = useState({ name: '', type: '', balance: '' });
  const [newPayment, setNewPayment] = useState({ source: '', amount: '', expected_date: '' });
  const [newUnit, setNewUnit] = useState({ name: '', type: '', base_price: '', capacity: '' });
  const [newGuest, setNewGuest] = useState({ full_name: '', email: '', phone: '' });
  const [newBooking, setNewBooking] = useState({ guest_id: '', unit_id: '', platform: '', check_in: '', check_out: '', adults: '1', room_rate: '', addons_total: '0', paid_amount: '0', commission_applied: '0' });
  const [importOpen, setImportOpen] = useState(false);

  // ── Editing states ──
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [editingGuest, setEditingGuest] = useState<any>(null);
  const [editingBooking, setEditingBooking] = useState<any>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [editingPayment, setEditingPayment] = useState<any>(null);

  // ── CRUD helpers ──
  const invalidateAll = () => {
    ['resort-ops-units','resort-ops-guests','resort-ops-bookings','resort-ops-expenses','resort-ops-tasks','resort-ops-assets','resort-ops-payments'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  };

  const addExpense = async () => {
    if (!newExpense.name || !newExpense.amount || !newExpense.expense_date) return;
    await from('resort_ops_expenses').insert({ name: newExpense.name, category: newExpense.category, amount: parseFloat(newExpense.amount), expense_date: newExpense.expense_date });
    setNewExpense({ name: '', category: '', amount: '', expense_date: '' });
    invalidateAll();
    toast.success('Expense added');
  };

  const deleteRow = async (table: string, id: string) => {
    await from(table).delete().eq('id', id);
    invalidateAll();
    toast.success('Deleted');
  };

  const addTask = async () => {
    if (!newTask.title || !newTask.due_date) return;
    await from('resort_ops_tasks').insert({ title: newTask.title, category: newTask.category, due_date: newTask.due_date, priority: newTask.priority, description: newTask.description });
    setNewTask({ title: '', category: '', due_date: '', priority: 'medium', description: '' });
    invalidateAll();
    toast.success('Task added');
  };

  const toggleTaskStatus = async (id: string, current: string) => {
    const next = current === 'pending' ? 'in_progress' : current === 'in_progress' ? 'done' : 'pending';
    await from('resort_ops_tasks').update({ status: next }).eq('id', id);
    invalidateAll();
  };

  const addAsset = async () => {
    if (!newAsset.name) return;
    await from('resort_ops_assets').insert({ name: newAsset.name, type: newAsset.type, balance: parseFloat(newAsset.balance) || 0 });
    setNewAsset({ name: '', type: '', balance: '' });
    invalidateAll();
    toast.success('Asset added');
  };

  const addPayment = async () => {
    if (!newPayment.source || !newPayment.amount || !newPayment.expected_date) return;
    await from('resort_ops_incoming_payments').insert({ source: newPayment.source, amount: parseFloat(newPayment.amount), expected_date: newPayment.expected_date });
    setNewPayment({ source: '', amount: '', expected_date: '' });
    invalidateAll();
    toast.success('Payment added');
  };

  const addUnit = async () => {
    if (!newUnit.name) return;
    await from('resort_ops_units').insert({ name: newUnit.name, type: newUnit.type, base_price: parseFloat(newUnit.base_price) || 0, capacity: parseInt(newUnit.capacity) || 2 });
    setNewUnit({ name: '', type: '', base_price: '', capacity: '' });
    invalidateAll();
    toast.success('Unit added');
  };

  const addGuest = async () => {
    if (!newGuest.full_name) return;
    await from('resort_ops_guests').insert({ full_name: newGuest.full_name, email: newGuest.email, phone: newGuest.phone });
    setNewGuest({ full_name: '', email: '', phone: '' });
    invalidateAll();
    toast.success('Guest added');
  };

  const addBooking = async () => {
    if (!newBooking.guest_id || !newBooking.unit_id || !newBooking.check_in || !newBooking.check_out) return;
    await from('resort_ops_bookings').insert({
      guest_id: newBooking.guest_id, unit_id: newBooking.unit_id, platform: newBooking.platform,
      check_in: newBooking.check_in, check_out: newBooking.check_out, adults: parseInt(newBooking.adults) || 1,
      room_rate: parseFloat(newBooking.room_rate) || 0, addons_total: parseFloat(newBooking.addons_total) || 0,
      paid_amount: parseFloat(newBooking.paid_amount) || 0, commission_applied: parseFloat(newBooking.commission_applied) || 0,
    });
    setNewBooking({ guest_id: '', unit_id: '', platform: '', check_in: '', check_out: '', adults: '1', room_rate: '', addons_total: '0', paid_amount: '0', commission_applied: '0' });
    invalidateAll();
    toast.success('Booking added');
  };

  // ── Save edit handlers ──
  const saveUnit = async () => {
    if (!editingUnit) return;
    await from('resort_ops_units').update({ name: editingUnit.name, type: editingUnit.type, base_price: parseFloat(editingUnit.base_price) || 0, capacity: parseInt(editingUnit.capacity) || 2 }).eq('id', editingUnit.id);
    setEditingUnit(null);
    invalidateAll();
    toast.success('Unit updated');
  };

  const saveGuest = async () => {
    if (!editingGuest) return;
    await from('resort_ops_guests').update({ full_name: editingGuest.full_name, email: editingGuest.email || null, phone: editingGuest.phone || null }).eq('id', editingGuest.id);
    setEditingGuest(null);
    invalidateAll();
    toast.success('Guest updated');
  };

  const saveBooking = async () => {
    if (!editingBooking) return;
    await from('resort_ops_bookings').update({
      guest_id: editingBooking.guest_id, unit_id: editingBooking.unit_id, platform: editingBooking.platform,
      check_in: editingBooking.check_in, check_out: editingBooking.check_out, adults: parseInt(editingBooking.adults) || 1,
      room_rate: parseFloat(editingBooking.room_rate) || 0, addons_total: parseFloat(editingBooking.addons_total) || 0,
      paid_amount: parseFloat(editingBooking.paid_amount) || 0, commission_applied: parseFloat(editingBooking.commission_applied) || 0,
    }).eq('id', editingBooking.id);
    setEditingBooking(null);
    invalidateAll();
    toast.success('Booking updated');
  };

  const saveExpense = async () => {
    if (!editingExpense) return;
    await from('resort_ops_expenses').update({ name: editingExpense.name, category: editingExpense.category, amount: parseFloat(editingExpense.amount) || 0, expense_date: editingExpense.expense_date }).eq('id', editingExpense.id);
    setEditingExpense(null);
    invalidateAll();
    toast.success('Expense updated');
  };

  const saveTask = async () => {
    if (!editingTask) return;
    await from('resort_ops_tasks').update({ title: editingTask.title, category: editingTask.category, due_date: editingTask.due_date, priority: editingTask.priority, description: editingTask.description || '' }).eq('id', editingTask.id);
    setEditingTask(null);
    invalidateAll();
    toast.success('Task updated');
  };

  const saveAsset = async () => {
    if (!editingAsset) return;
    await from('resort_ops_assets').update({ name: editingAsset.name, type: editingAsset.type, balance: parseFloat(editingAsset.balance) || 0 }).eq('id', editingAsset.id);
    setEditingAsset(null);
    invalidateAll();
    toast.success('Asset updated');
  };

  const savePayment = async () => {
    if (!editingPayment) return;
    await from('resort_ops_incoming_payments').update({ source: editingPayment.source, amount: parseFloat(editingPayment.amount) || 0, expected_date: editingPayment.expected_date }).eq('id', editingPayment.id);
    setEditingPayment(null);
    invalidateAll();
    toast.success('Payment updated');
  };

  const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const today = format(new Date(), 'yyyy-MM-dd');

  // Reusable action buttons
  const EditBtn = ({ onClick }: { onClick: () => void }) => (
    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary flex-shrink-0" onClick={onClick}><Pencil className="w-3.5 h-3.5" /></Button>
  );
  const DelBtn = ({ onClick }: { onClick: () => void }) => (
    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={onClick}><Trash2 className="w-3.5 h-3.5" /></Button>
  );
  const SaveCancelBtns = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-400 hover:text-green-300 flex-shrink-0" onClick={onSave}><Check className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={onCancel}><X className="w-3.5 h-3.5" /></Button>
    </div>
  );

  const inputCls = "bg-secondary border-border text-foreground font-body text-xs h-8";

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex flex-wrap gap-1.5">
        {MONTHS.map(m => (
          <Button key={m} size="sm" variant={selectedMonth === m ? 'default' : 'outline'}
            className="font-display text-xs tracking-wider" onClick={() => setSelectedMonth(m)}>
            {monthLabel(m)}
          </Button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Revenue', value: `₱${fmt(revenue)}` },
          { label: 'Food Cost', value: `₱${fmt(foodCost)}` },
          { label: 'Net Profit', value: `₱${fmt(netProfit)}` },
          { label: 'Margin %', value: `${margin.toFixed(1)}%` },
          { label: 'Room Revenue', value: `₱${fmt(revenue)}` },
          { label: 'Total Expenses', value: `₱${fmt(totalExpenses)}` },
        ].map(kpi => (
          <Card key={kpi.label} className="bg-card border-border">
            <CardContent className="p-4">
              <p className="font-body text-xs text-muted-foreground">{kpi.label}</p>
              <p className="font-display text-lg text-foreground">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Units Management ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Accommodation Units</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {units.map((u: any) => (
              editingUnit?.id === u.id ? (
                <div key={u.id} className="p-3 rounded border border-primary/50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editingUnit.name} onChange={e => setEditingUnit((p: any) => ({...p, name: e.target.value}))} placeholder="Name" className={inputCls} />
                    <Input value={editingUnit.type} onChange={e => setEditingUnit((p: any) => ({...p, type: e.target.value}))} placeholder="Type" className={inputCls} />
                    <Input value={editingUnit.base_price} onChange={e => setEditingUnit((p: any) => ({...p, base_price: e.target.value}))} placeholder="Price/night" type="number" className={inputCls} />
                    <Input value={editingUnit.capacity} onChange={e => setEditingUnit((p: any) => ({...p, capacity: e.target.value}))} placeholder="Capacity" type="number" className={inputCls} />
                  </div>
                  <div className="flex justify-end"><SaveCancelBtns onSave={saveUnit} onCancel={() => setEditingUnit(null)} /></div>
                </div>
              ) : (
                <div key={u.id} className="flex items-center justify-between py-2 px-2 border-b border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm text-foreground font-medium">{u.name}</p>
                    <p className="font-body text-xs text-muted-foreground">{u.type} · ₱{fmt(Number(u.base_price))}/night · {u.capacity} pax</p>
                  </div>
                  <div className="flex gap-0.5">
                    <EditBtn onClick={() => setEditingUnit({ ...u, base_price: String(u.base_price), capacity: String(u.capacity) })} />
                    <DelBtn onClick={() => deleteRow('resort_ops_units', u.id)} />
                  </div>
                </div>
              )
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Input placeholder="Name" value={newUnit.name} onChange={e => setNewUnit(p => ({...p, name: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <Input placeholder="Type" value={newUnit.type} onChange={e => setNewUnit(p => ({...p, type: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <Input placeholder="Price/night" type="number" value={newUnit.base_price} onChange={e => setNewUnit(p => ({...p, base_price: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <Input placeholder="Capacity" type="number" value={newUnit.capacity} onChange={e => setNewUnit(p => ({...p, capacity: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
          </div>
          <Button size="sm" onClick={addUnit} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Unit</Button>
        </CardContent>
      </Card>

      {/* ── Guests ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Guests</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {[...guests].filter((g: any) => bookings.some((bk: any) => bk.guest_id === g.id && bk.check_in >= monthStartStr && bk.check_in <= monthEndStr)).sort((a: any, b: any) => {
              const aMin = bookings.filter((bk: any) => bk.guest_id === a.id && bk.check_in >= monthStartStr && bk.check_in <= monthEndStr).reduce((m: string, bk: any) => bk.check_in < m ? bk.check_in : m, '9999-12-31');
              const bMin = bookings.filter((bk: any) => bk.guest_id === b.id && bk.check_in >= monthStartStr && bk.check_in <= monthEndStr).reduce((m: string, bk: any) => bk.check_in < m ? bk.check_in : m, '9999-12-31');
              return aMin.localeCompare(bMin);
            }).map((g: any) => {
              const guestBookings = bookings.filter((b: any) => b.guest_id === g.id && b.check_in >= monthStartStr && b.check_in <= monthEndStr);
              if (editingGuest?.id === g.id) {
                return (
                  <div key={g.id} className="p-3 rounded border border-primary/50 space-y-2">
                    <Input value={editingGuest.full_name} onChange={e => setEditingGuest((p: any) => ({...p, full_name: e.target.value}))} placeholder="Full name" className={inputCls} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={editingGuest.email || ''} onChange={e => setEditingGuest((p: any) => ({...p, email: e.target.value}))} placeholder="Email" className={inputCls} />
                      <Input value={editingGuest.phone || ''} onChange={e => setEditingGuest((p: any) => ({...p, phone: e.target.value}))} placeholder="Phone" className={inputCls} />
                    </div>
                    <div className="flex justify-end"><SaveCancelBtns onSave={saveGuest} onCancel={() => setEditingGuest(null)} /></div>
                  </div>
                );
              }
              return (
                <div key={g.id} className="p-3 rounded border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-body text-sm text-foreground font-medium">{g.full_name}</p>
                    <div className="flex gap-0.5">
                      <EditBtn onClick={() => setEditingGuest({ ...g })} />
                      <DelBtn onClick={() => deleteRow('resort_ops_guests', g.id)} />
                    </div>
                  </div>
                  {guestBookings.length > 0 ? guestBookings.map((b: any) => (
                    <div key={b.id} className="font-body text-xs text-muted-foreground border-t border-border pt-1 mt-1">
                      <p>{b.check_in} → {b.check_out} · {b.adults} guest{b.adults !== 1 ? 's' : ''} · {b.platform || '—'}</p>
                      <p>{unitMap.get(b.unit_id)?.name || '—'} · ₱{fmt(Number(b.room_rate || 0))} / Paid ₱{fmt(Number(b.paid_amount || 0))}</p>
                    </div>
                  )) : (
                    <p className="font-body text-xs text-muted-foreground italic">No bookings</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="space-y-2 pt-2">
            <Input placeholder="Full name" value={newGuest.full_name} onChange={e => setNewGuest(p => ({...p, full_name: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Email" value={newGuest.email} onChange={e => setNewGuest(p => ({...p, email: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
              <Input placeholder="Phone" value={newGuest.phone} onChange={e => setNewGuest(p => ({...p, phone: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            </div>
          </div>
          <Button size="sm" onClick={addGuest} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Guest</Button>
        </CardContent>
      </Card>

      {/* ── Reservations Ledger ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="font-display text-sm tracking-wider">Reservations Ledger</CardTitle>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setImportOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Import CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-3">
            {monthBookings.map((b: any) => (
              editingBooking?.id === b.id ? (
                <div key={b.id} className="p-3 rounded border border-primary/50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={editingBooking.guest_id} onValueChange={v => setEditingBooking((p: any) => ({...p, guest_id: v}))}>
                      <SelectTrigger className={inputCls}><SelectValue placeholder="Guest" /></SelectTrigger>
                      <SelectContent>{guests.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={editingBooking.unit_id} onValueChange={v => setEditingBooking((p: any) => ({...p, unit_id: v}))}>
                      <SelectTrigger className={inputCls}><SelectValue placeholder="Unit" /></SelectTrigger>
                      <SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Input value={editingBooking.platform} onChange={e => setEditingBooking((p: any) => ({...p, platform: e.target.value}))} placeholder="Platform" className={inputCls} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="font-body text-xs text-muted-foreground">Check-in</label><Input type="date" value={editingBooking.check_in} onChange={e => setEditingBooking((p: any) => ({...p, check_in: e.target.value}))} className={inputCls} /></div>
                    <div><label className="font-body text-xs text-muted-foreground">Check-out</label><Input type="date" value={editingBooking.check_out} onChange={e => setEditingBooking((p: any) => ({...p, check_out: e.target.value}))} className={inputCls} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editingBooking.room_rate} onChange={e => setEditingBooking((p: any) => ({...p, room_rate: e.target.value}))} placeholder="Room rate" type="number" className={inputCls} />
                    <Input value={editingBooking.paid_amount} onChange={e => setEditingBooking((p: any) => ({...p, paid_amount: e.target.value}))} placeholder="Paid amount" type="number" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editingBooking.adults} onChange={e => setEditingBooking((p: any) => ({...p, adults: e.target.value}))} placeholder="Adults" type="number" className={inputCls} />
                    <Input value={editingBooking.commission_applied} onChange={e => setEditingBooking((p: any) => ({...p, commission_applied: e.target.value}))} placeholder="Commission" type="number" className={inputCls} />
                  </div>
                  <div className="flex justify-end"><SaveCancelBtns onSave={saveBooking} onCancel={() => setEditingBooking(null)} /></div>
                </div>
              ) : (
                <div key={b.id} className="p-3 rounded border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-body text-sm text-foreground font-medium">{guestMap.get(b.guest_id) || '—'}</p>
                    <div className="flex gap-0.5">
                      <EditBtn onClick={() => setEditingBooking({ ...b, room_rate: String(b.room_rate), paid_amount: String(b.paid_amount), adults: String(b.adults), addons_total: String(b.addons_total), commission_applied: String(b.commission_applied) })} />
                      <DelBtn onClick={() => deleteRow('resort_ops_bookings', b.id)} />
                    </div>
                  </div>
                  <p className="font-body text-xs text-muted-foreground">{unitMap.get(b.unit_id)?.name || '—'} · {b.platform}</p>
                  <div className="flex justify-between font-body text-xs text-muted-foreground">
                    <span>{b.check_in} → {b.check_out}</span>
                  </div>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-muted-foreground">Rate: <span className="text-foreground">₱{fmt(Number(b.room_rate))}</span></span>
                    <span className="text-muted-foreground">Paid: <span className="text-foreground">₱{fmt(Number(b.paid_amount))}</span></span>
                    <span className="text-muted-foreground">Bal: <span className="text-foreground">₱{fmt(Number(b.room_rate) - Number(b.paid_amount))}</span></span>
                  </div>
                </div>
              )
            ))}
            {monthBookings.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-4">No bookings this month</p>}
          </div>
          {/* Add booking inline */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="grid grid-cols-2 gap-2">
              <Select value={newBooking.guest_id} onValueChange={v => setNewBooking(p => ({...p, guest_id: v}))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue placeholder="Guest" /></SelectTrigger>
                <SelectContent>{guests.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newBooking.unit_id} onValueChange={v => setNewBooking(p => ({...p, unit_id: v}))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Input placeholder="Platform" value={newBooking.platform} onChange={e => setNewBooking(p => ({...p, platform: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <div className="grid grid-cols-2 gap-2">
              <div><label className="font-body text-xs text-muted-foreground">Check-in</label><Input type="date" value={newBooking.check_in} onChange={e => setNewBooking(p => ({...p, check_in: e.target.value}))} className="bg-secondary border-border text-foreground font-body" /></div>
              <div><label className="font-body text-xs text-muted-foreground">Check-out</label><Input type="date" value={newBooking.check_out} onChange={e => setNewBooking(p => ({...p, check_out: e.target.value}))} className="bg-secondary border-border text-foreground font-body" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Room rate" type="number" value={newBooking.room_rate} onChange={e => setNewBooking(p => ({...p, room_rate: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
              <Input placeholder="Paid amount" type="number" value={newBooking.paid_amount} onChange={e => setNewBooking(p => ({...p, paid_amount: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            </div>
            <Button size="sm" onClick={addBooking} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Booking</Button>
          </div>
        </CardContent>
        <ImportReservationsModal open={importOpen} onOpenChange={setImportOpen} guests={guests} units={units} onComplete={invalidateAll} />
      </Card>

      {/* ── Occupancy Grid ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Occupancy Grid</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {occupancyData.map(({ unit, pct, unitBookings }: any) => {
            const color = pct > 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
            const textColor = pct > 90 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
            return (
              <div key={unit.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-body text-xs text-foreground">{unit.name}</span>
                  <span className={`font-body text-xs font-bold ${textColor}`}>{pct.toFixed(0)}%</span>
                </div>
                <div className="flex gap-px">
                  {daysArray.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const isBooked = unitBookings.some((b: any) => dayStr >= b.check_in && dayStr < b.check_out);
                    return (
                      <div key={dayStr} className={`h-4 flex-1 rounded-[1px] ${isBooked ? color : 'bg-secondary'}`}
                        title={`${format(day, 'MMM d')} ${isBooked ? '● Booked' : '○ Available'}`} />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {units.length === 0 && <p className="font-body text-sm text-muted-foreground">Add units above to see occupancy</p>}
        </CardContent>
      </Card>

      {/* ── Unit Performance ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Unit Performance</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {unitPerformance.map(({ unit, projected, realized, variance, status }: any) => (
            <div key={unit.id} className="p-3 rounded border border-border space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-body text-sm text-foreground font-medium">{unit.name}</p>
                <Badge variant={status === 'HIGH' ? 'default' : status === 'ON_TRACK' ? 'secondary' : 'destructive'}
                  className="font-body text-[10px]">{status}</Badge>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground">Projected: <span className="text-foreground">₱{fmt(projected)}</span></span>
                <span className="text-muted-foreground">Realized: <span className="text-foreground">₱{fmt(realized)}</span></span>
              </div>
              <p className={`font-body text-xs ${variance >= 0 ? 'text-green-400' : 'text-red-400'}`}>Variance: ₱{fmt(variance)}</p>
            </div>
          ))}
          {units.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-4">No units configured</p>}
        </CardContent>
      </Card>

      {/* ── Expenses Ledger ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Expenses</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {monthExpenses.map((e: any) => (
              editingExpense?.id === e.id ? (
                <div key={e.id} className="p-3 rounded border border-primary/50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editingExpense.name} onChange={ev => setEditingExpense((p: any) => ({...p, name: ev.target.value}))} placeholder="Name" className={inputCls} />
                    <Input value={editingExpense.category} onChange={ev => setEditingExpense((p: any) => ({...p, category: ev.target.value}))} placeholder="Category" className={inputCls} />
                    <Input value={editingExpense.amount} onChange={ev => setEditingExpense((p: any) => ({...p, amount: ev.target.value}))} placeholder="Amount" type="number" className={inputCls} />
                    <Input value={editingExpense.expense_date} onChange={ev => setEditingExpense((p: any) => ({...p, expense_date: ev.target.value}))} type="date" className={inputCls} />
                  </div>
                  <div className="flex justify-end"><SaveCancelBtns onSave={saveExpense} onCancel={() => setEditingExpense(null)} /></div>
                </div>
              ) : (
                <div key={e.id} className="flex items-center justify-between py-2 px-2 border-b border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm text-foreground font-medium">{e.name}</p>
                    <p className="font-body text-xs text-muted-foreground">{e.category} · {e.expense_date}</p>
                  </div>
                  <span className="font-body text-sm text-foreground mr-2">₱{fmt(Number(e.amount))}</span>
                  <div className="flex gap-0.5">
                    <EditBtn onClick={() => setEditingExpense({ ...e, amount: String(e.amount) })} />
                    <DelBtn onClick={() => deleteRow('resort_ops_expenses', e.id)} />
                  </div>
                </div>
              )
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Input placeholder="Name" value={newExpense.name} onChange={e => setNewExpense(p => ({...p, name: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <Input placeholder="Category" value={newExpense.category} onChange={e => setNewExpense(p => ({...p, category: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <Input placeholder="Amount" type="number" value={newExpense.amount} onChange={e => setNewExpense(p => ({...p, amount: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <Input type="date" value={newExpense.expense_date} onChange={e => setNewExpense(p => ({...p, expense_date: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
          </div>
          <Button size="sm" onClick={addExpense} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Expense</Button>
        </CardContent>
      </Card>

      {/* ── Tasks ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Tasks</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {monthTasks.map((t: any) => {
              const overdue = t.status !== 'done' && isBefore(parseISO(t.due_date), new Date());
              const isCritical = t.priority === 'critical';
              if (editingTask?.id === t.id) {
                return (
                  <div key={t.id} className="p-3 rounded border border-primary/50 space-y-2">
                    <Input value={editingTask.title} onChange={e => setEditingTask((p: any) => ({...p, title: e.target.value}))} placeholder="Title" className={inputCls} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={editingTask.category} onChange={e => setEditingTask((p: any) => ({...p, category: e.target.value}))} placeholder="Category" className={inputCls} />
                      <Input type="date" value={editingTask.due_date} onChange={e => setEditingTask((p: any) => ({...p, due_date: e.target.value}))} className={inputCls} />
                    </div>
                    <Select value={editingTask.priority} onValueChange={v => setEditingTask((p: any) => ({...p, priority: v}))}>
                      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={editingTask.description || ''} onChange={e => setEditingTask((p: any) => ({...p, description: e.target.value}))} placeholder="Description" className={inputCls} />
                    <div className="flex justify-end"><SaveCancelBtns onSave={saveTask} onCancel={() => setEditingTask(null)} /></div>
                  </div>
                );
              }
              return (
                <div key={t.id} className={`p-3 rounded border space-y-1 ${overdue ? 'border-destructive bg-destructive/10' : 'border-border'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isCritical && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />}
                      <button className="font-body text-sm text-foreground text-left flex-1 min-w-0" onClick={() => toggleTaskStatus(t.id, t.status)}>
                        <span className={t.status === 'done' ? 'line-through text-muted-foreground' : ''}>{t.title}</span>
                      </button>
                    </div>
                    <div className="flex gap-0.5">
                      <EditBtn onClick={() => setEditingTask({ ...t })} />
                      <DelBtn onClick={() => deleteRow('resort_ops_tasks', t.id)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={t.priority === 'critical' ? 'destructive' : t.priority === 'high' ? 'default' : 'secondary'}
                      className="font-body text-[10px]">{t.priority}</Badge>
                    <Badge variant="outline" className="font-body text-[10px]">{t.status}</Badge>
                    <span className="font-body text-xs text-muted-foreground">{t.category}</span>
                    <span className="font-body text-xs text-muted-foreground ml-auto">{t.due_date}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <Input placeholder="Title" value={newTask.title} onChange={e => setNewTask(p => ({...p, title: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Category" value={newTask.category} onChange={e => setNewTask(p => ({...p, category: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
              <Input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({...p, due_date: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            </div>
            <Select value={newTask.priority} onValueChange={v => setNewTask(p => ({...p, priority: v}))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addTask} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Task</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Assets on Hand ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Assets on Hand</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {assets.map((a: any) => (
              editingAsset?.id === a.id ? (
                <div key={a.id} className="p-3 rounded border border-primary/50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editingAsset.name} onChange={e => setEditingAsset((p: any) => ({...p, name: e.target.value}))} placeholder="Name" className={inputCls} />
                    <Input value={editingAsset.type} onChange={e => setEditingAsset((p: any) => ({...p, type: e.target.value}))} placeholder="Type" className={inputCls} />
                  </div>
                  <Input value={editingAsset.balance} onChange={e => setEditingAsset((p: any) => ({...p, balance: e.target.value}))} placeholder="Balance" type="number" className={inputCls} />
                  <div className="flex justify-end"><SaveCancelBtns onSave={saveAsset} onCancel={() => setEditingAsset(null)} /></div>
                </div>
              ) : (
                <div key={a.id} className="flex items-center justify-between py-2 px-2 border-b border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm text-foreground font-medium">{a.name}</p>
                    <p className="font-body text-xs text-muted-foreground">{a.type} · Updated: {a.last_updated ? format(new Date(a.last_updated), 'MMM d, yyyy') : '—'}</p>
                  </div>
                  <span className="font-body text-sm text-foreground mr-2">₱{fmt(Number(a.balance))}</span>
                  <div className="flex gap-0.5">
                    <EditBtn onClick={() => setEditingAsset({ ...a, balance: String(a.balance) })} />
                    <DelBtn onClick={() => deleteRow('resort_ops_assets', a.id)} />
                  </div>
                </div>
              )
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Input placeholder="Name" value={newAsset.name} onChange={e => setNewAsset(p => ({...p, name: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <Input placeholder="Type" value={newAsset.type} onChange={e => setNewAsset(p => ({...p, type: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
          </div>
          <Input placeholder="Balance" type="number" value={newAsset.balance} onChange={e => setNewAsset(p => ({...p, balance: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
          <Button size="sm" onClick={addAsset} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Asset</Button>
        </CardContent>
      </Card>

      {/* ── Incoming Payments ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Incoming Payments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {monthPayments.map((p: any) => (
              editingPayment?.id === p.id ? (
                <div key={p.id} className="p-3 rounded border border-primary/50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editingPayment.source} onChange={e => setEditingPayment((prev: any) => ({...prev, source: e.target.value}))} placeholder="Source" className={inputCls} />
                    <Input value={editingPayment.amount} onChange={e => setEditingPayment((prev: any) => ({...prev, amount: e.target.value}))} placeholder="Amount" type="number" className={inputCls} />
                  </div>
                  <div><label className="font-body text-xs text-muted-foreground">Expected date</label><Input type="date" value={editingPayment.expected_date} onChange={e => setEditingPayment((prev: any) => ({...prev, expected_date: e.target.value}))} className={inputCls} /></div>
                  <div className="flex justify-end"><SaveCancelBtns onSave={savePayment} onCancel={() => setEditingPayment(null)} /></div>
                </div>
              ) : (
                <div key={p.id} className="flex items-center justify-between py-2 px-2 border-b border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm text-foreground font-medium">{p.source}</p>
                    <p className="font-body text-xs text-muted-foreground">Expected: {p.expected_date}</p>
                  </div>
                  <span className="font-body text-sm text-foreground mr-2">₱{fmt(Number(p.amount))}</span>
                  <div className="flex gap-0.5">
                    <EditBtn onClick={() => setEditingPayment({ ...p, amount: String(p.amount) })} />
                    <DelBtn onClick={() => deleteRow('resort_ops_incoming_payments', p.id)} />
                  </div>
                </div>
              )
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Input placeholder="Source" value={newPayment.source} onChange={e => setNewPayment(p => ({...p, source: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
            <Input placeholder="Amount" type="number" value={newPayment.amount} onChange={e => setNewPayment(p => ({...p, amount: e.target.value}))} className="bg-secondary border-border text-foreground font-body" />
          </div>
          <div><label className="font-body text-xs text-muted-foreground">Expected date</label><Input type="date" value={newPayment.expected_date} onChange={e => setNewPayment(p => ({...p, expected_date: e.target.value}))} className="bg-secondary border-border text-foreground font-body" /></div>
          <Button size="sm" onClick={addPayment} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Payment</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResortOpsDashboard;
