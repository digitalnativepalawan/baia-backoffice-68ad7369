import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Sun, BedDouble, LogIn, LogOut, Sparkles, UtensilsCrossed, ClipboardList, Zap } from 'lucide-react';

const from = (table: string) => supabase.from(table as any);

const getManilaDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

const getManilaTimeStr = () =>
  new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

interface BriefingData {
  occupiedRooms: number;
  totalRooms: number;
  arrivalsToday: number;
  departuresToday: number;
  roomsToClean: number;
  pendingKitchenOrders: number;
  adminTasks: { title: string; assignee: string }[];
  opsTasks: string[];
}

function useMorningBriefing() {
  const today = getManilaDate();

  return useQuery<BriefingData>({
    queryKey: ['morning-briefing', today],
    queryFn: async () => {
      const [unitsRes, bookingsRes, ordersRes, tasksRes, employeesRes, opsUnitsRes] = await Promise.all([
        from('units').select('id, status'),
        from('resort_ops_bookings').select('id, check_in, check_out, unit_id, resort_ops_guests(full_name), resort_ops_units:unit_id(name)'),
        from('orders')
          .select('id', { count: 'exact', head: true })
          .in('status', ['New', 'Preparing']),
        from('employee_tasks')
          .select('title, employee_id, status, due_date')
          .eq('status', 'pending')
          .lte('due_date', today + 'T23:59:59')
          .is('archived_at', null),
        from('employees').select('id, display_name, name'),
        from('resort_ops_units').select('id, name'),
      ]);

      const units = (unitsRes.data as any[]) || [];
      const bookings = (bookingsRes.data as any[]) || [];
      const totalRooms = units.length;
      const employees = (employeesRes.data as any[]) || [];
      const opsUnits = (opsUnitsRes.data as any[]) || [];
      const pendingKitchenCount = ordersRes.count || 0;

      // --- Stats ---
      const occupiedRooms = units.filter((u) => {
        if (u.status === 'occupied') return true;
        return bookings.some(
          (b: any) => b.unit_id === u.id && b.check_in <= today && b.check_out > today
        );
      }).length;

      const roomsToClean = units.filter(
        (u) => u.status === 'dirty' || u.status === 'cleaning' || u.status === 'to_clean'
      ).length;

      const todayArrivals = bookings.filter((b: any) => b.check_in === today);
      const todayDepartures = bookings.filter((b: any) => b.check_out === today);

      // --- Admin tasks ---
      const empMap = new Map(employees.map((e: any) => [e.id, e.display_name || e.name || 'Staff']));
      const adminTasks = ((tasksRes.data as any[]) || []).map((t: any) => ({
        title: t.title,
        assignee: empMap.get(t.employee_id) || 'Unassigned',
      }));

      // --- Auto ops tasks ---
      const opsTasks: string[] = [];

      // Helper to resolve unit name from booking
      const getUnitName = (b: any) => {
        // Try joined data first
        if (b.resort_ops_units?.name) return b.resort_ops_units.name;
        // Fallback: lookup from opsUnits
        const u = opsUnits.find((ou: any) => ou.id === b.unit_id);
        return u?.name || 'Room';
      };
      const getGuestName = (b: any) => b.resort_ops_guests?.full_name || 'Guest';

      todayArrivals.forEach((b: any) => {
        opsTasks.push(`Prepare ${getUnitName(b)} for arrival — guest ${getGuestName(b)}`);
      });

      todayDepartures.forEach((b: any) => {
        opsTasks.push(`Clean ${getUnitName(b)} after checkout — guest ${getGuestName(b)}`);
      });

      if (pendingKitchenCount > 0) {
        opsTasks.push(`Prepare ${pendingKitchenCount} kitchen order${pendingKitchenCount > 1 ? 's' : ''}`);
      } else {
        opsTasks.push('Kitchen prep: none');
      }

      return {
        occupiedRooms,
        totalRooms,
        arrivalsToday: todayArrivals.length,
        departuresToday: todayDepartures.length,
        roomsToClean,
        pendingKitchenOrders: pendingKitchenCount,
        adminTasks,
        opsTasks,
      };
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

const statsDef = [
  { key: 'occupancy', icon: BedDouble, label: 'Occupancy' },
  { key: 'arrivals', icon: LogIn, label: 'Arrivals today' },
  { key: 'departures', icon: LogOut, label: 'Departures today' },
  { key: 'cleaning', icon: Sparkles, label: 'Rooms to clean' },
  { key: 'kitchen', icon: UtensilsCrossed, label: 'Pending kitchen' },
] as const;

const MorningBriefing = () => {
  const { data, isLoading } = useMorningBriefing();

  const values: Record<string, string> = data
    ? {
        occupancy: `${data.occupiedRooms} / ${data.totalRooms}`,
        arrivals: String(data.arrivalsToday),
        departures: String(data.departuresToday),
        cleaning: String(data.roomsToClean),
        kitchen: String(data.pendingKitchenOrders),
      }
    : {};

  return (
    <Card className="border-primary/20 bg-primary/5 mb-4">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-primary" />
            <h2 className="font-display text-sm font-semibold tracking-wide text-foreground">
              Morning Briefing
            </h2>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Updated: {getManilaTimeStr()}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {statsDef.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-2 rounded-md bg-background/60 border border-border/50 px-3 py-2"
            >
              <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{s.label}</p>
                <p className="text-sm font-semibold text-foreground">
                  {isLoading ? '…' : values[s.key] ?? '–'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Task sections */}
        {!isLoading && data && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Admin Tasks */}
            <div className="rounded-md bg-background/60 border border-border/50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground tracking-wide">Admin Tasks</h3>
              </div>
              {data.adminTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No admin tasks scheduled today</p>
              ) : (
                <ul className="space-y-1">
                  {data.adminTasks.map((t, i) => (
                    <li key={i} className="text-xs text-foreground leading-relaxed">
                      <span className="text-muted-foreground mr-1">•</span>
                      {t.title} <span className="text-muted-foreground">— assigned to {t.assignee}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Operations Tasks */}
            <div className="rounded-md bg-background/60 border border-border/50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground tracking-wide">Operations Tasks</h3>
              </div>
              <ul className="space-y-1">
                {data.opsTasks.map((t, i) => (
                  <li key={i} className="text-xs text-foreground leading-relaxed">
                    <span className="text-muted-foreground mr-1">•</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MorningBriefing;
