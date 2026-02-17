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
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
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

// Helper to query tables not yet in generated types
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
  // Food cost from existing orders
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

  const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const today = format(new Date(), 'yyyy-MM-dd');

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
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Base Price</TableHead><TableHead>Capacity</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {units.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-body text-sm">{u.name}</TableCell>
                  <TableCell className="font-body text-sm">{u.type}</TableCell>
                  <TableCell className="font-body text-sm">₱{fmt(Number(u.base_price))}</TableCell>
                  <TableCell className="font-body text-sm">{u.capacity}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRow('resort_ops_units', u.id)}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Name" value={newUnit.name} onChange={e => setNewUnit(p => ({...p, name: e.target.value}))} className="bg-secondary border-border text-foreground font-body flex-1 min-w-[100px]" />
            <Input placeholder="Type" value={newUnit.type} onChange={e => setNewUnit(p => ({...p, type: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-24" />
            <Input placeholder="Price" type="number" value={newUnit.base_price} onChange={e => setNewUnit(p => ({...p, base_price: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-20" />
            <Input placeholder="Cap" type="number" value={newUnit.capacity} onChange={e => setNewUnit(p => ({...p, capacity: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-16" />
            <Button size="sm" onClick={addUnit}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Guests ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Guests</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {guests.map((g: any) => (
                <TableRow key={g.id}>
                  <TableCell className="font-body text-sm">{g.full_name}</TableCell>
                  <TableCell className="font-body text-sm">{g.email}</TableCell>
                  <TableCell className="font-body text-sm">{g.phone}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRow('resort_ops_guests', g.id)}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Full name" value={newGuest.full_name} onChange={e => setNewGuest(p => ({...p, full_name: e.target.value}))} className="bg-secondary border-border text-foreground font-body flex-1 min-w-[120px]" />
            <Input placeholder="Email" value={newGuest.email} onChange={e => setNewGuest(p => ({...p, email: e.target.value}))} className="bg-secondary border-border text-foreground font-body flex-1 min-w-[120px]" />
            <Input placeholder="Phone" value={newGuest.phone} onChange={e => setNewGuest(p => ({...p, phone: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-28" />
            <Button size="sm" onClick={addGuest}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Reservations Ledger ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Reservations Ledger</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead><TableHead>Unit</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead>
                  <TableHead>Platform</TableHead><TableHead>Rate</TableHead><TableHead>Paid</TableHead><TableHead>Balance</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthBookings.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-body text-sm">{guestMap.get(b.guest_id) || '—'}</TableCell>
                    <TableCell className="font-body text-sm">{unitMap.get(b.unit_id)?.name || '—'}</TableCell>
                    <TableCell className="font-body text-xs">{b.check_in}</TableCell>
                    <TableCell className="font-body text-xs">{b.check_out}</TableCell>
                    <TableCell className="font-body text-xs">{b.platform}</TableCell>
                    <TableCell className="font-body text-sm">₱{fmt(Number(b.room_rate))}</TableCell>
                    <TableCell className="font-body text-sm">₱{fmt(Number(b.paid_amount))}</TableCell>
                    <TableCell className="font-body text-sm">₱{fmt(Number(b.room_rate) - Number(b.paid_amount))}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRow('resort_ops_bookings', b.id)}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Add booking inline */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Select value={newBooking.guest_id} onValueChange={v => setNewBooking(p => ({...p, guest_id: v}))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body w-32"><SelectValue placeholder="Guest" /></SelectTrigger>
              <SelectContent>{guests.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={newBooking.unit_id} onValueChange={v => setNewBooking(p => ({...p, unit_id: v}))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body w-28"><SelectValue placeholder="Unit" /></SelectTrigger>
              <SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Platform" value={newBooking.platform} onChange={e => setNewBooking(p => ({...p, platform: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-24" />
            <Input type="date" value={newBooking.check_in} onChange={e => setNewBooking(p => ({...p, check_in: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-32" />
            <Input type="date" value={newBooking.check_out} onChange={e => setNewBooking(p => ({...p, check_out: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-32" />
            <Input placeholder="Rate" type="number" value={newBooking.room_rate} onChange={e => setNewBooking(p => ({...p, room_rate: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-20" />
            <Input placeholder="Paid" type="number" value={newBooking.paid_amount} onChange={e => setNewBooking(p => ({...p, paid_amount: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-20" />
            <Button size="sm" onClick={addBooking}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
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
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Unit</TableHead><TableHead>Projected</TableHead><TableHead>Realized</TableHead><TableHead>Variance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {unitPerformance.map(({ unit, projected, realized, variance, status }: any) => (
                <TableRow key={unit.id}>
                  <TableCell className="font-body text-sm">{unit.name}</TableCell>
                  <TableCell className="font-body text-sm">₱{fmt(projected)}</TableCell>
                  <TableCell className="font-body text-sm">₱{fmt(realized)}</TableCell>
                  <TableCell className={`font-body text-sm ${variance >= 0 ? 'text-green-400' : 'text-red-400'}`}>₱{fmt(variance)}</TableCell>
                  <TableCell>
                    <Badge variant={status === 'HIGH' ? 'default' : status === 'ON_TRACK' ? 'secondary' : 'destructive'}
                      className="font-body text-[10px]">{status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Expenses Ledger ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Expenses</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {monthExpenses.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-body text-sm">{e.name}</TableCell>
                  <TableCell className="font-body text-sm">{e.category}</TableCell>
                  <TableCell className="font-body text-sm">₱{fmt(Number(e.amount))}</TableCell>
                  <TableCell className="font-body text-xs">{e.expense_date}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRow('resort_ops_expenses', e.id)}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Name" value={newExpense.name} onChange={e => setNewExpense(p => ({...p, name: e.target.value}))} className="bg-secondary border-border text-foreground font-body flex-1 min-w-[100px]" />
            <Input placeholder="Category" value={newExpense.category} onChange={e => setNewExpense(p => ({...p, category: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-24" />
            <Input placeholder="Amount" type="number" value={newExpense.amount} onChange={e => setNewExpense(p => ({...p, amount: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-20" />
            <Input type="date" value={newExpense.expense_date} onChange={e => setNewExpense(p => ({...p, expense_date: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-32" />
            <Button size="sm" onClick={addExpense}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Tasks ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Tasks</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            {monthTasks.map((t: any) => {
              const overdue = t.status !== 'done' && isBefore(parseISO(t.due_date), new Date());
              const isCritical = t.priority === 'critical';
              return (
                <div key={t.id} className={`flex items-center gap-2 py-2 px-2 rounded border ${overdue ? 'border-destructive bg-destructive/10' : 'border-border'}`}>
                  {isCritical && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />}
                  <button className="font-body text-sm text-foreground flex-1 text-left" onClick={() => toggleTaskStatus(t.id, t.status)}>
                    <span className={t.status === 'done' ? 'line-through text-muted-foreground' : ''}>{t.title}</span>
                  </button>
                  <Badge variant={t.priority === 'critical' ? 'destructive' : t.priority === 'high' ? 'default' : 'secondary'}
                    className="font-body text-[10px]">{t.priority}</Badge>
                  <span className="font-body text-xs text-muted-foreground">{t.due_date}</span>
                  <Badge variant="outline" className="font-body text-[10px]">{t.status}</Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRow('resort_ops_tasks', t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Input placeholder="Title" value={newTask.title} onChange={e => setNewTask(p => ({...p, title: e.target.value}))} className="bg-secondary border-border text-foreground font-body flex-1 min-w-[120px]" />
            <Input placeholder="Category" value={newTask.category} onChange={e => setNewTask(p => ({...p, category: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-24" />
            <Input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({...p, due_date: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-32" />
            <Select value={newTask.priority} onValueChange={v => setNewTask(p => ({...p, priority: v}))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addTask}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Assets on Hand ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Assets on Hand</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Balance</TableHead><TableHead>Updated</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {assets.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-body text-sm">{a.name}</TableCell>
                  <TableCell className="font-body text-sm">{a.type}</TableCell>
                  <TableCell className="font-body text-sm">₱{fmt(Number(a.balance))}</TableCell>
                  <TableCell className="font-body text-xs">{a.last_updated ? format(new Date(a.last_updated), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRow('resort_ops_assets', a.id)}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Name" value={newAsset.name} onChange={e => setNewAsset(p => ({...p, name: e.target.value}))} className="bg-secondary border-border text-foreground font-body flex-1 min-w-[100px]" />
            <Input placeholder="Type" value={newAsset.type} onChange={e => setNewAsset(p => ({...p, type: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-24" />
            <Input placeholder="Balance" type="number" value={newAsset.balance} onChange={e => setNewAsset(p => ({...p, balance: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-24" />
            <Button size="sm" onClick={addAsset}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Incoming Payments ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Incoming Payments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Table>
            <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Amount</TableHead><TableHead>Expected</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {monthPayments.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-body text-sm">{p.source}</TableCell>
                  <TableCell className="font-body text-sm">₱{fmt(Number(p.amount))}</TableCell>
                  <TableCell className="font-body text-xs">{p.expected_date}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRow('resort_ops_incoming_payments', p.id)}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Source" value={newPayment.source} onChange={e => setNewPayment(p => ({...p, source: e.target.value}))} className="bg-secondary border-border text-foreground font-body flex-1 min-w-[100px]" />
            <Input placeholder="Amount" type="number" value={newPayment.amount} onChange={e => setNewPayment(p => ({...p, amount: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-24" />
            <Input type="date" value={newPayment.expected_date} onChange={e => setNewPayment(p => ({...p, expected_date: e.target.value}))} className="bg-secondary border-border text-foreground font-body w-32" />
            <Button size="sm" onClick={addPayment}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResortOpsDashboard;
