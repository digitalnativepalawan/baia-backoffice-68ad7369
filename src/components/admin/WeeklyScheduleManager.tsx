import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { format, startOfWeek, addDays, isToday } from 'date-fns';
import { Plus, Pencil, Trash2, Calendar as CalIcon, Clock, Copy, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';

type Employee = { id: string; name: string };
type Schedule = {
  id: string; employee_id: string; schedule_date: string;
  time_in: string; time_out: string; created_at: string; updated_at: string;
};

const TIMELINE_START = 5; // 5 AM
const TIMELINE_END = 22; // 10 PM
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START; // 17 hours

const HOURS = Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => TIMELINE_START + i);

const fmtHour = (h: number) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${ampm}`;
};

const fmtTime = (t: string) => {
  try {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch { return t; }
};

const PRESETS = [
  { label: 'Morning', time_in: '07:00', time_out: '16:00' },
  { label: 'Evening', time_in: '12:00', time_out: '21:00' },
  { label: 'Maintenance', time_in: '08:00', time_out: '17:00' },
];

const inferShiftType = (time_in: string, time_out: string): string => {
  const tin = time_in.slice(0, 5);
  const tout = time_out.slice(0, 5);
  if (tin === '07:00' && tout === '16:00') return 'Morning';
  if (tin === '12:00' && tout === '21:00') return 'Evening';
  if (tin === '08:00' && tout === '17:00') return 'Maintenance';
  if ((tin === '07:00' && tout === '11:00') || (tin === '17:00' && tout === '21:00')) return 'Broken';
  return 'Custom';
};

const SHIFT_COLORS: Record<string, string> = {
  Morning: 'bg-blue-500/30 border-blue-500/50',
  Evening: 'bg-purple-500/30 border-purple-500/50',
  Maintenance: 'bg-green-500/30 border-green-500/50',
  Broken: 'bg-orange-500/30 border-orange-500/50',
  Custom: 'bg-accent/20 border-accent/40',
};

const SHIFT_TEXT_COLORS: Record<string, string> = {
  Morning: 'text-blue-300',
  Evening: 'text-purple-300',
  Maintenance: 'text-green-300',
  Broken: 'text-orange-300',
  Custom: 'text-accent',
};

const timeToPercent = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  const totalMinutes = (h - TIMELINE_START) * 60 + m;
  const totalRange = TIMELINE_HOURS * 60;
  return Math.max(0, Math.min(100, (totalMinutes / totalRange) * 100));
};

const WeeklyScheduleManager = () => {
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const [selectedDayIdx, setSelectedDayIdx] = useState(() => new Date().getDay());

  const [shiftModal, setShiftModal] = useState<{ mode: 'add' | 'edit'; schedule?: Schedule; date?: string; empId?: string } | null>(null);
  const [shiftForm, setShiftForm] = useState({ employee_id: '', schedule_date: '', time_in: '07:00', time_out: '16:00' });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [contextSheet, setContextSheet] = useState<Schedule | null>(null);

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-schedule'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id, name').eq('active', true).order('name');
      return (data || []) as Employee[];
    },
  });

  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ['weekly-schedules', startStr],
    queryFn: async () => {
      const { data } = await supabase.from('weekly_schedules').select('*')
        .gte('schedule_date', startStr).lte('schedule_date', endStr);
      return (data || []) as Schedule[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel('schedules-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_schedules' }, () => {
        qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        qc.invalidateQueries({ queryKey: ['employees-schedule'] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const empMap = useMemo(() => {
    const m: Record<string, Employee> = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const openAdd = (date?: string, empId?: string) => {
    setShiftForm({ employee_id: empId || employees[0]?.id || '', schedule_date: date || format(weekDates[selectedDayIdx], 'yyyy-MM-dd'), time_in: '07:00', time_out: '16:00' });
    setShiftModal({ mode: 'add', date, empId });
  };

  const openEdit = (s: Schedule) => {
    setShiftForm({ employee_id: s.employee_id, schedule_date: s.schedule_date, time_in: s.time_in.slice(0, 5), time_out: s.time_out.slice(0, 5) });
    setShiftModal({ mode: 'edit', schedule: s });
  };

  const checkOverlap = useCallback((empId: string, date: string, timeIn: string, timeOut: string, excludeId?: string) => {
    return schedules.filter(s =>
      s.employee_id === empId && s.schedule_date === date && s.id !== excludeId
    ).some(s => {
      const sIn = s.time_in.slice(0, 5);
      const sOut = s.time_out.slice(0, 5);
      return timeIn < sOut && timeOut > sIn;
    });
  }, [schedules]);

  const saveShift = async () => {
    if (!shiftForm.employee_id || !shiftForm.schedule_date) return;
    const excludeId = shiftModal?.mode === 'edit' ? shiftModal.schedule?.id : undefined;
    if (checkOverlap(shiftForm.employee_id, shiftForm.schedule_date, shiftForm.time_in, shiftForm.time_out, excludeId)) {
      toast.warning('This shift overlaps with an existing shift for this employee');
    }
    if (shiftModal?.mode === 'edit' && shiftModal.schedule) {
      await supabase.from('weekly_schedules').update({
        employee_id: shiftForm.employee_id, schedule_date: shiftForm.schedule_date,
        time_in: shiftForm.time_in, time_out: shiftForm.time_out,
      }).eq('id', shiftModal.schedule.id);
      toast.success('Shift updated');
    } else {
      await supabase.from('weekly_schedules').insert({
        employee_id: shiftForm.employee_id, schedule_date: shiftForm.schedule_date,
        time_in: shiftForm.time_in, time_out: shiftForm.time_out,
      });
      toast.success('Shift added');
    }
    setShiftModal(null);
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
  };

  const addBrokenShift = async () => {
    if (!shiftForm.employee_id || !shiftForm.schedule_date) return;
    await supabase.from('weekly_schedules').insert([
      { employee_id: shiftForm.employee_id, schedule_date: shiftForm.schedule_date, time_in: '07:00', time_out: '11:00' },
      { employee_id: shiftForm.employee_id, schedule_date: shiftForm.schedule_date, time_in: '17:00', time_out: '21:00' },
    ]);
    toast.success('Broken shift added');
    setShiftModal(null);
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await supabase.from('weekly_schedules').delete().eq('id', deleteId);
    setDeleteId(null);
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
    toast.success('Shift deleted');
  };

  const duplicateShift = async (s: Schedule) => {
    const nextDate = format(addDays(new Date(s.schedule_date + 'T00:00:00'), 1), 'yyyy-MM-dd');
    await supabase.from('weekly_schedules').insert({
      employee_id: s.employee_id, schedule_date: nextDate,
      time_in: s.time_in.slice(0, 5), time_out: s.time_out.slice(0, 5),
    });
    toast.success('Shift duplicated to next day');
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
  };

  const copyPreviousWeek = async () => {
    const prevStart = format(addDays(weekStart, -7), 'yyyy-MM-dd');
    const prevEnd = format(addDays(weekStart, -1), 'yyyy-MM-dd');
    const { data: prevSchedules } = await supabase.from('weekly_schedules').select('*')
      .gte('schedule_date', prevStart).lte('schedule_date', prevEnd);
    if (!prevSchedules?.length) { toast.error('No shifts found in previous week'); return; }
    const newShifts = prevSchedules.map(s => ({
      employee_id: s.employee_id,
      schedule_date: format(addDays(new Date(s.schedule_date + 'T00:00:00'), 7), 'yyyy-MM-dd'),
      time_in: s.time_in.slice(0, 5), time_out: s.time_out.slice(0, 5),
    }));
    await supabase.from('weekly_schedules').insert(newShifts);
    toast.success(`Copied ${newShifts.length} shifts from previous week`);
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
  };

  const goCurrentWeek = () => {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
    setSelectedDayIdx(new Date().getDay());
  };

  // Get shifts for a specific date
  const getDateShifts = (dateStr: string) => schedules.filter(s => s.schedule_date === dateStr);

  // Shift Block Component
  const ShiftBlock = ({ s, compact = false }: { s: Schedule; compact?: boolean }) => {
    const type = inferShiftType(s.time_in, s.time_out);
    const left = timeToPercent(s.time_in.slice(0, 5));
    const right = timeToPercent(s.time_out.slice(0, 5));
    const width = right - left;
    const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTouchStart = () => {
      longPressRef.current = setTimeout(() => {
        setContextSheet(s);
      }, 500);
    };
    const handleTouchEnd = () => {
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };

    const block = (
      <div
        className={`absolute top-0.5 bottom-0.5 rounded border ${SHIFT_COLORS[type]} cursor-pointer
          transition-all hover:shadow-lg hover:shadow-background/20 hover:scale-[1.02] hover:z-10
          flex items-center overflow-hidden group/block`}
        style={{ left: `${left}%`, width: `${width}%`, minWidth: compact ? '30px' : '40px' }}
        onClick={() => openEdit(s)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className={`px-1 flex items-center gap-0.5 w-full min-h-[40px] ${compact ? 'min-h-[36px]' : 'min-h-[44px]'}`}>
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] font-body font-semibold ${SHIFT_TEXT_COLORS[type]} truncate`}>
              {empMap[s.employee_id]?.name || '?'}
            </div>
            {!compact && (
              <div className="text-[9px] font-body text-foreground/60 truncate">
                {fmtTime(s.time_in)} – {fmtTime(s.time_out)}
              </div>
            )}
            <span className={`text-[8px] font-display ${SHIFT_TEXT_COLORS[type]} opacity-80`}>{type}</span>
          </div>
          {/* Desktop hover actions */}
          <div className="hidden group-hover/block:flex gap-0.5 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="p-0.5 rounded hover:bg-background/30 text-foreground/60 hover:text-accent">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }} className="p-0.5 rounded hover:bg-background/30 text-foreground/60 hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    );

    // Desktop: wrap in context menu
    if (!isMobile) {
      return (
        <ContextMenu>
          <ContextMenuTrigger asChild>{block}</ContextMenuTrigger>
          <ContextMenuContent className="bg-card border-border">
            <ContextMenuItem className="font-body text-sm" onClick={() => openEdit(s)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </ContextMenuItem>
            <ContextMenuItem className="font-body text-sm" onClick={() => duplicateShift(s)}>
              <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate to Next Day
            </ContextMenuItem>
            <ContextMenuItem className="font-body text-sm text-destructive" onClick={() => setDeleteId(s.id)}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    }

    return block;
  };

  // Timeline Row for one employee on one date
  const TimelineRow = ({ emp, dateStr, compact = false }: { emp: Employee; dateStr: string; compact?: boolean }) => {
    const shifts = getDateShifts(dateStr).filter(s => s.employee_id === emp.id);
    return (
      <div className="flex items-stretch border-b border-border last:border-b-0">
        <div className={`shrink-0 ${compact ? 'w-16' : 'w-28'} p-1.5 font-body text-xs font-semibold text-foreground border-r border-border flex items-center`}>
          <span className="truncate">{emp.name}</span>
        </div>
        <div className="flex-1 relative" style={{ minHeight: compact ? '40px' : '48px' }}>
          {/* Hour grid lines */}
          {HOURS.map((h, i) => (
            <div key={h} className="absolute top-0 bottom-0 border-r border-border/30"
              style={{ left: `${(i / TIMELINE_HOURS) * 100}%` }} />
          ))}
          {/* Shift blocks */}
          {shifts.map(s => <ShiftBlock key={s.id} s={s} compact={compact} />)}
          {/* Click empty area to add */}
          <div className="absolute inset-0 z-0" onClick={() => openAdd(dateStr, emp.id)} />
        </div>
        <div className="shrink-0 w-8 flex items-center justify-center border-l border-border">
          <button onClick={() => openAdd(dateStr, emp.id)} className="text-muted-foreground hover:text-accent p-1">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  // Timeline header with hour labels
  const TimelineHeader = ({ compact = false }: { compact?: boolean }) => (
    <div className="flex border-b border-border">
      <div className={`shrink-0 ${compact ? 'w-16' : 'w-28'} border-r border-border`} />
      <div className="flex-1 relative" style={{ height: '24px' }}>
        {HOURS.map((h, i) => (
          <div key={h} className="absolute top-0 bottom-0 flex items-center"
            style={{ left: `${(i / TIMELINE_HOURS) * 100}%` }}>
            <span className={`font-body ${compact ? 'text-[8px]' : 'text-[10px]'} text-muted-foreground whitespace-nowrap pl-0.5`}>
              {fmtHour(h)}
            </span>
          </div>
        ))}
      </div>
      <div className="shrink-0 w-8 border-l border-border" />
    </div>
  );

  // MOBILE VIEW — stacked day cards with scrollable timeline
  if (isMobile) {
    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg tracking-wider text-foreground">Schedule</h2>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="font-display text-[10px] h-9 px-2" onClick={copyPreviousWeek}>
                <Copy className="h-3 w-3 mr-1" /> Copy Week
              </Button>
              <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={() => openAdd()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
          {/* Week nav */}
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="flex-1 font-body text-xs h-9" onClick={goCurrentWeek}>
              {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
            </Button>
            <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {/* Day selector */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {weekDates.map((d, i) => {
              const today = isToday(d);
              const active = selectedDayIdx === i;
              return (
                <button key={i} onClick={() => setSelectedDayIdx(i)}
                  className={`shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded font-body text-xs transition-colors
                    ${active ? 'bg-accent text-accent-foreground' : today ? 'bg-accent/20 text-accent' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}>
                  <span className="text-[10px]">{format(d, 'EEE')}</span>
                  <span className="font-semibold">{format(d, 'd')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeline for selected day */}
        <Card className="bg-card border-border">
          <CardContent className="p-0 overflow-x-auto scrollbar-hide">
            <div style={{ minWidth: '600px' }}>
              <TimelineHeader compact />
              {employees.map(emp => (
                <TimelineRow key={emp.id} emp={emp} dateStr={format(weekDates[selectedDayIdx], 'yyyy-MM-dd')} compact />
              ))}
              {employees.length === 0 && (
                <div className="p-4 text-center font-body text-xs text-muted-foreground">No employees found</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Mobile context menu sheet */}
        <Sheet open={!!contextSheet} onOpenChange={() => setContextSheet(null)}>
          <SheetContent side="bottom" className="bg-card border-border">
            <SheetHeader>
              <SheetTitle className="font-display text-foreground">
                {contextSheet ? empMap[contextSheet.employee_id]?.name : ''} — {contextSheet ? fmtTime(contextSheet.time_in) + ' – ' + fmtTime(contextSheet.time_out) : ''}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-2 pt-3">
              <Button variant="outline" className="w-full justify-start font-body h-11" onClick={() => { if (contextSheet) openEdit(contextSheet); setContextSheet(null); }}>
                <Pencil className="h-4 w-4 mr-3" /> Edit Shift
              </Button>
              <Button variant="outline" className="w-full justify-start font-body h-11" onClick={() => { if (contextSheet) duplicateShift(contextSheet); setContextSheet(null); }}>
                <Copy className="h-4 w-4 mr-3" /> Duplicate to Next Day
              </Button>
              <Button variant="outline" className="w-full justify-start font-body text-destructive h-11" onClick={() => { if (contextSheet) setDeleteId(contextSheet.id); setContextSheet(null); }}>
                <Trash2 className="h-4 w-4 mr-3" /> Delete Shift
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Shift Modal */}
        <ShiftModal shiftModal={shiftModal} shiftForm={shiftForm} setShiftForm={setShiftForm}
          employees={employees} saveShift={saveShift} addBrokenShift={addBrokenShift}
          onClose={() => setShiftModal(null)} onDuplicate={shiftModal?.mode === 'edit' && shiftModal.schedule ? () => { duplicateShift(shiftModal.schedule!); setShiftModal(null); } : undefined} />

        <DeleteConfirm deleteId={deleteId} setDeleteId={setDeleteId} onConfirm={confirmDelete} />
      </div>
    );
  }

  // DESKTOP VIEW — full timeline with day tabs
  const selectedDate = weekDates[selectedDayIdx];
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-grow">
          <CalIcon className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-lg tracking-wider text-foreground">Schedule Timeline</h2>
        </div>
        <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={copyPreviousWeek}>
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Previous Week
        </Button>
        <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={() => openAdd()}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Shift
        </Button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-body text-sm text-accent">
          {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </span>
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={goCurrentWeek}>
          Current Week
        </Button>
      </div>

      {/* Day tabs */}
      <div className="flex gap-1">
        {weekDates.map((d, i) => {
          const today = isToday(d);
          const active = selectedDayIdx === i;
          const dayShiftCount = getDateShifts(format(d, 'yyyy-MM-dd')).length;
          return (
            <button key={i} onClick={() => setSelectedDayIdx(i)}
              className={`flex-1 flex flex-col items-center px-3 py-2 rounded font-body text-sm transition-colors
                ${active ? 'bg-accent text-accent-foreground' : today ? 'bg-accent/15 text-accent' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}>
              <span className="text-xs">{format(d, 'EEE')}</span>
              <span className="font-semibold text-base">{format(d, 'd')}</span>
              {dayShiftCount > 0 && (
                <span className={`text-[10px] ${active ? 'text-accent-foreground/70' : 'text-muted-foreground'}`}>{dayShiftCount} shifts</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Timeline Grid */}
      <Card className="bg-card border-border">
        <CardContent className="p-0 overflow-x-auto">
          <div style={{ minWidth: '900px' }}>
            <TimelineHeader />
            {employees.map(emp => (
              <TimelineRow key={emp.id} emp={emp} dateStr={selectedDateStr} />
            ))}
            {employees.length === 0 && (
              <div className="p-6 text-center font-body text-sm text-muted-foreground">No active employees found</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Shift Modal */}
      <ShiftModal shiftModal={shiftModal} shiftForm={shiftForm} setShiftForm={setShiftForm}
        employees={employees} saveShift={saveShift} addBrokenShift={addBrokenShift}
        onClose={() => setShiftModal(null)} onDuplicate={shiftModal?.mode === 'edit' && shiftModal.schedule ? () => { duplicateShift(shiftModal.schedule!); setShiftModal(null); } : undefined} />

      <DeleteConfirm deleteId={deleteId} setDeleteId={setDeleteId} onConfirm={confirmDelete} />
    </div>
  );
};

// Shift Add/Edit Modal
const ShiftModal = ({ shiftModal, shiftForm, setShiftForm, employees, saveShift, addBrokenShift, onClose, onDuplicate }: {
  shiftModal: any; shiftForm: any; setShiftForm: any; employees: Employee[];
  saveShift: () => void; addBrokenShift: () => void; onClose: () => void; onDuplicate?: () => void;
}) => (
  <Dialog open={!!shiftModal} onOpenChange={() => onClose()}>
    <DialogContent className="bg-card border-border max-w-sm">
      <DialogHeader>
        <DialogTitle className="font-display text-foreground">{shiftModal?.mode === 'edit' ? 'Edit Shift' : 'Add Shift'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="font-body text-xs text-muted-foreground">Employee</Label>
          <Select value={shiftForm.employee_id} onValueChange={v => setShiftForm((p: any) => ({ ...p, employee_id: v }))}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {employees.map(e => <SelectItem key={e.id} value={e.id} className="font-body text-foreground">{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-body text-xs text-muted-foreground">Date</Label>
          <Input type="date" value={shiftForm.schedule_date} onChange={e => setShiftForm((p: any) => ({ ...p, schedule_date: e.target.value }))}
            className="bg-secondary border-border text-foreground font-body text-xs h-9" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="font-body text-xs text-muted-foreground">Time In</Label>
            <Input type="time" value={shiftForm.time_in} onChange={e => setShiftForm((p: any) => ({ ...p, time_in: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body text-xs h-9" />
          </div>
          <div>
            <Label className="font-body text-xs text-muted-foreground">Time Out</Label>
            <Input type="time" value={shiftForm.time_out} onChange={e => setShiftForm((p: any) => ({ ...p, time_out: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body text-xs h-9" />
          </div>
        </div>

        {/* Shift type presets */}
        <div>
          <Label className="font-body text-xs text-muted-foreground mb-1 block">Shift Type</Label>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <Button key={p.label} size="sm" variant="outline" className="font-display text-[10px] h-8"
                onClick={() => setShiftForm((f: any) => ({ ...f, time_in: p.time_in, time_out: p.time_out }))}>
                {p.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="font-display text-[10px] h-8" onClick={addBrokenShift}>
              Broken Shift
            </Button>
          </div>
        </div>

        <Button onClick={saveShift} className="w-full font-display tracking-wider">
          {shiftModal?.mode === 'edit' ? 'Update Shift' : 'Add Shift'}
        </Button>

        {onDuplicate && (
          <Button variant="outline" onClick={onDuplicate} className="w-full font-body text-xs">
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Duplicate to Next Day
          </Button>
        )}
      </div>
    </DialogContent>
  </Dialog>
);

// Delete Confirmation Dialog
const DeleteConfirm = ({ deleteId, setDeleteId, onConfirm }: {
  deleteId: string | null; setDeleteId: (id: string | null) => void; onConfirm: () => void;
}) => (
  <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
    <AlertDialogContent className="bg-card border-border">
      <AlertDialogHeader>
        <AlertDialogTitle className="font-display text-foreground">Delete Shift?</AlertDialogTitle>
        <AlertDialogDescription className="font-body text-muted-foreground">This action cannot be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="font-display">Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground font-display">Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default WeeklyScheduleManager;
