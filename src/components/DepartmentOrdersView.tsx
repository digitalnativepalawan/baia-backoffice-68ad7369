import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChefHat, Truck, AlertTriangle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Home, LogOut } from 'lucide-react';

interface DepartmentOrdersViewProps {
  department: 'kitchen' | 'bar';
}

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-gold/20 text-gold border-gold/40',
  Preparing: 'bg-orange-500/20 text-orange-400 border-orange-400/40',
  Served: 'bg-blue-500/20 text-blue-400 border-blue-400/40',
};

const STATUSES = ['New', 'Preparing', 'Served'];

const DepartmentOrdersView = ({ department }: DepartmentOrdersViewProps) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeStatus, setActiveStatus] = useState('New');

  // Unlock AudioContext
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    };
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('click', unlock, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    };
  }, []);

  const playChime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(department === 'bar' ? 660 : 880, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.4);
  }, [department]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`${department}-orders-realtime`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: [`orders-${department}`] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, department]);

  const { data: allOrders = [] } = useQuery({
    queryKey: [`orders-${department}`],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['New', 'Preparing', 'Served'])
        .gte('created_at', start.toISOString())
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  // Filter orders that have items for this department
  const orders = useMemo(() => {
    return allOrders.filter(order => {
      const items = (order.items as any[]) || [];
      return items.some(item => {
        const dept = item.department || 'kitchen';
        return dept === department || dept === 'both';
      });
    });
  }, [allOrders, department]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { New: 0, Preparing: 0, Served: 0 };
    orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    return counts;
  }, [orders]);

  const hasNewOrders = statusCounts.New > 0;

  useEffect(() => {
    if (hasNewOrders) {
      playChime();
      intervalRef.current = setInterval(playChime, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [hasNewOrders, playChime]);

  const filtered = useMemo(() => orders.filter(o => o.status === activeStatus), [orders, activeStatus]);

  const advanceOrder = async (orderId: string, nextStatus: string) => {
    await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);
    qc.invalidateQueries({ queryKey: [`orders-${department}`] });
    toast.success(`Order → ${nextStatus}`);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('staff_home_session');
    localStorage.removeItem('emp_id');
    localStorage.removeItem('emp_name');
    navigate('/');
  };

  const deptLabel = department === 'kitchen' ? '🍳 Kitchen' : '🍹 Bar';

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-navy-deep/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Home className="w-5 h-5" />
          </button>
          <h1 className="font-display text-lg tracking-[0.15em] text-foreground">{deptLabel}</h1>
          <button onClick={handleLogout} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

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

      {/* Orders */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {filtered.length === 0 && (
          <p className="font-body text-sm text-cream-dim text-center py-12">No {activeStatus.toLowerCase()} orders for {department}</p>
        )}
        {filtered.map(order => {
          const allItems = (order.items as any[]) || [];
          const deptItems = allItems.filter(item => {
            const d = item.department || 'kitchen';
            return d === department || d === 'both';
          });
          const otherItems = allItems.filter(item => {
            const d = item.department || 'kitchen';
            return d !== department && d !== 'both';
          });
          const isNew = order.status === 'New';

          return (
            <div key={order.id} className={`p-4 border rounded-lg transition-all ${
              isNew ? 'border-gold new-order-card bg-gold/10' : 'border-border bg-card/50'
            }`}>
              {isNew && (
                <div className="flex items-center gap-2 mb-3 bg-gold/20 rounded px-3 py-1.5 border border-gold/40">
                  <AlertTriangle className="w-4 h-4 text-gold blink-dot" />
                  <span className="font-display text-sm text-gold tracking-widest font-bold uppercase">New Order</span>
                </div>
              )}

              {order.scheduled_for && (
                <div className="flex items-center gap-2 mb-3 bg-blue-500/20 rounded px-3 py-1.5 border border-blue-400/40">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="font-display text-sm text-blue-400 tracking-widest font-bold uppercase">
                    Scheduled — {order.location_detail}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">
                    {order.order_type} — {order.location_detail}
                  </p>
                  <p className="font-body text-xs text-cream-dim mt-0.5">
                    {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                  </p>
                </div>
                <Badge variant="outline" className={`font-body text-xs ${STATUS_COLORS[order.status]}`}>
                  {order.status}
                </Badge>
              </div>

              {/* Department items — highlighted */}
              <div className="space-y-1 mb-2">
                {deptItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between font-body text-sm">
                    <span className="text-foreground font-semibold">{item.qty}× {item.name}</span>
                    <span className="text-cream-dim">₱{(item.price * item.qty).toFixed(0)}</span>
                  </div>
                ))}
              </div>

              {/* Other department items — dimmed */}
              {otherItems.length > 0 && (
                <div className="space-y-0.5 mb-3 opacity-40">
                  {otherItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between font-body text-xs">
                      <span className="text-cream-dim">{item.qty}× {item.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action */}
              <div className="pt-3 border-t border-border flex items-center justify-between">
                <span className="font-display text-sm text-gold">₱{order.total.toLocaleString()}</span>
                {order.status === 'New' && (
                  <Button
                    onClick={() => advanceOrder(order.id, 'Preparing')}
                    className="font-body text-xs gap-1.5 bg-gold text-primary-foreground hover:bg-gold/90 font-bold"
                  >
                    <ChefHat className="w-4 h-4" /> Start Preparing
                  </Button>
                )}
                {order.status === 'Preparing' && (
                  <Button
                    onClick={() => advanceOrder(order.id, 'Served')}
                    variant="outline"
                    className="font-body text-xs gap-1.5"
                  >
                    <Truck className="w-4 h-4" /> Mark Served
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DepartmentOrdersView;
