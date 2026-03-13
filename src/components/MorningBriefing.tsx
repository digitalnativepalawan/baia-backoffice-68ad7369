import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Sun, BedDouble, LogIn, LogOut, Sparkles, UtensilsCrossed } from 'lucide-react';
import { format } from 'date-fns';

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
}

function useMorningBriefing() {
  const today = getManilaDate();

  return useQuery<BriefingData>({
    queryKey: ['morning-briefing', today],
    queryFn: async () => {
      const [unitsRes, bookingsRes, hkRes, ordersRes] = await Promise.all([
        from('units').select('id, status'),
        from('resort_ops_bookings').select('id, check_in, check_out, unit_id'),
        from('housekeeping_orders')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending_cleaning', 'pending_inspection']),
        from('orders')
          .select('id', { count: 'exact', head: true })
          .in('status', ['New', 'Preparing']),
      ]);

      const units = (unitsRes.data as any[]) || [];
      const bookings = (bookingsRes.data as any[]) || [];
      const totalRooms = units.length;

      // Occupied = unit status is occupied OR has active booking today
      const occupiedRooms = units.filter((u) => {
        if (u.status === 'occupied') return true;
        return bookings.some(
          (b: any) => b.unit_id === u.id && b.check_in <= today && b.check_out > today
        );
      }).length;

      const arrivalsToday = bookings.filter((b: any) => b.check_in === today).length;
      const departuresToday = bookings.filter((b: any) => b.check_out === today).length;

      return {
        occupiedRooms,
        totalRooms,
        arrivalsToday,
        departuresToday,
        roomsToClean: hkRes.count || 0,
        pendingKitchenOrders: ordersRes.count || 0,
      };
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

const stats = [
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
            <Sun className="h-5 w-5 text-amber-400" />
            <h2 className="font-display text-sm font-semibold tracking-wide text-foreground">
              Morning Briefing
            </h2>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Updated: {getManilaTimeStr()}
          </span>
        </div>

        {/* Stats grid — 2 cols on mobile, 5 on wider */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {stats.map((s) => (
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
      </CardContent>
    </Card>
  );
};

export default MorningBriefing;
