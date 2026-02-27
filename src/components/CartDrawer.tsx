import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/lib/cart';
import { useResortProfile } from '@/hooks/useResortProfile';
import { formatWhatsAppMessage, buildWhatsAppUrl } from '@/lib/order';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Minus, Plus, Trash2, Send, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { checkStock, type Shortage } from '@/lib/stockCheck';

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: string;
  orderType: string;
  locationDetail: string;
}

const CartDrawer = ({ open, onOpenChange, mode, orderType: initialOrderType, locationDetail: initialLocation }: CartDrawerProps) => {
  const cart = useCart();
  const { data: profile } = useResortProfile();
  const brandName = profile?.resort_name || 'Resort';
  const [paymentType, setPaymentType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [orderSummary, setOrderSummary] = useState({ itemCount: 0, grandTotal: 0 });
  const [stockWarning, setStockWarning] = useState<Shortage[]>([]);
  const [overrideStock, setOverrideStock] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'asap' | 'scheduled'>('asap');
  const [scheduledDay, setScheduledDay] = useState<'today' | 'tomorrow'>('today');
  const [scheduledHour, setScheduledHour] = useState('7');
  const [scheduledMinute, setScheduledMinute] = useState('00');
  const [scheduledPeriod, setScheduledPeriod] = useState<'AM' | 'PM'>('PM');

  // Order type selection state (for guests who haven't pre-selected)
  const [selectedOrderType, setSelectedOrderType] = useState(initialOrderType);
  const [selectedLocation, setSelectedLocation] = useState(initialLocation);

  useEffect(() => {
    setSelectedOrderType(initialOrderType);
    setSelectedLocation(initialLocation);
  }, [initialOrderType, initialLocation]);

  const isStaff = mode === 'staff';
  const subtotal = cart.total();
  const serviceCharge = Math.round(subtotal * 0.10);
  const grandTotal = subtotal + serviceCharge;

  // Fetch order types for guest selection
  const { data: orderTypes = [] } = useQuery({
    queryKey: ['order-types-cart'],
    queryFn: async () => {
      const { data } = await supabase.from('order_types').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });

  const { data: kitchenSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').eq('active', true).order('unit_name');
      return data || [];
    },
  });

  const { data: tables } = useQuery({
    queryKey: ['resort_tables'],
    queryFn: async () => {
      const { data } = await supabase.from('resort_tables').select('*').eq('active', true).order('table_name');
      return data || [];
    },
  });

  const activeOrderType = orderTypes.find(ot => ot.type_key === selectedOrderType);
  const needsOrderType = !selectedOrderType || !selectedLocation;

  const getSelectOptions = (sourceTable: string | null) => {
    if (sourceTable === 'units') return units?.map(u => ({ id: u.id, name: u.unit_name })) || [];
    if (sourceTable === 'resort_tables') return tables?.map(t => ({ id: t.id, name: t.table_name })) || [];
    return [];
  };

  const handleClose = (open: boolean) => {
    if (!open) setSubmitted(false);
    onOpenChange(open);
  };

  const handleSendToKitchen = async () => {
    if (!selectedOrderType || !selectedLocation) {
      toast.error('Please select order type and location');
      return;
    }
    if (isStaff && !paymentType) {
      toast.error('Please select a payment type');
      return;
    }

    // Stock check before ordering
    if (!overrideStock) {
      const result = await checkStock(cart.items.map(i => ({ name: i.name, quantity: i.quantity })));
      if (!result.canFulfill) {
        setStockWarning(result.shortages);
        toast.error('Some items are out of stock');
        return;
      }
    }
    setStockWarning([]);
    setOverrideStock(false);

    // Compute scheduled_for timestamp
    let scheduledFor: string | null = null;
    if (selectedOrderType === 'Room' && scheduleMode === 'scheduled') {
      const now = new Date();
      const d = new Date(now);
      if (scheduledDay === 'tomorrow') d.setDate(d.getDate() + 1);
      let h = parseInt(scheduledHour);
      if (scheduledPeriod === 'PM' && h < 12) h += 12;
      if (scheduledPeriod === 'AM' && h === 12) h = 0;
      d.setHours(h, parseInt(scheduledMinute), 0, 0);
      scheduledFor = d.toISOString();
    }

    setSubmitting(true);
    try {
      const { data: existingTabs } = await supabase
        .from('tabs')
        .select('*')
        .eq('location_type', selectedOrderType)
        .eq('location_detail', selectedLocation)
        .eq('status', 'Open')
        .limit(1);

      let tabId: string;

      if (existingTabs && existingTabs.length > 0) {
        tabId = existingTabs[0].id;
      } else {
        const { data: newTab, error: tabError } = await supabase
          .from('tabs')
          .insert({
            location_type: selectedOrderType,
            location_detail: selectedLocation,
            status: 'Open',
          })
          .select('id')
          .single();

        if (tabError || !newTab) throw new Error('Failed to create tab');
        tabId = newTab.id;
      }

      const insertData: any = {
        order_type: selectedOrderType,
        location_detail: selectedLocation,
        items: cart.items.map(i => ({ name: i.name, qty: i.quantity, price: i.price })),
        total: subtotal,
        service_charge: serviceCharge,
        payment_type: isStaff ? paymentType : '',
        status: 'New',
        tab_id: tabId,
      };
      if (scheduledFor) insertData.scheduled_for = scheduledFor;

      await supabase.from('orders').insert(insertData);

      // Capture cart items before clearing for WhatsApp fallback
      const cartSnapshot = cart.items.map(i => ({ ...i }));
      const itemCount = cart.count();
      setOrderSummary({ itemCount, grandTotal });
      cart.clearCart();
      setSubmitted(true);
      toast.success('Order sent to kitchen!');

      // WhatsApp fallback: send order to kitchen number if configured
      const kitchenPhone = kitchenSettings?.kitchen_whatsapp_number;
      if (kitchenPhone) {
        const orderInfo = {
          orderType: selectedOrderType as 'Room' | 'DineIn' | 'Beach' | 'WalkIn',
          locationDetail: selectedLocation,
          isStaff,
          paymentType: isStaff ? paymentType : undefined,
        };
        const msg = formatWhatsAppMessage(orderInfo, cartSnapshot, grandTotal, scheduledFor);
        const url = buildWhatsAppUrl(kitchenPhone, msg);
        window.open(url, '_blank');
      }
    } catch {
      toast.error('Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  const TYPE_LABELS: Record<string, string> = {
    Room: 'Room',
    DineIn: 'Dine In',
    Beach: 'Beach Delivery',
    WalkIn: 'Walk-In Guest',
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="bg-card border-border max-h-[90vh]">
        {submitted ? (
          /* Confirmation View */
          <>
            <div className="flex flex-col items-center justify-center py-12 px-6 gap-4">
              <CheckCircle2 className="w-16 h-16 text-green-400 animate-fade-in" />
              <h2 className="font-display text-2xl tracking-wider text-foreground">Order Sent!</h2>
              <div className="flex gap-2">
                <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
                  {TYPE_LABELS[selectedOrderType] || selectedOrderType}
                </span>
                <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
                  {selectedLocation}
                </span>
              </div>
              <p className="font-body text-sm text-cream-dim text-center">
                {orderSummary.itemCount} item{orderSummary.itemCount !== 1 ? 's' : ''} · ₱{orderSummary.grandTotal.toLocaleString()}
              </p>
              <p className="font-body text-xs text-cream-dim text-center mt-2">
                Added to your open tab
              </p>
            </div>
            <DrawerFooter className="pt-0 gap-2">
              <Button onClick={() => { setSubmitted(false); }} className="font-display tracking-wider py-6 w-full">
                Place Another Order
              </Button>
              <Button variant="outline" onClick={() => handleClose(false)} className="font-display tracking-wider py-6 w-full">
                Done
              </Button>
            </DrawerFooter>
          </>
        ) : (
          /* Invoice View */
          <>
            <DrawerHeader className="text-center pb-2">
              {profile?.logo_url && (
                <img src={profile.logo_url} alt={brandName} className="w-10 h-10 object-contain mx-auto mb-1" />
              )}
              <p className="font-display text-xs tracking-[0.3em] text-cream-dim uppercase">{brandName}</p>
              <DrawerTitle className="font-display text-lg text-foreground tracking-wider">
                Your Order
              </DrawerTitle>
              {selectedOrderType && selectedLocation && (
                <div className="flex justify-center gap-2 mt-1">
                  <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
                    {TYPE_LABELS[selectedOrderType] || selectedOrderType}
                  </span>
                  <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
                    {selectedLocation}
                  </span>
                </div>
              )}
            </DrawerHeader>

            <div className="px-4 overflow-y-auto flex-1">
              {cart.items.length === 0 ? (
                <p className="font-body text-cream-dim text-center py-8">Your order is empty</p>
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    {cart.items.map(item => (
                      <div key={item.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-display text-sm text-foreground flex-1 min-w-0 truncate">{item.name}</p>
                          <button onClick={() => cart.removeItem(item.id)} className="text-cream-dim hover:text-destructive min-w-[44px] min-h-[44px] flex items-center justify-center">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button onClick={() => cart.updateQuantity(item.id, item.quantity - 1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center border border-border rounded-full text-cream-dim hover:text-foreground">
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="font-body text-sm text-foreground w-6 text-center">{item.quantity}</span>
                            <button onClick={() => cart.updateQuantity(item.id, item.quantity + 1)} className="min-w-[44px] min-h-[44px] flex items-center justify-center border border-border rounded-full text-cream-dim hover:text-foreground">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="font-body text-xs text-cream-dim">₱{item.price.toLocaleString()} ×{item.quantity}</span>
                            <span className="font-display text-sm text-foreground">₱{(item.price * item.quantity).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-4" />
                  <div className="space-y-1.5">
                    <div className="flex justify-between font-body text-sm">
                      <span className="text-cream-dim">Subtotal</span>
                      <span className="text-foreground">₱{subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-body text-sm">
                      <span className="text-cream-dim">Service Charge (10%)</span>
                      <span className="text-foreground">₱{serviceCharge.toLocaleString()}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-display text-lg tracking-wider">
                      <span className="text-foreground">Total</span>
                      <span className="text-gold">₱{grandTotal.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Order type selection for guests who haven't pre-selected */}
                  {needsOrderType && orderTypes.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="font-display text-sm text-foreground tracking-wider mb-3">Where's your order?</p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {orderTypes.map(ot => (
                          <button
                            key={ot.id}
                            onClick={() => { setSelectedOrderType(ot.type_key); setSelectedLocation(''); }}
                            className={`min-h-[44px] py-2.5 border font-display text-xs tracking-wider transition-colors rounded ${
                              selectedOrderType === ot.type_key
                                ? 'border-gold text-foreground bg-foreground/5'
                                : 'border-border text-cream-dim'
                            }`}
                          >
                            {ot.label}
                          </button>
                        ))}
                      </div>

                      {activeOrderType && activeOrderType.input_mode === 'select' && activeOrderType.source_table && (
                        <Select onValueChange={setSelectedLocation} value={selectedLocation}>
                          <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                            <SelectValue placeholder={activeOrderType.placeholder || 'Select'} />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            {getSelectOptions(activeOrderType.source_table).map(item => (
                              <SelectItem key={item.id} value={item.name} className="text-foreground font-body">
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {activeOrderType && activeOrderType.input_mode === 'text' && (
                        <Input
                          placeholder={activeOrderType.placeholder || 'Enter details'}
                          value={selectedLocation}
                          onChange={(e) => setSelectedLocation(e.target.value)}
                          className="bg-secondary border-border text-foreground font-body"
                        />
                      )}
                    </div>
                  )}

                  {isStaff && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="font-display text-sm text-foreground tracking-wider mb-2">Payment Type</p>
                      <Select onValueChange={setPaymentType} value={paymentType}>
                        <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                          <SelectValue placeholder="Select payment type" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="Charge to Room" className="text-foreground font-body">Charge to Room</SelectItem>
                          <SelectItem value="Cash" className="text-foreground font-body">Cash</SelectItem>
                          <SelectItem value="Card" className="text-foreground font-body">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Scheduled Delivery for Room orders */}
                  {selectedOrderType === 'Room' && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-cream-dim" />
                        <p className="font-display text-sm text-foreground tracking-wider">Scheduled Time</p>
                      </div>
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => setScheduleMode('asap')}
                          className={`flex-1 min-h-[44px] py-2 border font-display text-xs tracking-wider rounded transition-colors ${
                            scheduleMode === 'asap'
                              ? 'border-gold text-gold bg-gold/10'
                              : 'border-border text-cream-dim'
                          }`}
                        >
                          ASAP
                        </button>
                        <button
                          onClick={() => setScheduleMode('scheduled')}
                          className={`flex-1 min-h-[44px] py-2 border font-display text-xs tracking-wider rounded transition-colors ${
                            scheduleMode === 'scheduled'
                              ? 'border-gold text-gold bg-gold/10'
                              : 'border-border text-cream-dim'
                          }`}
                        >
                          Schedule
                        </button>
                      </div>

                      {scheduleMode === 'scheduled' && (
                        <div className="space-y-3">
                          {/* Day toggle */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => setScheduledDay('today')}
                              className={`flex-1 min-h-[44px] py-2 border font-body text-xs rounded transition-colors ${
                                scheduledDay === 'today'
                                  ? 'border-gold text-gold bg-gold/10'
                                  : 'border-border text-cream-dim'
                              }`}
                            >
                              Today
                            </button>
                            <button
                              onClick={() => setScheduledDay('tomorrow')}
                              className={`flex-1 min-h-[44px] py-2 border font-body text-xs rounded transition-colors ${
                                scheduledDay === 'tomorrow'
                                  ? 'border-gold text-gold bg-gold/10'
                                  : 'border-border text-cream-dim'
                              }`}
                            >
                              Tomorrow
                            </button>
                          </div>

                          {/* Time picker */}
                          <div className="flex gap-2">
                            <Select onValueChange={setScheduledHour} value={scheduledHour}>
                              <SelectTrigger className="bg-secondary border-border text-foreground font-body flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                                  <SelectItem key={h} value={String(h)} className="text-foreground font-body">{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select onValueChange={setScheduledMinute} value={scheduledMinute}>
                              <SelectTrigger className="bg-secondary border-border text-foreground font-body w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border">
                                {['00', '15', '30', '45'].map(m => (
                                  <SelectItem key={m} value={m} className="text-foreground font-body">:{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select onValueChange={(v) => setScheduledPeriod(v as 'AM' | 'PM')} value={scheduledPeriod}>
                              <SelectTrigger className="bg-secondary border-border text-foreground font-body w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border">
                                <SelectItem value="AM" className="text-foreground font-body">AM</SelectItem>
                                <SelectItem value="PM" className="text-foreground font-body">PM</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Stock shortage warning */}
            {stockWarning.length > 0 && (
              <div className="mx-4 mt-3 p-3 rounded-lg border border-destructive/40 bg-destructive/10 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="font-display text-xs tracking-wider text-destructive">Insufficient Stock</span>
                </div>
                {stockWarning.map((s, i) => (
                  <p key={i} className="font-body text-xs text-foreground">
                    {s.itemName}: needs {s.needed} {s.unit} of {s.ingredientName} (only {s.available} left)
                  </p>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setOverrideStock(true); setStockWarning([]); }}
                  className="font-display text-xs tracking-wider w-full mt-1"
                >
                  Override & Send Anyway
                </Button>
              </div>
            )}

            {cart.items.length > 0 && (
              <DrawerFooter className="pt-2">
                <Button
                  onClick={handleSendToKitchen}
                  disabled={submitting || needsOrderType}
                  className="font-display tracking-wider py-6 w-full gap-2 text-base"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Sending...' : 'Send to Kitchen'}
                </Button>
                <p className="font-body text-[10px] text-cream-dim text-center mt-1">
                  Order will be added to your open tab
                </p>
              </DrawerFooter>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default CartDrawer;
