import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import OrderCard from '@/components/admin/OrderCard';
import { useResortProfile } from '@/hooks/useResortProfile';

const STATUSES = ['New', 'Preparing', 'Served', 'Paid'];

const StaffOrdersView = () => {
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Unlock AudioContext on first user interaction (mobile requirement)
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    };
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('click', unlock, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    };
  }, []);

  // Play a two-tone chime
  const playChime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.2);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1108.73, now + 0.2);
    osc2.connect(gain);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.5);
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('staff-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['orders-staff'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { data: orders = [] } = useQuery({
    queryKey: ['orders-staff'],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['New', 'Preparing', 'Served', 'Paid'])
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  const [activeStatus, setActiveStatus] = useState('New');

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { New: 0, Preparing: 0, Served: 0, Paid: 0 };
    orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    return counts;
  }, [orders]);

  const hasNewOrders = statusCounts.New > 0;

  // Repeating chime every 5s while there are New orders
  useEffect(() => {
    if (hasNewOrders) {
      playChime(); // play immediately
      intervalRef.current = setInterval(playChime, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasNewOrders, playChime]);

  const filtered = useMemo(() => orders.filter(o => o.status === activeStatus), [orders, activeStatus]);

  const advanceOrder = async (orderId: string, nextStatus: string) => {
    const updateData: any = { status: nextStatus };
    if (nextStatus === 'Closed') updateData.closed_at = new Date().toISOString();
    await supabase.from('orders').update(updateData).eq('id', orderId);
    qc.invalidateQueries({ queryKey: ['orders-staff'] });
    toast.success(`Order → ${nextStatus}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 px-4 py-3">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={`font-display text-xs tracking-wider px-3 min-h-[44px] rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeStatus === s
                ? 'bg-gold/20 text-gold border border-gold/40'
                : 'bg-secondary text-cream-dim border border-border'
            } ${s === 'New' && hasNewOrders && activeStatus !== s ? 'tab-pulse' : ''}`}
          >
            {s}
            {statusCounts[s] > 0 && (
              <span className={`text-[10px] font-body font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                activeStatus === s ? 'bg-gold text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {statusCounts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {filtered.length === 0 && (
          <p className="font-body text-sm text-cream-dim text-center py-12">No {activeStatus.toLowerCase()} orders</p>
        )}
        {filtered.map(order => (
          <OrderCard key={order.id} order={order} onAdvance={advanceOrder} resortProfile={resortProfile} />
        ))}
      </div>
    </div>
  );
};

export default StaffOrdersView;
