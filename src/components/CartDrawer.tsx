import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/lib/cart';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Trash2, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: string;
  orderType: string;
  locationDetail: string;
}

const TYPE_LABELS: Record<string, string> = {
  Room: 'Room Delivery',
  DineIn: 'Dine In',
  Beach: 'Beach Delivery',
  WalkIn: 'Walk-In Guest',
};

const CartDrawer = ({ open, onOpenChange, mode, orderType, locationDetail }: CartDrawerProps) => {
  const cart = useCart();
  const [paymentType, setPaymentType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [orderSummary, setOrderSummary] = useState({ itemCount: 0, grandTotal: 0 });

  const isStaff = mode === 'staff';
  const subtotal = cart.total();
  const serviceCharge = Math.round(subtotal * 0.10);
  const grandTotal = subtotal + serviceCharge;

  const handleClose = (open: boolean) => {
    if (!open) setSubmitted(false);
    onOpenChange(open);
  };

  const handleSendToKitchen = async () => {
    if (isStaff && !paymentType) {
      toast.error('Please select a payment type');
      return;
    }

    setSubmitting(true);
    try {
      const { data: existingTabs } = await supabase
        .from('tabs')
        .select('*')
        .eq('location_type', orderType)
        .eq('location_detail', locationDetail)
        .eq('status', 'Open')
        .limit(1);

      let tabId: string;

      if (existingTabs && existingTabs.length > 0) {
        tabId = existingTabs[0].id;
      } else {
        const { data: newTab, error: tabError } = await supabase
          .from('tabs')
          .insert({
            location_type: orderType,
            location_detail: locationDetail,
            status: 'Open',
          })
          .select('id')
          .single();

        if (tabError || !newTab) throw new Error('Failed to create tab');
        tabId = newTab.id;
      }

      await supabase.from('orders').insert({
        order_type: orderType,
        location_detail: locationDetail,
        items: cart.items.map(i => ({ name: i.name, qty: i.quantity, price: i.price })),
        total: subtotal,
        service_charge: serviceCharge,
        payment_type: isStaff ? paymentType : '',
        status: 'New',
        tab_id: tabId,
      });

      setOrderSummary({ itemCount: cart.count(), grandTotal });
      cart.clearCart();
      setSubmitted(true);
      toast.success('Order sent to kitchen!');
    } catch {
      toast.error('Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="bg-card border-border max-h-[90vh]">
        {submitted ? (
          /* Confirmation View */
          <>
            <div className="flex flex-col items-center justify-center py-12 px-6 gap-4">
              <CheckCircle2 className="w-16 h-16 text-green-400 animate-fade-in" />
              <h2 className="font-display text-2xl tracking-wider text-foreground">Order Sent to Kitchen!</h2>
              <div className="flex gap-2">
                <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
                  {TYPE_LABELS[orderType] || orderType}
                </span>
                <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
                  {locationDetail}
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
              <p className="font-display text-xs tracking-[0.3em] text-cream-dim uppercase">Baia Palawan</p>
              <DrawerTitle className="font-display text-lg text-foreground tracking-wider">
                Order Invoice
              </DrawerTitle>
              <div className="flex justify-center gap-2 mt-1">
                <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
                  {TYPE_LABELS[orderType] || orderType}
                </span>
                <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
                  {locationDetail}
                </span>
              </div>
            </DrawerHeader>

            <div className="px-4 overflow-y-auto flex-1">
              {cart.items.length === 0 ? (
                <p className="font-body text-cream-dim text-center py-8">Your order is empty</p>
              ) : (
                <>
                  <div className="flex items-center text-cream-dim font-body text-[10px] uppercase tracking-wider pb-1 border-b border-border mb-2">
                    <span className="flex-1">Item</span>
                    <span className="w-8 text-center">Qty</span>
                    <span className="w-16 text-right">Price</span>
                    <span className="w-20 text-right">Total</span>
                    <span className="w-10" />
                  </div>

                  <div className="flex flex-col gap-2">
                    {cart.items.map(item => (
                      <div key={item.id} className="flex items-center">
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-sm text-foreground truncate">{item.name}</p>
                        </div>
                        <div className="flex items-center gap-1 w-8 justify-center">
                          <button onClick={() => cart.updateQuantity(item.id, item.quantity - 1)} className="text-cream-dim hover:text-foreground">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-body text-xs text-foreground w-4 text-center">{item.quantity}</span>
                          <button onClick={() => cart.updateQuantity(item.id, item.quantity + 1)} className="text-cream-dim hover:text-foreground">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-body text-xs text-cream-dim w-16 text-right">
                          ₱{item.price.toLocaleString()}
                        </span>
                        <span className="font-display text-sm text-foreground w-20 text-right">
                          ₱{(item.price * item.quantity).toLocaleString()}
                        </span>
                        <button onClick={() => cart.removeItem(item.id)} className="text-cream-dim hover:text-destructive w-10 flex justify-end">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                      <span className="text-foreground">Grand Total</span>
                      <span className="text-foreground">₱{grandTotal.toLocaleString()}</span>
                    </div>
                  </div>

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
                </>
              )}
            </div>

            {cart.items.length > 0 && (
              <DrawerFooter className="pt-2">
                <Button onClick={handleSendToKitchen} disabled={submitting} className="font-display tracking-wider py-6 w-full gap-2">
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
