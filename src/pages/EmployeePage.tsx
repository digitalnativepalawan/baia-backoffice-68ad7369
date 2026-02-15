import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, Clock, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const EmployeePage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-active'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('active', true).order('name');
      return data || [];
    },
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['employee-shifts-today'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('employee_shifts')
        .select('*')
        .gte('clock_in', start.toISOString())
        .order('clock_in', { ascending: false });
      return data || [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('employee-shifts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_shifts' }, () => {
        qc.invalidateQueries({ queryKey: ['employee-shifts-today'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const getActiveShift = (employeeId: string) => {
    return shifts.find(s => s.employee_id === employeeId && !s.clock_out);
  };

  const getTodayHours = (employeeId: string) => {
    return shifts
      .filter(s => s.employee_id === employeeId && s.hours_worked)
      .reduce((sum, s) => sum + Number(s.hours_worked), 0);
  };

  const clockIn = async (employeeId: string) => {
    const { error } = await supabase.from('employee_shifts').insert({
      employee_id: employeeId,
      clock_in: new Date().toISOString(),
    });
    if (error) { toast.error('Failed to clock in'); return; }
    qc.invalidateQueries({ queryKey: ['employee-shifts-today'] });
    toast.success('Clocked in!');
  };

  const clockOut = async (employeeId: string) => {
    const active = getActiveShift(employeeId);
    if (!active) return;

    const emp = employees.find(e => e.id === employeeId);
    const clockInTime = new Date(active.clock_in);
    const now = new Date();
    const hoursWorked = Math.round(((now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60)) * 100) / 100;
    const totalPay = Math.round(hoursWorked * Number(emp?.hourly_rate || 0) * 100) / 100;

    const { error } = await supabase.from('employee_shifts').update({
      clock_out: now.toISOString(),
      hours_worked: hoursWorked,
      total_pay: totalPay,
    }).eq('id', active.id);
    if (error) { toast.error('Failed to clock out'); return; }
    qc.invalidateQueries({ queryKey: ['employee-shifts-today'] });
    toast.success(`Clocked out — ${hoursWorked}h, ₱${totalPay}`);
  };

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate('/')} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Home className="w-5 h-5" />
          </button>
          <h1 className="font-display text-xl tracking-wider text-foreground">Employee Clock-In</h1>
        </div>

        <div className="space-y-3">
          {employees.length === 0 && (
            <p className="font-body text-cream-dim text-center py-8">No active employees. Add employees in Admin → Payroll.</p>
          )}
          {employees.map(emp => {
            const activeShift = getActiveShift(emp.id);
            const todayHours = getTodayHours(emp.id);
            const isClockedIn = !!activeShift;

            return (
              <div key={emp.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-display text-sm tracking-wider text-foreground">{emp.name}</p>
                    <p className="font-body text-xs text-cream-dim">₱{Number(emp.hourly_rate).toFixed(0)}/hr</p>
                  </div>
                  <Badge variant={isClockedIn ? 'default' : 'secondary'} className="font-body text-xs">
                    {isClockedIn ? 'Clocked In' : 'Off'}
                  </Badge>
                </div>

                {isClockedIn && activeShift && (
                  <p className="font-body text-xs text-cream-dim">
                    Since {format(new Date(activeShift.clock_in), 'h:mm a')}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <span className="font-body text-xs text-cream-dim">Today: {todayHours.toFixed(1)}h</span>
                  {isClockedIn ? (
                    <Button size="sm" variant="destructive" onClick={() => clockOut(emp.id)} className="font-display text-xs tracking-wider gap-1">
                      <LogOut className="w-3.5 h-3.5" /> Clock Out
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => clockIn(emp.id)} className="font-display text-xs tracking-wider gap-1">
                      <Clock className="w-3.5 h-3.5" /> Clock In
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EmployeePage;
