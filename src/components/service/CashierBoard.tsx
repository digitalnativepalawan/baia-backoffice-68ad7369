import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { deductInventoryForOrder } from '@/lib/inventoryDeduction';
import { getStaffSession } from '@/lib/session';
import { toast } from 'sonner';
import { useResortProfile } from '@/hooks/useResortProfile';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Clock, Flame, GlassWater, Home, ChevronDown, ChevronUp, CreditCard, Check, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import CashierReceipt from './CashierReceipt';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-muted-foreground',
  preparing: 'bg-orange-400',
  ready: 'bg-emerald-400',
};

const CashierBoard = () => {
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<string>('');
  const [chargeToRoom, setChargeToRoom] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paidOrder, setPaidOrder] = useState<any | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);

  const permissions = useMemo(() => {
    const s = getStaffSession();
    return s?.permissions || ['admin'];
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('cashier-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['cashier-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Fetch today's orders
  const { data: orders = [] } = useQuery({
    queryKey: ['cashier-orders'],
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

  // Active bookings for charge-to-room
  const { data: activeBookings = [] } = useQuery({
    queryKey: ['cashier-active-bookings'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('resort_ops_bookings')
        .select('id, check_in, check_out, unit_id, guest_id, resort_ops_guests(full_name), resort_ops_units:unit_id(name)')
        .lte('check_in', today)
        .gte('check_out', today)
        .limit(50);
      return (data || []) as any[];
    },
  });

  const isAutoPayable = useCallback((o: any) => o.payment_type === 'Charge to Room' || !!o.tab_id, []);

  // Bucket orders
  const buckets = useMemo(() => {
    const active: any[] = [];
    const billOut: any[] = [];
    const completed: any[] = [];

    orders.forEach(o => {
      if (o.status === 'Paid') completed.push(o);
      else if (o.status === 'Served' && isAutoPayable(o)) completed.push(o);
      else if (o.status === 'Served') billOut.push(o);
      else active.push(o);
    });

    return { active, billOut, completed };
  }, [orders, isAutoPayable]);

  // Handle payment confirmation
  const handleConfirmPayment = async () => {
    if (!selectedOrder || busy) return;
    const paymentType = chargeToRoom ? 'Charge to Room' : selectedPayment;
    if (!paymentType) return;

    setBusy(true);
    try {
      const updateData: any = {
        status: 'Paid',
        payment_type: paymentType,
        closed_at: new Date().toISOString(),
      };

      if (chargeToRoom && selectedBooking) {
        const booking = activeBookings.find(b => b.id === selectedBooking);
        if (booking?.unit_id) {
          updateData.room_id = booking.unit_id;
        }
      }

      await supabase.from('orders').update(updateData).eq('id', selectedOrder.id);

      // Store paid order for receipt display
      setPaidOrder({ ...selectedOrder, payment_type: paymentType });
      setSelectedOrder(null);
      setSelectedPayment('');
      setChargeToRoom(false);
      setSelectedBooking(null);

      qc.invalidateQueries({ queryKey: ['cashier-orders'] });
      toast.success('Payment confirmed');
    } finally {
      setBusy(false);
    }
  };

  // Handle order actions (same as ServiceBoard)
  const handleAction = async (orderId: string, action: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const updateData: any = {};

    if (action === 'kitchen-start') {
      updateData.kitchen_status = 'preparing';
      if (order.status === 'New') updateData.status = 'Preparing';
      const items = ((order.items as any[]) || []).filter((i: any) => {
        const d = i.department || 'kitchen';
        return d === 'kitchen' || d === 'both';
      });
      if (items.length > 0) await deductInventoryForOrder(orderId, items, 'kitchen');
    } else if (action === 'kitchen-ready') {
      updateData.kitchen_status = 'ready';
      const barItems = ((order.items as any[]) || []).some((i: any) => i.department === 'bar' || i.department === 'both');
      if (!barItems || order.bar_status === 'ready') updateData.status = 'Ready';
    } else if (action === 'bar-start') {
      updateData.bar_status = 'preparing';
      if (order.status === 'New') updateData.status = 'Preparing';
      const items = ((order.items as any[]) || []).filter((i: any) => {
        const d = i.department || 'kitchen';
        return d === 'bar' || d === 'both';
      });
      if (items.length > 0) await deductInventoryForOrder(orderId, items, 'bar');
    } else if (action === 'bar-ready') {
      updateData.bar_status = 'ready';
      const kitchenItems = ((order.items as any[]) || []).some((i: any) => {
        const d = i.department || 'kitchen';
        return d === 'kitchen' || d === 'both';
      });
      if (!kitchenItems || order.kitchen_status === 'ready') updateData.status = 'Ready';
    } else if (action === 'mark-served') {
      updateData.status = 'Served';
      if (order.payment_type === 'Charge to Room' || order.tab_id) {
        updateData.status = 'Paid';
        updateData.closed_at = new Date().toISOString();
      }
    }

    await supabase.from('orders').update(updateData).eq('id', orderId);
    qc.invalidateQueries({ queryKey: ['cashier-orders'] });
    toast.success('Order updated');
  };

  // Receipt view
  if (paidOrder) {
    return <CashierReceipt order={paidOrder} onDone={() => setPaidOrder(null)} />;
  }

  const activePaymentMethods = paymentMethods.filter(m => m.is_active && m.name !== 'Charge to Room');

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      {/* Left: Order list */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border/50">
        {/* Summary */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-card/50 flex-shrink-0">
          <span className="font-display text-sm text-foreground tracking-wider">
            {buckets.active.length + buckets.billOut.length} Active
          </span>
          {buckets.billOut.length > 0 && (
            <span className="font-body text-xs text-amber-400 font-bold">
              {buckets.billOut.length} BILL OUT
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Bill Out section — priority */}
          {buckets.billOut.length > 0 && (
            <div className="p-3">
              <h3 className="font-display text-xs tracking-wider text-amber-400 mb-2 px-1">💰 BILL OUT — Awaiting Payment</h3>
              <div className="space-y-2">
                {buckets.billOut.map(order => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    selected={selectedOrder?.id === order.id}
                    onSelect={() => { setSelectedOrder(order); setChargeToRoom(false); setSelectedPayment(''); setSelectedBooking(null); }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active orders */}
          {buckets.active.length > 0 && (
            <div className="p-3">
              <h3 className="font-display text-xs tracking-wider text-muted-foreground mb-2 px-1">ACTIVE ORDERS</h3>
              <div className="space-y-2">
                {buckets.active.map(order => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    selected={selectedOrder?.id === order.id}
                    onSelect={() => { setSelectedOrder(order); setChargeToRoom(false); setSelectedPayment(''); setSelectedBooking(null); }}
                    onAction={handleAction}
                  />
                ))}
              </div>
            </div>
          )}

          {buckets.active.length === 0 && buckets.billOut.length === 0 && (
            <p className="font-body text-sm text-muted-foreground text-center py-12">No active orders</p>
          )}

          {/* Completed */}
          {buckets.completed.length > 0 && (
            <div className="px-3 pb-4">
              <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
                <CollapsibleTrigger className="w-full flex items-center justify-between bg-secondary/50 border border-border rounded-lg px-4 py-3 hover:bg-secondary transition-colors">
                  <span className="font-display text-xs tracking-wider text-muted-foreground">
                    ✓ Completed ({buckets.completed.length})
                  </span>
                  {completedOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2 max-h-[30vh] overflow-y-auto">
                  {buckets.completed.map(order => (
                    <OrderRow key={order.id} order={order} selected={false} onSelect={() => {}} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      </div>

      {/* Right: Bill Out / Payment Panel */}
      <div className="w-full md:w-[400px] lg:w-[440px] flex-shrink-0 bg-card/50 flex flex-col overflow-y-auto">
        {selectedOrder ? (
          <BillOutPanel
            order={selectedOrder}
            paymentMethods={activePaymentMethods}
            selectedPayment={selectedPayment}
            onSelectPayment={(p) => { setSelectedPayment(p); setChargeToRoom(false); }}
            chargeToRoom={chargeToRoom}
            onChargeToRoom={() => { setChargeToRoom(true); setSelectedPayment(''); }}
            activeBookings={activeBookings}
            selectedBooking={selectedBooking}
            onSelectBooking={setSelectedBooking}
            onConfirm={handleConfirmPayment}
            busy={busy}
            onBack={() => setSelectedOrder(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full p-8">
            <p className="font-body text-sm text-muted-foreground text-center">
              Tap an order to open bill & payment
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/** Compact order row for the list */
const OrderRow = ({ order, selected, onSelect, onAction }: {
  order: any;
  selected: boolean;
  onSelect: () => void;
  onAction?: (orderId: string, action: string) => Promise<void>;
}) => {
  const items = (order.items as any[]) || [];
  const elapsed = formatDistanceToNow(new Date(order.created_at), { addSuffix: false });
  const foodItems = items.filter((i: any) => { const d = i.department || 'kitchen'; return d === 'kitchen' || d === 'both'; });
  const barItems = items.filter((i: any) => i.department === 'bar' || i.department === 'both');
  const isPaid = order.status === 'Paid';

  const statusColor = order.status === 'New' ? 'border-l-gold'
    : order.status === 'Preparing' ? 'border-l-orange-400'
    : order.status === 'Ready' ? 'border-l-emerald-400'
    : order.status === 'Served' ? 'border-l-amber-400'
    : 'border-l-muted';

  return (
    <div
      onClick={!isPaid ? onSelect : undefined}
      className={`rounded-xl border border-border/60 border-l-4 ${statusColor} p-3 transition-all ${
        !isPaid ? 'cursor-pointer active:scale-[0.98]' : 'opacity-60'
      } ${selected ? 'ring-2 ring-gold bg-gold/5' : 'bg-card/90'}`}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm text-foreground tracking-wider truncate">
            {order.location_detail || order.order_type}
          </p>
          {order.guest_name && (
            <p className="font-body text-xs text-muted-foreground truncate">{order.guest_name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0 ml-2">
          <Clock className="w-3 h-3" />
          <span className="font-body text-[11px] tabular-nums">{elapsed}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Status dots */}
        <div className="flex items-center gap-2">
          {foodItems.length > 0 && (
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${STATUS_DOT[order.kitchen_status] || 'bg-muted-foreground'}`} />
              <Flame className="w-3 h-3 text-muted-foreground" />
            </div>
          )}
          {barItems.length > 0 && (
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${STATUS_DOT[order.bar_status] || 'bg-muted-foreground'}`} />
              <GlassWater className="w-3 h-3 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1" />

        <Badge variant="outline" className="font-body text-[10px] h-5">
          {order.status}
        </Badge>

        <span className="font-display text-sm text-gold tabular-nums">₱{order.total.toLocaleString()}</span>
      </div>
    </div>
  );
};

/** Bill Out / Payment panel */
const BillOutPanel = ({
  order, paymentMethods, selectedPayment, onSelectPayment,
  chargeToRoom, onChargeToRoom, activeBookings, selectedBooking,
  onSelectBooking, onConfirm, busy, onBack
}: {
  order: any;
  paymentMethods: any[];
  selectedPayment: string;
  onSelectPayment: (p: string) => void;
  chargeToRoom: boolean;
  onChargeToRoom: () => void;
  activeBookings: any[];
  selectedBooking: string | null;
  onSelectBooking: (id: string | null) => void;
  onConfirm: () => void;
  busy: boolean;
  onBack: () => void;
}) => {
  const items = (order.items as any[]) || [];
  const subtotal = items.reduce((s: number, i: any) => s + i.price * (i.qty || i.quantity || 1), 0);
  const sc = Number(order.service_charge || 0);
  const total = subtotal + sc;

  const canConfirm = chargeToRoom ? !!selectedBooking : !!selectedPayment;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack} className="w-8 h-8 md:hidden">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <p className="font-display text-base tracking-wider text-foreground">
            {order.location_detail || order.order_type}
          </p>
          {order.guest_name && (
            <p className="font-body text-xs text-muted-foreground">{order.guest_name}</p>
          )}
        </div>
        <Badge variant="outline" className="font-body text-xs">{order.status}</Badge>
      </div>

      {/* Itemized bill */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div className="space-y-1">
          {items.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between font-body text-sm">
              <span className="text-foreground">{item.qty || item.quantity || 1}× {item.name}</span>
              <span className="text-muted-foreground tabular-nums">₱{(item.price * (item.qty || item.quantity || 1)).toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-border/50 pt-3 space-y-1">
          <div className="flex justify-between font-body text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">₱{subtotal.toLocaleString()}</span>
          </div>
          {sc > 0 && (
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">Service Charge</span>
              <span className="tabular-nums">₱{sc.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-display text-2xl text-gold pt-2">
            <span>Total</span>
            <span className="tabular-nums">₱{total.toLocaleString()}</span>
          </div>
        </div>

        {/* Payment Method Selection */}
        <div className="space-y-3">
          <p className="font-display text-xs tracking-wider text-muted-foreground">SELECT PAYMENT METHOD</p>
          <div className="grid grid-cols-2 gap-2">
            {paymentMethods.map(m => (
              <button
                key={m.id}
                onClick={() => onSelectPayment(m.name)}
                className={`min-h-[52px] rounded-xl border-2 font-display text-sm tracking-wider transition-all ${
                  selectedPayment === m.name && !chargeToRoom
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-border bg-card text-foreground hover:border-accent/40'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          {/* Charge to Room */}
          {activeBookings.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={onChargeToRoom}
                className={`w-full min-h-[52px] rounded-xl border-2 font-display text-sm tracking-wider flex items-center justify-center gap-2 transition-all ${
                  chargeToRoom
                    ? 'border-[hsl(210,70%,50%)] bg-[hsl(210,70%,50%,0.1)] text-[hsl(210,70%,65%)]'
                    : 'border-border bg-card text-foreground hover:border-accent/40'
                }`}
              >
                <Home className="w-4 h-4" /> Charge to Room
              </button>

              {chargeToRoom && (
                <div className="grid grid-cols-2 gap-2">
                  {activeBookings.map(b => {
                    const unitName = (b as any).resort_ops_units?.name || 'Room';
                    const guestName = (b as any).resort_ops_guests?.full_name || 'Guest';
                    return (
                      <button
                        key={b.id}
                        onClick={() => onSelectBooking(b.id)}
                        className={`min-h-[48px] rounded-xl border-2 font-body text-xs flex flex-col items-center justify-center transition-all ${
                          selectedBooking === b.id
                            ? 'border-[hsl(210,70%,50%)] bg-[hsl(210,70%,50%,0.1)] text-[hsl(210,70%,65%)]'
                            : 'border-border bg-card text-foreground hover:border-accent/40'
                        }`}
                      >
                        <span className="font-display text-sm tracking-wider">{unitName}</span>
                        <span className="text-muted-foreground truncate max-w-full px-2">{guestName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm button */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <Button
          onClick={onConfirm}
          disabled={!canConfirm || busy}
          size="lg"
          className="w-full min-h-[56px] font-display text-base tracking-wider gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
        >
          {busy ? 'Processing…' : (
            <>
              <Check className="w-5 h-5" />
              Confirm Payment — ₱{total.toLocaleString()}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default CashierBoard;
