import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Check, X, DollarSign, Clock, Users, Download, Banknote, Star, Settings } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, previousSunday, nextSaturday, isSunday, addDays, getDay } from 'date-fns';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';

type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'all';
type SubView = 'employees' | 'shifts' | 'summary' | 'payments' | 'settings';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PayrollDashboard = () => {
  const qc = useQueryClient();
  const [subView, setSubView] = useState<SubView>('employees');
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');

  // Payroll settings
  const { settings: payrollSettings, upsert: upsertSettings } = usePayrollSettings();

  // Employee management state
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newRateType, setNewRateType] = useState<'hourly' | 'daily' | 'monthly'>('hourly');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editRateType, setEditRateType] = useState<'hourly' | 'daily' | 'monthly'>('hourly');

  // Shift editing state
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');

  // Add shift state
  const [addingShift, setAddingShift] = useState(false);
  const [newShiftEmployee, setNewShiftEmployee] = useState('');
  const [newShiftClockIn, setNewShiftClockIn] = useState('');
  const [newShiftClockOut, setNewShiftClockOut] = useState('');

  // Bonus state
  const [bonusEmployee, setBonusEmployee] = useState('');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [bonusIsEOM, setBonusIsEOM] = useState(false);
  const [showBonusForm, setShowBonusForm] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').order('name');
      return data || [];
    },
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['employee-shifts-all'],
    queryFn: async () => {
      const { data } = await supabase.from('employee_shifts').select('*').order('clock_in', { ascending: false }).limit(500);
      return data || [];
    },
  });

  // Payment history
  const { data: payments = [] } = useQuery({
    queryKey: ['payroll-payments'],
    queryFn: async () => {
      const { data } = await supabase.from('payroll_payments').select('*').order('paid_at', { ascending: false }).limit(200);
      return data || [];
    },
  });

  // Bonuses
  const { data: bonuses = [] } = useQuery({
    queryKey: ['employee-bonuses'],
    queryFn: async () => {
      const { data } = await (supabase.from('employee_bonuses' as any) as any).select('*').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Payment form state
  const [payEmployee, setPayEmployee] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState<'regular' | 'advance'>('regular');
  const [payNotes, setPayNotes] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPayNotes, setEditPayNotes] = useState('');
  const [confirmDeletePayment, setConfirmDeletePayment] = useState<string | null>(null);

  // Helper to get rate display
  const getRateDisplay = (emp: any) => {
    const rateType = emp.rate_type || 'hourly';
    if (rateType === 'daily') return `₱${Number(emp.daily_rate || 0).toFixed(0)}/day`;
    if (rateType === 'monthly') return `₱${Number(emp.monthly_rate || 0).toLocaleString()}/mo`;
    return `₱${Number(emp.hourly_rate).toFixed(0)}/hr`;
  };

  const getRateValue = (emp: any) => {
    const rateType = emp.rate_type || 'hourly';
    if (rateType === 'daily') return Number(emp.daily_rate || 0);
    if (rateType === 'monthly') return Number(emp.monthly_rate || 0);
    return Number(emp.hourly_rate);
  };

  // Date-filtered shifts
  const filteredShifts = useMemo(() => {
    const now = new Date();
    return shifts.filter(s => {
      const d = new Date(s.clock_in);
      switch (dateFilter) {
        case 'today': return d >= startOfDay(now);
        case 'yesterday': return d >= startOfDay(subDays(now, 1)) && d < startOfDay(now);
        case 'week': return d >= startOfWeek(now, { weekStartsOn: 0 });
        case 'month': return d >= startOfMonth(now);
        default: return true;
      }
    });
  }, [shifts, dateFilter]);

  // Group shifts by employee + date for split shift display
  type ShiftGroup = { key: string; employeeId: string; date: string; shifts: typeof filteredShifts; totalHours: number; totalPay: number; isSplit: boolean };
  const groupedShifts = useMemo((): ShiftGroup[] => {
    const map = new Map<string, typeof filteredShifts>();
    filteredShifts.forEach(s => {
      const dateKey = format(new Date(s.clock_in), 'yyyy-MM-dd');
      const key = `${s.employee_id}_${dateKey}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    const groups: ShiftGroup[] = [];
    map.forEach((groupShifts, key) => {
      const parts = key.split('_');
      const employeeId = parts[0];
      const date = parts[1];
      const sorted = groupShifts.sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());
      const totalHours = sorted.reduce((s, sh) => s + Number(sh.hours_worked || 0), 0);
      const totalPay = sorted.reduce((s, sh) => s + Number(sh.total_pay || 0), 0);
      groups.push({ key, employeeId, date, shifts: sorted, totalHours, totalPay, isSplit: sorted.length > 1 });
    });
    groups.sort((a, b) => {
      const nameA = employees.find(e => e.id === a.employeeId)?.name || '';
      const nameB = employees.find(e => e.id === b.employeeId)?.name || '';
      return b.date.localeCompare(a.date) || nameA.localeCompare(nameB);
    });
    return groups;
  }, [filteredShifts, employees]);

  // Summary stats
  const stats = useMemo(() => {
    const totalHours = filteredShifts.reduce((s, sh) => s + Number(sh.hours_worked || 0), 0);
    const totalPay = filteredShifts.reduce((s, sh) => s + Number(sh.total_pay || 0), 0);
    const totalPaid = filteredShifts.filter(s => s.is_paid).reduce((s, sh) => s + Number(sh.total_pay || 0), 0);
    return { totalHours, totalPay, totalPaid, outstanding: totalPay - totalPaid };
  }, [filteredShifts]);

  // Per-employee summary with bonuses
  const employeeSummary = useMemo(() => {
    return employees.map(emp => {
      const empShifts = filteredShifts.filter(s => s.employee_id === emp.id);
      const hours = empShifts.reduce((s, sh) => s + Number(sh.hours_worked || 0), 0);
      const total = empShifts.reduce((s, sh) => s + Number(sh.total_pay || 0), 0);
      const paid = empShifts.filter(s => s.is_paid).reduce((s, sh) => s + Number(sh.total_pay || 0), 0);
      const empBonuses = bonuses.filter((b: any) => b.employee_id === emp.id);
      const totalBonuses = empBonuses.reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
      return { ...emp, hours, total, paid, outstanding: total - paid, shiftCount: empShifts.length, totalBonuses, bonusList: empBonuses };
    });
  }, [employees, filteredShifts, bonuses]);

  // All-time paid-out per employee
  const allTimePaid = useMemo(() => {
    const map: Record<string, number> = {};
    shifts.forEach(s => {
      if (s.is_paid && s.total_pay) {
        map[s.employee_id] = (map[s.employee_id] || 0) + Number(s.total_pay);
      }
    });
    return map;
  }, [shifts]);

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.name || 'Unknown';
  const getEmployeeRate = (id: string) => Number(employees.find(e => e.id === id)?.hourly_rate || 0);

  // CRUD - Employees
  const addEmployee = async () => {
    if (!newName.trim() || !newRate) return;
    const rateVal = parseFloat(newRate) || 0;
    const insertData: any = {
      name: newName.trim(),
      hourly_rate: newRateType === 'hourly' ? rateVal : 0,
      rate_type: newRateType,
      daily_rate: newRateType === 'daily' ? rateVal : 0,
      monthly_rate: newRateType === 'monthly' ? rateVal : 0,
    };
    await supabase.from('employees').insert(insertData as any);
    setNewName(''); setNewRate(''); setNewRateType('hourly');
    qc.invalidateQueries({ queryKey: ['employees-all'] });
    toast.success('Employee added');
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const rateVal = parseFloat(editRate) || 0;
    const updateData: any = {
      name: editName.trim(),
      rate_type: editRateType,
      hourly_rate: editRateType === 'hourly' ? rateVal : employees.find(e => e.id === editingId)?.hourly_rate || 0,
      daily_rate: editRateType === 'daily' ? rateVal : (employees.find(e => e.id === editingId) as any)?.daily_rate || 0,
      monthly_rate: editRateType === 'monthly' ? rateVal : (employees.find(e => e.id === editingId) as any)?.monthly_rate || 0,
    };
    await supabase.from('employees').update(updateData as any).eq('id', editingId);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ['employees-all'] });
    toast.success('Employee updated');
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from('employees').update({ active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['employees-all'] });
  };

  const deleteEmployee = async (id: string) => {
    await supabase.from('employees').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['employees-all'] });
    toast.success('Employee deleted');
  };

  // CRUD - Shifts
  const markPaid = async (shiftId: string) => {
    await supabase.from('employee_shifts').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', shiftId);
    qc.invalidateQueries({ queryKey: ['employee-shifts-all'] });
    toast.success('Marked as paid');
  };

  const markUnpaid = async (shiftId: string) => {
    await supabase.from('employee_shifts').update({ is_paid: false, paid_at: null }).eq('id', shiftId);
    qc.invalidateQueries({ queryKey: ['employee-shifts-all'] });
    toast.success('Marked as unpaid');
  };

  const markAllPaid = async (employeeId: string) => {
    const unpaid = filteredShifts.filter(s => s.employee_id === employeeId && !s.is_paid && s.total_pay);
    for (const s of unpaid) {
      await supabase.from('employee_shifts').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', s.id);
    }
    qc.invalidateQueries({ queryKey: ['employee-shifts-all'] });
    toast.success('All shifts marked as paid');
  };

  const deleteShift = async (shiftId: string) => {
    await supabase.from('employee_shifts').delete().eq('id', shiftId);
    qc.invalidateQueries({ queryKey: ['employee-shifts-all'] });
    toast.success('Shift deleted');
  };

  const startEditShift = (shift: any) => {
    setEditingShiftId(shift.id);
    setEditClockIn(format(new Date(shift.clock_in), "yyyy-MM-dd'T'HH:mm"));
    setEditClockOut(shift.clock_out ? format(new Date(shift.clock_out), "yyyy-MM-dd'T'HH:mm") : '');
  };

  const saveShiftEdit = async (shift: any) => {
    if (!editClockIn) return;
    const clockIn = new Date(editClockIn);
    const clockOut = editClockOut ? new Date(editClockOut) : null;
    let hoursWorked: number | null = null;
    let totalPay: number | null = null;
    if (clockOut) {
      hoursWorked = Math.round(((clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)) * 100) / 100;
      const emp = employees.find(e => e.id === shift.employee_id);
      totalPay = calculateShiftPay(emp, hoursWorked, shift.employee_id);
    }
    await supabase.from('employee_shifts').update({
      clock_in: clockIn.toISOString(),
      clock_out: clockOut?.toISOString() || null,
      hours_worked: hoursWorked,
      total_pay: totalPay,
    }).eq('id', shift.id);
    setEditingShiftId(null);
    qc.invalidateQueries({ queryKey: ['employee-shifts-all'] });
    toast.success('Shift updated');
  };

  const calculateShiftPay = (emp: any, hoursWorked: number, employeeId: string): number => {
    if (!emp) return Math.round(hoursWorked * getEmployeeRate(employeeId) * 100) / 100;
    const rateType = emp.rate_type || 'hourly';
    if (rateType === 'daily') return Number(emp.daily_rate || 0);
    if (rateType === 'monthly') return Math.round((Number(emp.monthly_rate || 0) / 22) * 100) / 100;
    return Math.round(hoursWorked * Number(emp.hourly_rate) * 100) / 100;
  };

  const addShift = async () => {
    if (!newShiftEmployee || !newShiftClockIn) return;
    const clockIn = new Date(newShiftClockIn);
    const clockOut = newShiftClockOut ? new Date(newShiftClockOut) : null;
    let hoursWorked: number | null = null;
    let totalPay: number | null = null;
    if (clockOut) {
      hoursWorked = Math.round(((clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60)) * 100) / 100;
      const emp = employees.find(e => e.id === newShiftEmployee);
      totalPay = calculateShiftPay(emp, hoursWorked, newShiftEmployee);
    }
    await supabase.from('employee_shifts').insert({
      employee_id: newShiftEmployee,
      clock_in: clockIn.toISOString(),
      clock_out: clockOut?.toISOString() || null,
      hours_worked: hoursWorked,
      total_pay: totalPay,
    });
    setAddingShift(false);
    setNewShiftEmployee('');
    setNewShiftClockIn('');
    setNewShiftClockOut('');
    qc.invalidateQueries({ queryKey: ['employee-shifts-all'] });
    toast.success('Shift added');
  };

  // Bonus CRUD
  const addBonus = async () => {
    if (!bonusEmployee || !bonusAmount) return;
    const amount = bonusIsEOM ? (parseFloat(bonusAmount) || Number(payrollSettings?.eom_bonus_amount || 0)) : parseFloat(bonusAmount) || 0;
    await (supabase.from('employee_bonuses' as any) as any).insert({
      employee_id: bonusEmployee,
      amount,
      reason: bonusReason.trim() || (bonusIsEOM ? 'Employee of the Month' : ''),
      bonus_month: format(new Date(), 'yyyy-MM-01'),
      is_employee_of_month: bonusIsEOM,
    });
    setBonusEmployee(''); setBonusAmount(''); setBonusReason(''); setBonusIsEOM(false); setShowBonusForm(false);
    qc.invalidateQueries({ queryKey: ['employee-bonuses'] });
    toast.success(bonusIsEOM ? 'Employee of the Month bonus added!' : 'Bonus added');
  };

  const deleteBonus = async (id: string) => {
    await (supabase.from('employee_bonuses' as any) as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['employee-bonuses'] });
    toast.success('Bonus deleted');
  };

  // CSV Export with bonuses
  const downloadCSV = () => {
    let csv = 'Payroll Report\n';
    csv += `Period,${dateFilter}\n`;
    csv += `Generated,${format(new Date(), 'yyyy-MM-dd HH:mm')}\n\n`;

    csv += 'SUMMARY\n';
    csv += `Total Hours,${stats.totalHours.toFixed(2)}\n`;
    csv += `Total Pay Due,${stats.totalPay.toFixed(2)}\n`;
    csv += `Total Paid,${stats.totalPaid.toFixed(2)}\n`;
    csv += `Outstanding,${stats.outstanding.toFixed(2)}\n\n`;

    csv += 'EMPLOYEE SUMMARY\n';
    csv += 'Employee,Rate Type,Rate,Hours,Earned,Bonuses,Total,Paid,Outstanding\n';
    employeeSummary.forEach(e => {
      csv += `"${e.name}",${(e as any).rate_type || 'hourly'},${getRateValue(e)},${e.hours.toFixed(2)},${e.total.toFixed(2)},${e.totalBonuses.toFixed(2)},${(e.total + e.totalBonuses).toFixed(2)},${e.paid.toFixed(2)},${e.outstanding.toFixed(2)}\n`;
    });

    csv += '\nSHIFT DETAIL\n';
    csv += 'Employee,Date,Clock In,Clock Out,Hours,Pay,Status,Paid At,Note\n';
    groupedShifts.forEach(group => {
      group.shifts.forEach(s => {
        csv += `"${getEmployeeName(s.employee_id)}",`;
        csv += `${group.date},`;
        csv += `${format(new Date(s.clock_in), 'yyyy-MM-dd HH:mm')},`;
        csv += `${s.clock_out ? format(new Date(s.clock_out), 'yyyy-MM-dd HH:mm') : 'Still working'},`;
        csv += `${s.hours_worked ? Number(s.hours_worked).toFixed(2) : ''},`;
        csv += `${s.total_pay ? Number(s.total_pay).toFixed(2) : ''},`;
        csv += `${s.is_paid ? 'Paid' : 'Unpaid'},`;
        csv += `${s.paid_at ? format(new Date(s.paid_at), 'yyyy-MM-dd HH:mm') : ''},`;
        csv += `${group.isSplit ? 'Split Shift' : ''}\n`;
      });
      if (group.isSplit) {
        csv += `"${getEmployeeName(group.employeeId)}",${group.date},DAILY SUBTOTAL,,${group.totalHours.toFixed(2)},${group.totalPay.toFixed(2)},,,${group.shifts.length} shifts\n`;
      }
    });

    if (bonuses.length > 0) {
      csv += '\nBONUSES\n';
      csv += 'Employee,Amount,Reason,Month,Employee of Month\n';
      bonuses.forEach((b: any) => {
        csv += `"${getEmployeeName(b.employee_id)}",${Number(b.amount).toFixed(2)},"${b.reason}",${b.bonus_month || ''},${b.is_employee_of_month ? 'Yes' : 'No'}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${dateFilter}-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  // Payment CRUD
  const getPayPeriod = () => {
    const now = new Date();
    const type = payrollSettings?.payday_type || 'weekly';
    const dow = payrollSettings?.payday_day_of_week ?? 6;
    if (type === 'weekly') {
      const periodStart = isSunday(now) ? now : previousSunday(now);
      const periodEnd = nextSaturday(now);
      return { periodStart, periodEnd, label: `${DAYS_OF_WEEK[dow]}` };
    }
    if (type === 'bimonthly') {
      const day = now.getDate();
      const year = now.getFullYear();
      const month = now.getMonth();
      if (day <= 15) {
        return { periodStart: new Date(year, month, 1), periodEnd: new Date(year, month, 15), label: 'Every 15 Days' };
      }
      const lastDay = new Date(year, month + 1, 0).getDate();
      return { periodStart: new Date(year, month, 16), periodEnd: new Date(year, month, lastDay), label: 'Every 15 Days' };
    }
    // monthly
    return { periodStart: new Date(now.getFullYear(), now.getMonth(), 1), periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0), label: 'Monthly' };
  };

  const payPeriod = getPayPeriod();

  const recordPayment = async () => {
    if (!payEmployee || !payAmount) return;
    await (supabase.from('payroll_payments') as any).insert({
      employee_id: payEmployee,
      amount: parseFloat(payAmount) || 0,
      bonus_amount: 0,
      payment_type: payType,
      period_start: format(payPeriod.periodStart, 'yyyy-MM-dd'),
      period_end: format(payPeriod.periodEnd, 'yyyy-MM-dd'),
      notes: payNotes.trim(),
      paid_at: new Date().toISOString(),
    });
    setPayEmployee(''); setPayAmount(''); setPayNotes(''); setPayType('regular');
    qc.invalidateQueries({ queryKey: ['payroll-payments'] });
    toast.success(payType === 'advance' ? 'Advance recorded' : 'Payment recorded');
  };

  const updatePayment = async (id: string) => {
    await supabase.from('payroll_payments').update({
      amount: parseFloat(editPayAmount) || 0,
      notes: editPayNotes.trim(),
    }).eq('id', id);
    setEditingPaymentId(null);
    qc.invalidateQueries({ queryKey: ['payroll-payments'] });
    toast.success('Payment updated');
  };

  const deletePayment = async (id: string) => {
    if (confirmDeletePayment !== id) {
      setConfirmDeletePayment(id);
      setTimeout(() => setConfirmDeletePayment(null), 3000);
      return;
    }
    await supabase.from('payroll_payments').delete().eq('id', id);
    setConfirmDeletePayment(null);
    qc.invalidateQueries({ queryKey: ['payroll-payments'] });
    toast.success('Payment deleted');
  };

  // Per-employee payment totals
  const employeePaymentTotals = useMemo(() => {
    const map: Record<string, { total: number; advances: number; regular: number }> = {};
    payments.forEach(p => {
      if (!map[p.employee_id]) map[p.employee_id] = { total: 0, advances: 0, regular: 0 };
      map[p.employee_id].total += Number(p.amount);
      if (p.payment_type === 'advance') map[p.employee_id].advances += Number(p.amount);
      else map[p.employee_id].regular += Number(p.amount);
    });
    return map;
  }, [payments]);

  // Filter payments by selected employee
  const [payFilterEmployee, setPayFilterEmployee] = useState('all');
  const filteredPayments = useMemo(() => {
    if (payFilterEmployee === 'all') return payments;
    return payments.filter(p => p.employee_id === payFilterEmployee);
  }, [payments, payFilterEmployee]);

  const dateFilters: { key: DateFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'Pay Period' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All' },
  ];

  const paydayLabel = payrollSettings?.payday_type === 'bimonthly' ? 'Every 15 Days'
    : payrollSettings?.payday_type === 'monthly' ? 'Monthly (30 days)'
    : `Every ${DAYS_OF_WEEK[payrollSettings?.payday_day_of_week ?? 6]}`;

  return (
    <div className="space-y-4">
      {/* Pay Period Banner */}
      {(subView === 'shifts' || subView === 'summary' || subView === 'payments') && (
        <div className="border border-primary/30 bg-primary/5 rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="font-display text-xs tracking-wider text-foreground">
              Pay Period: {format(payPeriod.periodStart, 'EEE, MMM d')} – {format(payPeriod.periodEnd, 'EEE, MMM d')}
            </span>
          </div>
          <Badge variant="outline" className="text-xs font-body">Payday: {paydayLabel}</Badge>
        </div>
      )}

      {/* Sub-view toggle */}
      <div className="flex gap-1 flex-wrap">
        {([
          { key: 'employees' as SubView, label: 'Employees', icon: Users },
          { key: 'shifts' as SubView, label: 'Shifts', icon: Clock },
          { key: 'summary' as SubView, label: 'Payroll', icon: DollarSign },
          { key: 'payments' as SubView, label: 'Payments', icon: Banknote },
          { key: 'settings' as SubView, label: 'Settings', icon: Settings },
        ]).map(({ key, label, icon: Icon }) => (
          <Button key={key} size="sm" variant={subView === key ? 'default' : 'outline'}
            onClick={() => setSubView(key)} className="font-display text-xs tracking-wider flex-1 gap-1">
            <Icon className="w-3.5 h-3.5" /> {label}
          </Button>
        ))}
      </div>

      {/* EMPLOYEES SUB-VIEW */}
      {subView === 'employees' && (
        <div className="space-y-1">
          {employees.map(emp => (
            <div key={emp.id} className="flex items-center justify-between py-2.5 px-2 border-b border-border gap-2">
              {editingId === emp.id ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <Input value={editName} onChange={e => setEditName(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body h-8 text-sm flex-1 min-w-[100px]" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }} />
                  <select value={editRateType} onChange={e => {
                    setEditRateType(e.target.value as any);
                    const empData = employees.find(x => x.id === editingId);
                    if (e.target.value === 'hourly') setEditRate(String(empData?.hourly_rate || 0));
                    else if (e.target.value === 'daily') setEditRate(String((empData as any)?.daily_rate || 0));
                    else setEditRate(String((empData as any)?.monthly_rate || 0));
                  }}
                    className="bg-secondary border border-border text-foreground font-body h-8 text-sm rounded-md px-2">
                    <option value="hourly">Per Hour</option>
                    <option value="daily">Per Day</option>
                    <option value="monthly">Per Month</option>
                  </select>
                  <Input value={editRate} onChange={e => setEditRate(e.target.value)} type="number"
                    className="bg-secondary border-border text-foreground font-body h-8 text-sm w-24"
                    placeholder={editRateType === 'hourly' ? '₱/hr' : editRateType === 'daily' ? '₱/day' : '₱/mo'} />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={saveEdit}><Check className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <span className="font-body text-sm text-foreground">{emp.name}</span>
                    <span className="font-body text-xs text-muted-foreground ml-2">{getRateDisplay(emp)}</span>
                    <span className="font-body text-xs text-primary ml-2">Paid: ₱{(allTimePaid[emp.id] || 0).toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingId(emp.id);
                        setEditName(emp.name);
                        const rt = (emp as any).rate_type || 'hourly';
                        setEditRateType(rt);
                        setEditRate(String(rt === 'daily' ? (emp as any).daily_rate || 0 : rt === 'monthly' ? (emp as any).monthly_rate || 0 : emp.hourly_rate));
                      }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteEmployee(emp.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Switch checked={emp.active} onCheckedChange={v => toggleActive(emp.id, v)} />
                  </div>
                </>
              )}
            </div>
          ))}
          {/* Add employee form */}
          <div className="flex gap-2 mt-3 flex-wrap">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Employee name"
              className="bg-secondary border-border text-foreground font-body flex-1 min-w-[120px]" />
            <select value={newRateType} onChange={e => setNewRateType(e.target.value as any)}
              className="bg-secondary border border-border text-foreground font-body text-sm rounded-md px-2 h-10">
              <option value="hourly">Per Hour</option>
              <option value="daily">Per Day</option>
              <option value="monthly">Per Month</option>
            </select>
            <Input value={newRate} onChange={e => setNewRate(e.target.value)}
              placeholder={newRateType === 'hourly' ? '₱/hr' : newRateType === 'daily' ? '₱/day' : '₱/mo'}
              type="number" className="bg-secondary border-border text-foreground font-body w-24" />
            <Button onClick={addEmployee} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
          </div>

          {/* Bonuses section */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm tracking-wider text-foreground flex items-center gap-1.5">
                <Star className="w-4 h-4 text-primary" /> Bonuses
              </h3>
              <Button size="sm" variant="outline" onClick={() => setShowBonusForm(!showBonusForm)}
                className="font-display text-xs tracking-wider gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Bonus
              </Button>
            </div>

            {showBonusForm && (
              <div className="border border-primary/30 rounded-lg p-3 space-y-2">
                <select value={bonusEmployee} onChange={e => setBonusEmployee(e.target.value)}
                  className="w-full bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-2">
                  <option value="">Select employee</option>
                  {employees.filter(e => e.active).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} type="number"
                    placeholder={`Amount (₱${payrollSettings?.eom_bonus_amount || 0} default)`}
                    className="bg-secondary border-border text-foreground font-body text-sm" />
                  <Input value={bonusReason} onChange={e => setBonusReason(e.target.value)} placeholder="Reason"
                    className="bg-secondary border-border text-foreground font-body text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={bonusIsEOM} onCheckedChange={v => {
                    setBonusIsEOM(v);
                    if (v && !bonusAmount) setBonusAmount(String(payrollSettings?.eom_bonus_amount || 0));
                    if (v && !bonusReason) setBonusReason('Employee of the Month');
                  }} />
                  <span className="font-body text-xs text-muted-foreground flex items-center gap-1">
                    <Star className="w-3 h-3 text-primary" /> Employee of the Month
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addBonus} className="font-display text-xs tracking-wider flex-1" disabled={!bonusEmployee || !bonusAmount}>
                    Save Bonus
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowBonusForm(false)} className="font-display text-xs tracking-wider flex-1">Cancel</Button>
                </div>
              </div>
            )}

            {/* Bonus list */}
            {bonuses.length === 0 && !showBonusForm && (
              <p className="font-body text-xs text-muted-foreground text-center py-4">No bonuses recorded</p>
            )}
            {bonuses.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between py-2 px-2 border-b border-border">
                <div className="flex-1">
                  <span className="font-body text-sm text-foreground">{getEmployeeName(b.employee_id)}</span>
                  {b.is_employee_of_month && (
                    <Badge variant="default" className="font-body text-xs ml-2 gap-1">
                      <Star className="w-3 h-3" /> EOM
                    </Badge>
                  )}
                  <p className="font-body text-xs text-muted-foreground">
                    ₱{Number(b.amount).toFixed(0)} · {b.reason || 'No reason'} · {b.bonus_month ? format(new Date(b.bonus_month + 'T00:00:00'), 'MMM yyyy') : ''}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteBonus(b.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SHIFTS SUB-VIEW */}
      {subView === 'shifts' && (
        <div className="space-y-3">
          {/* Date filter */}
          <div className="flex gap-1 flex-wrap">
            {dateFilters.map(df => (
              <Button key={df.key} size="sm" variant={dateFilter === df.key ? 'default' : 'outline'}
                onClick={() => setDateFilter(df.key)} className="font-body text-xs flex-1">
                {df.label}
              </Button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-border rounded-lg p-3 text-center">
              <p className="font-body text-xs text-muted-foreground">Hours</p>
              <p className="font-display text-lg text-foreground">{stats.totalHours.toFixed(1)}</p>
            </div>
            <div className="border border-border rounded-lg p-3 text-center">
              <p className="font-body text-xs text-muted-foreground">Due</p>
              <p className="font-display text-lg text-foreground">₱{stats.totalPay.toFixed(0)}</p>
            </div>
            <div className="border border-border rounded-lg p-3 text-center">
              <p className="font-body text-xs text-muted-foreground">Paid</p>
              <p className="font-display text-lg text-foreground">₱{stats.totalPaid.toFixed(0)}</p>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setAddingShift(true); setNewShiftClockIn(format(new Date(), "yyyy-MM-dd'T'HH:mm")); }}
              className="font-display text-xs tracking-wider gap-1 flex-1">
              <Plus className="w-3.5 h-3.5" /> Add Shift
            </Button>
            <Button size="sm" variant="outline" onClick={downloadCSV}
              className="font-display text-xs tracking-wider gap-1 flex-1">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          </div>

          {/* Add shift form */}
          {addingShift && (
            <div className="border border-primary/30 rounded-lg p-3 space-y-2">
              <p className="font-display text-xs tracking-wider text-foreground">New Shift</p>
              <select value={newShiftEmployee} onChange={e => setNewShiftEmployee(e.target.value)}
                className="w-full bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-2">
                <option value="">Select employee</option>
                {employees.filter(e => e.active).map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-body text-xs text-muted-foreground">Clock In</label>
                  <Input type="datetime-local" value={newShiftClockIn} onChange={e => setNewShiftClockIn(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body text-sm h-9" />
                </div>
                <div>
                  <label className="font-body text-xs text-muted-foreground">Clock Out</label>
                  <Input type="datetime-local" value={newShiftClockOut} onChange={e => setNewShiftClockOut(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body text-sm h-9" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addShift} className="font-display text-xs tracking-wider flex-1">Save</Button>
                <Button size="sm" variant="outline" onClick={() => setAddingShift(false)} className="font-display text-xs tracking-wider flex-1">Cancel</Button>
              </div>
            </div>
          )}

          {/* Grouped shift cards */}
          {groupedShifts.length === 0 && (
            <p className="font-body text-muted-foreground text-center py-8">No shifts for this period</p>
          )}
          {groupedShifts.map(group => (
            <div key={group.key} className={`border rounded-lg p-3 space-y-2 ${group.isSplit ? 'border-primary/30' : 'border-border'}`}>
              {/* Group header */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <p className="font-display text-sm text-foreground">{getEmployeeName(group.employeeId)}</p>
                  {group.isSplit && (
                    <Badge variant="outline" className="font-body text-xs text-primary border-primary/40">
                      Split · {group.shifts.length} shifts
                    </Badge>
                  )}
                </div>
                <span className="font-body text-xs text-muted-foreground">{format(new Date(group.date), 'MMM d')}</span>
              </div>

              {/* Individual shifts */}
              {group.shifts.map(shift => (
                <div key={shift.id} className="border-t border-border/50 pt-2 space-y-1">
                  {editingShiftId === shift.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="font-body text-xs text-muted-foreground">Clock In</label>
                          <Input type="datetime-local" value={editClockIn} onChange={e => setEditClockIn(e.target.value)}
                            className="bg-secondary border-border text-foreground font-body text-sm h-9" />
                        </div>
                        <div>
                          <label className="font-body text-xs text-muted-foreground">Clock Out</label>
                          <Input type="datetime-local" value={editClockOut} onChange={e => setEditClockOut(e.target.value)}
                            className="bg-secondary border-border text-foreground font-body text-sm h-9" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveShiftEdit(shift)} className="font-display text-xs tracking-wider flex-1">Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingShiftId(null)} className="font-display text-xs tracking-wider flex-1">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-body text-xs text-muted-foreground">
                          {format(new Date(shift.clock_in), 'h:mm a')}
                          {shift.clock_out ? ` → ${format(new Date(shift.clock_out), 'h:mm a')}` : ' → Still working'}
                        </p>
                        <span className="font-body text-xs text-muted-foreground">
                          {shift.hours_worked ? `${Number(shift.hours_worked).toFixed(1)}h` : '—'}
                          {shift.total_pay ? ` · ₱${Number(shift.total_pay).toFixed(0)}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={shift.is_paid ? 'default' : 'secondary'} className="font-body text-xs">
                          {shift.is_paid ? 'Paid' : 'Unpaid'}
                        </Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditShift(shift)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteShift(shift.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        {shift.is_paid ? (
                          <Button size="sm" variant="outline" onClick={() => markUnpaid(shift.id)}
                            className="font-display text-xs tracking-wider h-7 px-2">Undo</Button>
                        ) : (
                          shift.total_pay && (
                            <Button size="sm" variant="outline" onClick={() => markPaid(shift.id)}
                              className="font-display text-xs tracking-wider h-7 px-2">Pay</Button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Daily subtotal for split shifts */}
              {group.isSplit && (
                <div className="border-t border-primary/20 pt-2 flex justify-between items-center">
                  <span className="font-body text-xs text-primary font-semibold">Day Total</span>
                  <span className="font-body text-xs text-primary font-semibold">
                    {group.totalHours.toFixed(1)}h · ₱{group.totalPay.toFixed(0)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* PAYROLL SUMMARY SUB-VIEW */}
      {subView === 'summary' && (
        <div className="space-y-3">
          {/* Date filter */}
          <div className="flex gap-1 flex-wrap">
            {dateFilters.map(df => (
              <Button key={df.key} size="sm" variant={dateFilter === df.key ? 'default' : 'outline'}
                onClick={() => setDateFilter(df.key)} className="font-body text-xs flex-1">
                {df.label}
              </Button>
            ))}
          </div>

          {/* Export */}
          <Button size="sm" variant="outline" onClick={downloadCSV}
            className="font-display text-xs tracking-wider gap-1 w-full">
            <Download className="w-3.5 h-3.5" /> Download Payroll CSV
          </Button>

          {/* Outstanding total */}
          <div className="border border-primary/30 rounded-lg p-4 text-center">
            <p className="font-body text-xs text-muted-foreground">Total Outstanding</p>
            <p className="font-display text-2xl text-foreground">₱{stats.outstanding.toFixed(0)}</p>
          </div>

          {employeeSummary.length === 0 && (
            <p className="font-body text-muted-foreground text-center py-8">No shift data for this period</p>
          )}
          {employeeSummary.map(emp => (
            <div key={emp.id} className="border border-border rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-start">
                <p className="font-display text-sm text-foreground">{emp.name}</p>
                <span className="font-body text-xs text-muted-foreground">{getRateDisplay(emp)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="font-body text-xs text-muted-foreground">Hours</p>
                  <p className="font-display text-sm text-foreground">{emp.hours.toFixed(1)}</p>
                </div>
                <div>
                  <p className="font-body text-xs text-muted-foreground">Earned</p>
                  <p className="font-display text-sm text-foreground">₱{emp.total.toFixed(0)}</p>
                </div>
                <div>
                  <p className="font-body text-xs text-muted-foreground">Bonuses</p>
                  <p className="font-display text-sm text-primary">₱{emp.totalBonuses.toFixed(0)}</p>
                </div>
                <div>
                  <p className="font-body text-xs text-muted-foreground">Unpaid</p>
                  <p className="font-display text-sm text-foreground">₱{emp.outstanding.toFixed(0)}</p>
                </div>
              </div>
              {emp.totalBonuses > 0 && (
                <div className="border-t border-border pt-2">
                  <p className="font-body text-xs text-muted-foreground">
                    Total (shifts + bonuses): <span className="text-foreground font-display">₱{(emp.total + emp.totalBonuses).toFixed(0)}</span>
                  </p>
                  {emp.bonusList.map((b: any) => (
                    <p key={b.id} className="font-body text-xs text-muted-foreground">
                      {b.is_employee_of_month && <Star className="w-3 h-3 text-primary inline mr-1" />}
                      Bonus: ₱{Number(b.amount).toFixed(0)} — {b.reason || 'No reason'}
                    </p>
                  ))}
                </div>
              )}
              <div className="border-t border-border pt-2">
                <p className="font-body text-xs text-muted-foreground">All-time paid out: <span className="text-primary font-display">₱{(allTimePaid[emp.id] || 0).toFixed(0)}</span></p>
              </div>
              {emp.outstanding > 0 && (
                <Button size="sm" variant="outline" onClick={() => markAllPaid(emp.id)}
                  className="font-display text-xs tracking-wider w-full">
                  Mark All Paid — ₱{emp.outstanding.toFixed(0)}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* PAYMENTS SUB-VIEW */}
      {subView === 'payments' && (
        <div className="space-y-4">
          {/* Record payment form */}
          <div className="border border-primary/30 rounded-lg p-4 space-y-3">
            <p className="font-display text-sm tracking-wider text-foreground">Record Payment</p>
            <select value={payEmployee} onChange={e => setPayEmployee(e.target.value)}
              className="w-full bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-2">
              <option value="">Select employee</option>
              {employees.filter(e => e.active).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input value={payAmount} onChange={e => setPayAmount(e.target.value)} type="number"
                placeholder="Amount (₱)" className="bg-secondary border-border text-foreground font-body text-sm" />
              <select value={payType} onChange={e => setPayType(e.target.value as 'regular' | 'advance')}
                className="bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-2">
                <option value="regular">Regular Pay</option>
                <option value="advance">Advance</option>
              </select>
            </div>
            <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Notes (optional)"
              className="bg-secondary border-border text-foreground font-body text-sm" />
            <Button onClick={recordPayment} className="font-display text-xs tracking-wider w-full gap-1" disabled={!payEmployee || !payAmount}>
              <Banknote className="w-3.5 h-3.5" /> Record Payment
            </Button>
          </div>

          {/* Employee filter */}
          <select value={payFilterEmployee} onChange={e => setPayFilterEmployee(e.target.value)}
            className="w-full bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-2">
            <option value="all">All Employees</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name} — ₱{(employeePaymentTotals[e.id]?.total || 0).toFixed(0)} total</option>
            ))}
          </select>

          {/* Payment history */}
          {filteredPayments.length === 0 && (
            <p className="font-body text-muted-foreground text-center py-8">No payments recorded yet</p>
          )}
          {filteredPayments.map(payment => (
            <div key={payment.id} className="border border-border rounded-lg p-3 space-y-2">
              {editingPaymentId === payment.id ? (
                <div className="space-y-2">
                  <Input value={editPayAmount} onChange={e => setEditPayAmount(e.target.value)} type="number"
                    placeholder="Amount" className="bg-secondary border-border text-foreground font-body text-sm" />
                  <Input value={editPayNotes} onChange={e => setEditPayNotes(e.target.value)} placeholder="Notes"
                    className="bg-secondary border-border text-foreground font-body text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updatePayment(payment.id)} className="font-display text-xs tracking-wider flex-1">Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingPaymentId(null)} className="font-display text-xs tracking-wider flex-1">Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-display text-sm text-foreground">{getEmployeeName(payment.employee_id)}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        {format(new Date(payment.paid_at), 'MMM d, yyyy · h:mm a')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-sm text-foreground">₱{Number(payment.amount).toFixed(0)}</p>
                      {Number((payment as any).bonus_amount || 0) > 0 && (
                        <p className="font-body text-xs text-primary">+₱{Number((payment as any).bonus_amount).toFixed(0)} bonus</p>
                      )}
                      <Badge variant={payment.payment_type === 'advance' ? 'destructive' : 'default'} className="font-body text-xs">
                        {payment.payment_type === 'advance' ? 'Advance' : 'Regular'}
                      </Badge>
                    </div>
                  </div>
                  {payment.period_start && (
                    <p className="font-body text-xs text-muted-foreground">
                      Period: {format(new Date(payment.period_start + 'T00:00:00'), 'MMM d')} – {format(new Date(payment.period_end + 'T00:00:00'), 'MMM d')}
                    </p>
                  )}
                  {payment.notes && (
                    <p className="font-body text-xs text-muted-foreground italic">{payment.notes}</p>
                  )}
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditingPaymentId(payment.id); setEditPayAmount(String(payment.amount)); setEditPayNotes(payment.notes || ''); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost"
                      className={`h-7 w-7 ${confirmDeletePayment === payment.id ? 'text-destructive animate-pulse' : 'text-muted-foreground hover:text-destructive'}`}
                      onClick={() => deletePayment(payment.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SETTINGS SUB-VIEW */}
      {subView === 'settings' && (
        <div className="space-y-4">
          <h3 className="font-display text-sm tracking-wider text-foreground">Payroll Settings</h3>

          {/* Payday Schedule */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <p className="font-display text-xs tracking-wider text-foreground">Payday Schedule</p>
            <select
              value={payrollSettings?.payday_type || 'weekly'}
              onChange={e => upsertSettings({ payday_type: e.target.value })}
              className="w-full bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-2">
              <option value="weekly">Weekly (pick day)</option>
              <option value="bimonthly">Every 15 Days</option>
              <option value="monthly">Every 30 Days</option>
            </select>

            {(payrollSettings?.payday_type || 'weekly') === 'weekly' && (
              <div>
                <label className="font-body text-xs text-muted-foreground">Payday Day</label>
                <select
                  value={payrollSettings?.payday_day_of_week ?? 6}
                  onChange={e => upsertSettings({ payday_day_of_week: parseInt(e.target.value) })}
                  className="w-full bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-2 mt-1">
                  {DAYS_OF_WEEK.map((day, i) => (
                    <option key={i} value={i}>{day}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Employee of the Month Bonus */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <p className="font-display text-xs tracking-wider text-foreground flex items-center gap-1.5">
              <Star className="w-4 h-4 text-primary" /> Employee of the Month Default Bonus
            </p>
            <Input
              type="number"
              value={payrollSettings?.eom_bonus_amount ?? 0}
              onChange={e => upsertSettings({ eom_bonus_amount: parseFloat(e.target.value) || 0 })}
              placeholder="Default bonus amount (₱)"
              className="bg-secondary border-border text-foreground font-body text-sm" />
            <p className="font-body text-xs text-muted-foreground">
              This amount auto-fills when adding an "Employee of the Month" bonus.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollDashboard;
