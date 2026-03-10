import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoomTransactions } from '@/hooks/useRoomTransactions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import {
  DollarSign, RefreshCw, LogOut, UtensilsCrossed, MapPin, Bike, Truck,
  Trash2, Gift, FileText, CreditCard, Palmtree, CheckCircle,
} from 'lucide-react';
import AddPaymentModal from './AddPaymentModal';
import AdjustmentModal from './AdjustmentModal';
import CheckoutModal from './CheckoutModal';
import PrintBill from './PrintBill';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';

const from = (t: string) => supabase.from(t as any) as any;

interface RoomBillingTabProps {
  unit: any;
  booking: any;
  guestName: string | null;
  readOnly?: boolean;
}

const RoomBillingTab = ({ unit, booking, guestName, readOnly = false }: RoomBillingTabProps) => {
  const qc = useQueryClient();
  const { data: transactions = [], isLoading, refetch } = useRoomTransactions(unit?.id, booking?.id || null);
  const [showPayment, setShowPayment] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  // ── ALL F&B orders for this room (including Paid) ──
  const { data: roomOrders = [] } = useQuery({
    queryKey: ['billing-room-orders', unit?.id, unit?.name, booking?.id],
    enabled: !!unit,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data: byRoom } = await supabase.from('orders').select('*')
        .eq('room_id', unit.id).in('status', ['New', 'Preparing', 'Ready', 'Served', 'Paid'])
        .order('created_at', { ascending: false });
      const { data: byLocation } = await supabase.from('orders').select('*')
        .is('room_id', null).eq('location_detail', unit.name)
        .in('status', ['New', 'Preparing', 'Ready', 'Served', 'Paid'])
        .order('created_at', { ascending: false });
      const map = new Map<string, any>();
      for (const o of [...(byRoom || []), ...(byLocation || [])]) map.set(o.id, o);
      let results = Array.from(map.values());
      if (booking) {
        const start = new Date(booking.check_in + 'T00:00:00');
        const end = new Date(booking.check_out + 'T23:59:59');
        results = results.filter(o => {
          const created = new Date(o.created_at);
          return created >= start && created <= end;
        });
      }
      return results;
    },
  });

  const unpaidOrders = roomOrders.filter(o => o.status !== 'Paid');
  const paidOrders = roomOrders.filter(o => o.status === 'Paid');

  // ── Realtime subscription for orders ──
  useEffect(() => {
    if (!unit) return;
    const channel = supabase.channel(`billing-orders-${unit.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['billing-room-orders', unit.id, unit.name, booking?.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [unit?.id, booking?.id]);

  // ── Guest tours ──
  const { data: tours = [] } = useQuery({
    queryKey: ['billing-tours', booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*')
        .eq('booking_id', booking.id).order('created_at', { ascending: false });
      return data || [];
    },
  });

  // ── Guest requests (transport, rentals) ──
  const { data: requests = [] } = useQuery({
    queryKey: ['billing-requests', booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await from('guest_requests').select('*')
        .eq('booking_id', booking.id).neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const charges = transactions.filter(t => t.total_amount > 0);
  const payments = transactions.filter(t => t.total_amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const unpaidOrdersTotal = unpaidOrders
    .filter(o => o.payment_type !== 'Charge to Room')
    .reduce((s, o) => s + Number(o.total || 0), 0);
  const balance = totalCharges - totalPayments + unpaidOrdersTotal;

  const staffName = localStorage.getItem('emp_display_name') || localStorage.getItem('emp_name') || 'Staff';

  // ── Actions ──
  const handleCompOrder = async (orderId: string) => {
    await supabase.from('orders').update({ status: 'Paid', payment_type: 'Comp' }).eq('id', orderId);
    await logAudit('updated', 'orders', orderId, `Comped order by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
    toast.success('Order comped');
  };

  const handleDeleteOrder = async (orderId: string) => {
    await supabase.from('orders').delete().eq('id', orderId);
    await logAudit('deleted', 'orders', orderId, `Deleted order by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
    toast.success('Order deleted');
  };

  const handleDeleteTour = async (tourId: string) => {
    await from('guest_tours').delete().eq('id', tourId);
    await logAudit('deleted', 'guest_tours', tourId, `Deleted tour by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-tours'] });
    toast.success('Tour deleted');
  };

  const handleDeleteRequest = async (reqId: string) => {
    await from('guest_requests').delete().eq('id', reqId);
    await logAudit('deleted', 'guest_requests', reqId, `Deleted request by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-requests'] });
    toast.success('Request deleted');
  };

  const handleCancelTour = async (tourId: string) => {
    await from('guest_tours').update({ status: 'cancelled' }).eq('id', tourId);
    qc.invalidateQueries({ queryKey: ['billing-tours'] });
    toast.success('Tour cancelled');
  };

  const handleCancelRequest = async (reqId: string) => {
    await from('guest_requests').update({ status: 'cancelled' }).eq('id', reqId);
    qc.invalidateQueries({ queryKey: ['billing-requests'] });
    toast.success('Request cancelled');
  };

  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
    qc.invalidateQueries({ queryKey: ['billing-tours'] });
    qc.invalidateQueries({ queryKey: ['billing-requests'] });
  };

  const orderStatusColor = (s: string) => {
    switch (s) {
      case 'New': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Preparing': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Ready': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'Served': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Paid': return 'bg-muted text-muted-foreground border-muted';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const tourStatusColor = (s: string) => {
    switch (s) {
      case 'booked': case 'pending': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'confirmed': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'completed': return 'bg-muted text-muted-foreground';
      case 'cancelled': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) return <p className="font-body text-sm text-muted-foreground text-center py-8">Loading...</p>;

  return (
    <div className="space-y-4">
      {/* ═══ Balance Header ═══ */}
      <div className="border border-border rounded-lg p-4 bg-secondary space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-xs text-muted-foreground">Guest Folio Balance</p>
            <p className={`font-display text-2xl tracking-wider ${balance > 0 ? 'text-destructive' : 'text-green-400'}`}>
              ₱{Math.abs(balance).toLocaleString()}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={refreshAll} className="text-muted-foreground">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <p className="font-body text-xs text-muted-foreground">
          {guestName || 'No guest'} · {unit.name}
          {booking && ` · ${format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')}–${format(new Date(booking.check_out + 'T00:00:00'), 'MMM d')}`}
        </p>
      </div>

      {/* ═══ Action Buttons ═══ */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPayment(true)}
            className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
            <DollarSign className="w-3.5 h-3.5" /> Add Payment
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAdjustment(true)}
            className="font-display text-xs tracking-wider min-h-[44px]">
            Adjustment
          </Button>
          <PrintBill unitName={unit.name} guestName={guestName} booking={booking} transactions={transactions} />
          {booking && (
            <Button size="sm" variant="destructive" onClick={() => setShowCheckout(true)}
              className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
              <LogOut className="w-3.5 h-3.5" /> Check Out
            </Button>
          )}
        </div>
      )}
      {readOnly && (
        <div className="flex flex-wrap gap-2">
          <PrintBill unitName={unit.name} guestName={guestName} booking={booking} transactions={transactions} />
        </div>
      )}

      <Separator />

      {/* ═══ SECTION: Active F&B Orders ═══ */}
      {unpaidOrders.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <UtensilsCrossed className="w-3.5 h-3.5" /> Active F&B Orders
          </p>
          {unpaidOrders.map(o => {
            const items = Array.isArray(o.items) ? o.items : [];
            const isChargedToRoom = o.payment_type === 'Charge to Room';
            return (
              <div key={o.id} className="border border-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-xs text-muted-foreground">
                    {format(new Date(o.created_at), 'MMM d h:mma')} · {o.staff_name || '—'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${orderStatusColor(o.status)}`}>{o.status}</Badge>
                    {isChargedToRoom && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Room</Badge>}
                  </div>
                </div>
                <p className="font-body text-xs text-foreground">
                  {items.map((i: any) => `${i.qty || 1}× ${i.name}`).join(', ')}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm text-foreground">₱{Number(o.total).toLocaleString()}</span>
                  {!readOnly && !isChargedToRoom && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleCompOrder(o.id)}
                        className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300">
                        <Gift className="w-3 h-3 mr-1" /> Comp
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteOrder(o.id)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ SECTION: Paid F&B Orders ═══ */}
      {paidOrders.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> Paid F&B Orders
          </p>
          {paidOrders.map(o => {
            const items = Array.isArray(o.items) ? o.items : [];
            const isChargedToRoom = o.payment_type === 'Charge to Room';
            return (
              <div key={o.id} className="border border-border/40 rounded-lg p-3 space-y-1.5 opacity-70">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-xs text-muted-foreground">
                    {format(new Date(o.created_at), 'MMM d h:mma')} · {o.staff_name || '—'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Paid</Badge>
                    {isChargedToRoom && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Room</Badge>}
                  </div>
                </div>
                <p className="font-body text-xs text-foreground">
                  {items.map((i: any) => `${i.qty || 1}× ${i.name}`).join(', ')}
                </p>
                <span className="font-display text-sm text-muted-foreground">₱{Number(o.total).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ SECTION: Tours & Experiences ═══ */}
      {tours.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <Palmtree className="w-3.5 h-3.5" /> Tours & Experiences
          </p>
          {tours.map((t: any) => (
            <div key={t.id} className="border border-border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-sm text-foreground font-medium">{t.tour_name}</span>
                <Badge variant="outline" className={`text-[10px] ${tourStatusColor(t.status)}`}>{t.status}</Badge>
              </div>
              <div className="flex gap-3 font-body text-xs text-muted-foreground">
                <span>{t.tour_date}</span>
                <span>{t.pax} pax</span>
                {t.pickup_time && <span>Pickup: {t.pickup_time}</span>}
                {t.provider && <span>{t.provider}</span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-display text-sm text-foreground">
                  {Number(t.price) > 0 ? `₱${Number(t.price).toLocaleString()}` : 'Free'}
                </span>
                {!readOnly && t.status !== 'cancelled' && t.status !== 'completed' && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleCancelTour(t.id)}
                      className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300">
                      Cancel
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteTour(t.id)}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ SECTION: Transport & Rentals ═══ */}
      {requests.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> Transport & Rentals
          </p>
          {requests.map((r: any) => {
            const icon = r.request_type === 'Transport' ? <Truck className="w-3.5 h-3.5 text-blue-400" />
              : r.request_type === 'Rental' ? <Bike className="w-3.5 h-3.5 text-purple-400" />
              : <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
            return (
              <div key={r.id} className="border border-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-foreground font-medium flex items-center gap-1.5">
                    {icon} {r.request_type}
                  </span>
                  <Badge variant="outline" className={`text-[10px] ${tourStatusColor(r.status)}`}>{r.status}</Badge>
                </div>
                <p className="font-body text-xs text-muted-foreground">{r.details}</p>
                <div className="flex items-center justify-between">
                  <span className="font-body text-[11px] text-muted-foreground">
                    {format(new Date(r.created_at), 'MMM d h:mma')}
                  </span>
                  {!readOnly && r.status !== 'cancelled' && r.status !== 'completed' && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleCancelRequest(r.id)}
                        className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300">
                        Cancel
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteRequest(r.id)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(unpaidOrders.length > 0 || tours.length > 0 || requests.length > 0) && <Separator />}

      {/* ═══ SECTION: Room Transactions (Ledger) ═══ */}
      <div className="space-y-2">
        <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" /> Room Ledger
        </p>
        {transactions.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground text-center py-4">No transactions yet</p>
        ) : (
          transactions.map(t => (
            <div key={t.id} className={`border rounded-lg p-3 space-y-1 ${t.transaction_type === 'accommodation' ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-body text-xs text-muted-foreground">
                    {format(new Date(t.created_at), 'MMM d h:mma')} · {t.staff_name}
                  </p>
                  <p className="font-display text-sm text-foreground capitalize flex items-center gap-1.5">
                    {t.transaction_type === 'accommodation' && '🏠 '}
                    {t.transaction_type.replace('_', ' ')}
                  </p>
                  {t.notes && <p className="font-body text-xs text-muted-foreground truncate">{t.notes}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <p className={`font-display text-sm ${t.total_amount > 0 ? 'text-foreground' : 'text-green-400'}`}>
                    {t.total_amount > 0 ? '' : '-'}₱{Math.abs(t.total_amount).toLocaleString()}
                  </p>
                  {!readOnly && t.transaction_type === 'accommodation' && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!confirm('Delete this accommodation charge?')) return;
                        await from('room_transactions').delete().eq('id', t.id);
                        await logAudit('deleted', 'room_transactions', t.id, `Deleted accommodation charge ₱${Math.abs(t.total_amount).toLocaleString()} for ${unit.name} by ${staffName}`);
                        qc.invalidateQueries({ queryKey: ['room-transactions', unit.id] });
                        toast.success('Accommodation charge deleted');
                      }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {(t.tax_amount !== 0 || t.service_charge_amount !== 0) && (
                <p className="font-body text-[10px] text-muted-foreground">
                  Sub: ₱{Math.abs(t.amount).toLocaleString()} · Tax: ₱{Math.abs(t.tax_amount).toLocaleString()} · SC: ₱{Math.abs(t.service_charge_amount).toLocaleString()}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <Separator />

      {/* ═══ Summary ═══ */}
      <div className="space-y-1.5">
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">Room Charges</span>
          <span className="text-foreground">₱{totalCharges.toLocaleString()}</span>
        </div>
        {unpaidOrdersTotal > 0 && (
          <div className="flex justify-between font-body text-sm">
            <span className="text-muted-foreground">Unpaid F&B</span>
            <span className="text-amber-400">₱{unpaidOrdersTotal.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">Total Payments</span>
          <span className="text-green-400">₱{totalPayments.toLocaleString()}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-display text-lg tracking-wider">
          <span className="text-foreground">Balance</span>
          <span className={balance > 0 ? 'text-destructive' : 'text-green-400'}>
            ₱{Math.abs(balance).toLocaleString()}
          </span>
        </div>
      </div>

      {/* ═══ Modals ═══ */}
      {!readOnly && (
        <>
          <AddPaymentModal open={showPayment} onOpenChange={setShowPayment}
            unitId={unit.id} unitName={unit.name} guestName={guestName}
            bookingId={booking?.id || null} currentBalance={balance} />
          <AdjustmentModal open={showAdjustment} onOpenChange={setShowAdjustment}
            unitId={unit.id} unitName={unit.name} guestName={guestName}
            bookingId={booking?.id || null} transactions={transactions} />
          {booking && (
            <CheckoutModal open={showCheckout} onOpenChange={setShowCheckout}
              unitId={unit.id} unitName={unit.name} guestName={guestName}
              bookingId={booking.id} booking={booking} transactions={transactions}
              roomTypeId={(unit as any).room_type_id || null} />
          )}
        </>
      )}
    </div>
  );
};

export default RoomBillingTab;
