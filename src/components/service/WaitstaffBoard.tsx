import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getStaffSession } from '@/lib/session';
import { toast } from 'sonner';
import { useResortProfile } from '@/hooks/useResortProfile';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Clock, Flame, GlassWater, Home, Receipt, Send, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

const COL_COLORS: Record<string, string> = {
  New: 'border-t-gold',
  Preparing: 'border-t-orange-400',
  Ready: 'border-t-emerald-400',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-muted-foreground',
  preparing: 'bg-orange-400',
  ready: 'bg-emerald-400',
};

const STATUS_BORDER: Record<string, string> = {
  New: 'border-l-gold',
  Preparing: 'border-l-orange-400',
  Ready: 'border-l-emerald-400',
  Served: 'border-l-[hsl(210,70%,50%)]',
};

const WaitstaffBoard = () => {
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();
  const [completedOpen, setCompletedOpen] = useState(false);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('waitstaff-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['waitstaff-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { data: orders = [] } = useQuery({
    queryKey: ['waitstaff-orders'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['New', 'Preparing', 'Ready', 'Served', 'Paid'])
        .gte('created_at', start.toISOString())
        .order('created_at', { ascending: true })
        .limit(300);
      return data || [];
    },
    refetchInterval: 5000,
  });

  const columns = useMemo(() => {
    const cols: Record<string, any[]> = { New: [], Preparing: [], Ready: [], Completed: [] };
    orders.forEach(o => {
      if (o.status === 'New') cols.New.push(o);
      else if (o.status === 'Preparing') cols.Preparing.push(o);
      else if (o.status === 'Ready') cols.Ready.push(o);
      else if (o.status === 'Served' || o.status === 'Paid') {
        cols.Completed.push(o);
      }
    });
    return cols;
  }, [orders]);

  const handleSendToCashier = useCallback(async (orderId: string) => {
    await supabase.from('orders').update({ status: 'Served' }).eq('id', orderId);
    qc.invalidateQueries({ queryKey: ['waitstaff-orders'] });
    qc.invalidateQueries({ queryKey: ['cashier-orders'] });
    toast.success('Order sent to Cashier');
  }, [qc]);

  const totalActive = columns.New.length + columns.Preparing.length + columns.Ready.length;

  return (
    <div className="h-full flex flex-col">
      {/* Summary strip */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-card/50 flex-shrink-0">
        <span className="font-display text-sm text-foreground tracking-wider">{totalActive} Active</span>
        {columns.New.length > 0 && (
          <span className="font-body text-xs text-gold font-bold blink-dot">{columns.New.length} NEW</span>
        )}
        {columns.Ready.length > 0 && (
          <span className="font-body text-xs text-emerald-400 font-bold">{columns.Ready.length} READY</span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {/* Desktop: 3-column kanban */}
        <div className="hidden md:grid gap-3 p-4 md:grid-cols-3">
          {(['New', 'Preparing', 'Ready'] as const).map(col => (
            <div key={col} className={`flex flex-col border-t-4 ${COL_COLORS[col]} rounded-t-lg bg-secondary/30`}>
              <div className="px-3 py-2 flex items-center justify-between">
                <h3 className="font-display text-sm tracking-wider text-foreground">{col}</h3>
                <span className="font-body text-xs text-muted-foreground font-bold bg-muted rounded-full w-6 h-6 flex items-center justify-center">
                  {columns[col].length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 max-h-[60vh]">
                {columns[col].map(order => (
                  <WaitstaffCard key={order.id} order={order} col={col} onSendToCashier={handleSendToCashier} compact />
                ))}
                {columns[col].length === 0 && (
                  <p className="font-body text-xs text-muted-foreground text-center py-8">No orders</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Completed — Desktop */}
        {columns.Completed.length > 0 && (
          <div className="hidden md:block px-4 pb-4">
            <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between bg-secondary/50 border border-border rounded-lg px-4 py-3 hover:bg-secondary transition-colors">
                <span className="font-display text-sm tracking-wider text-muted-foreground">✓ Completed Today ({columns.Completed.length})</span>
                {completedOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="grid gap-3 max-h-[40vh] overflow-y-auto grid-cols-3">
                  {columns.Completed.map(order => (
                    <WaitstaffCard key={order.id} order={order} col="Completed" onSendToCashier={handleSendToCashier} compact />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Mobile: tabbed view */}
        <MobileTabView columns={columns} onSendToCashier={handleSendToCashier} />
      </div>
    </div>
  );
};

const WaitstaffCard = ({ order, col, onSendToCashier, compact }: {
  order: any; col: string; onSendToCashier: (id: string) => Promise<void>; compact?: boolean;
}) => {
  const [busy, setBusy] = useState(false);
  const items = (order.items as any[]) || [];
  const elapsed = formatDistanceToNow(new Date(order.created_at), { addSuffix: false });
  const foodItems = items.filter((i: any) => { const d = i.department || 'kitchen'; return d === 'kitchen' || d === 'both'; });
  const barItems = items.filter((i: any) => i.department === 'bar' || i.department === 'both');
  const isRoomCharge = order.payment_type === 'Charge to Room';
  const isTab = !!order.tab_id;
  const isReady = order.status === 'Ready';
  const isCompleted = order.status === 'Served' || order.status === 'Paid';
  const borderClass = STATUS_BORDER[order.status] || 'border-l-border';

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await onSendToCashier(order.id); } finally { setBusy(false); }
  };

  return (
    <div className={`rounded-xl border border-border/60 border-l-4 ${borderClass} bg-card/90 backdrop-blur-sm ${
      order.status === 'New' ? 'new-order-card' : ''
    } ${isCompleted ? 'opacity-60' : ''} ${compact ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base text-foreground tracking-wider truncate">
            {order.location_detail || order.order_type}
          </p>
          {order.guest_name && (
            <p className="font-body text-xs text-muted-foreground mt-0.5 truncate">{order.guest_name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0 ml-2">
          <Clock className="w-3 h-3" />
          <span className="font-body text-[11px] tabular-nums">{elapsed}</span>
        </div>
      </div>

      {/* Status dots */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {foodItems.length > 0 && (
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${STATUS_DOT[order.kitchen_status] || 'bg-muted-foreground'}`} />
            <Flame className="w-3 h-3 text-muted-foreground" />
            <span className="font-body text-[11px] text-muted-foreground">{foodItems.length}</span>
          </div>
        )}
        {barItems.length > 0 && (
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${STATUS_DOT[order.bar_status] || 'bg-muted-foreground'}`} />
            <GlassWater className="w-3 h-3 text-muted-foreground" />
            <span className="font-body text-[11px] text-muted-foreground">{barItems.length}</span>
          </div>
        )}
        {isRoomCharge && (
          <Badge variant="outline" className="font-body text-[10px] h-5 gap-1 bg-[hsl(210,70%,50%,0.15)] text-[hsl(210,70%,65%)] border-[hsl(210,70%,50%,0.3)]">
            <Home className="w-3 h-3" /> Room
          </Badge>
        )}
        {isTab && !isRoomCharge && (
          <Badge variant="outline" className="font-body text-[10px] h-5 gap-1 bg-[hsl(270,60%,55%,0.15)] text-[hsl(270,60%,70%)] border-[hsl(270,60%,55%,0.3)]">
            <Receipt className="w-3 h-3" /> Tab
          </Badge>
        )}
      </div>

      {/* Items */}
      <div className="space-y-0.5 mb-3">
        {items.slice(0, compact ? 3 : 6).map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between font-body">
            <span className="text-foreground text-sm truncate mr-2">{item.qty || item.quantity || 1}× {item.name}</span>
            <span className="text-muted-foreground text-sm tabular-nums flex-shrink-0">₱{(item.price * (item.qty || item.quantity || 1)).toLocaleString()}</span>
          </div>
        ))}
        {items.length > (compact ? 3 : 6) && (
          <p className="font-body text-[11px] text-muted-foreground">+{items.length - (compact ? 3 : 6)} more…</p>
        )}
      </div>

      {/* Total + Action */}
      <div className="pt-2.5 border-t border-border/50">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg text-gold tabular-nums">₱{order.total.toLocaleString()}</span>
          {isReady && (
            <Button
              onClick={handleSend}
              disabled={busy}
              size="lg"
              className="font-display tracking-wider gap-2 text-sm min-h-[48px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busy ? 'Sending…' : <><Send className="w-5 h-5" /> Send to Cashier</>}
            </Button>
          )}
          {isCompleted && (
            <Badge variant="outline" className="font-body text-[10px] h-5 border-emerald-400/50 text-emerald-400">
              {order.status === 'Paid' ? 'Paid' : 'Served'}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};

const MobileTabView = ({ columns, onSendToCashier }: {
  columns: Record<string, any[]>;
  onSendToCashier: (id: string) => Promise<void>;
}) => {
  const [tab, setTab] = useState<string>('New');
  const [completedOpen, setCompletedOpen] = useState(false);

  return (
    <div className="md:hidden flex flex-col h-full">
      <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-hide flex-shrink-0">
        {(['New', 'Preparing', 'Ready'] as const).map(col => (
          <button
            key={col}
            onClick={() => setTab(col)}
            className={`font-display text-xs tracking-wider px-4 min-h-[48px] rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors ${
              tab === col ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground border border-border'
            } ${col === 'New' && columns.New.length > 0 && tab !== col ? 'tab-pulse' : ''}`}
          >
            {col}
            {columns[col].length > 0 && (
              <span className={`text-[11px] font-body font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                tab === col ? 'bg-foreground/20 text-foreground' : 'bg-muted text-muted-foreground'
              }`}>{columns[col].length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
        {columns[tab]?.length === 0 && (
          <p className="font-body text-sm text-muted-foreground text-center py-12">No {tab.toLowerCase()} orders</p>
        )}
        {columns[tab]?.map(order => (
          <WaitstaffCard key={order.id} order={order} col={tab} onSendToCashier={onSendToCashier} />
        ))}
      </div>
      {columns.Completed.length > 0 && (
        <div className="px-3 pb-4 flex-shrink-0">
          <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between bg-secondary/50 border border-border rounded-lg px-4 py-3">
              <span className="font-display text-xs tracking-wider text-muted-foreground">✓ Completed ({columns.Completed.length})</span>
              {completedOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3 max-h-[40vh] overflow-y-auto">
              {columns.Completed.map(order => (
                <WaitstaffCard key={order.id} order={order} col="Completed" onSendToCashier={onSendToCashier} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
};

export default WaitstaffBoard;
