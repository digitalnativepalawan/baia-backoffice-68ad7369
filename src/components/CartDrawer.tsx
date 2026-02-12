import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/lib/cart';
import { formatWhatsAppMessage, buildWhatsAppUrl, OrderInfo } from '@/lib/order';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: string;
  orderType: string;
  locationDetail: string;
}

const CartDrawer = ({ open, onOpenChange, mode, orderType, locationDetail }: CartDrawerProps) => {
  const cart = useCart();
  const [paymentType, setPaymentType] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').limit(1).single();
      return data;
    },
  });

  const isStaff = mode === 'staff';
  const total = cart.total();

  const handleConfirm = async () => {
    if (isStaff && !paymentType) {
      toast.error('Please select a payment type');
      return;
    }
    if (!settings?.kitchen_whatsapp_number) {
      toast.error('Kitchen WhatsApp number not configured. Please contact admin.');
      return;
    }

    setSubmitting(true);
    try {
      const orderInfo: OrderInfo = {
        orderType: orderType as OrderInfo['orderType'],
        locationDetail,
        isStaff,
        paymentType: isStaff ? paymentType : undefined,
      };

      // Save to database
      await supabase.from('orders').insert({
        order_type: orderType,
        location_detail: locationDetail,
        items: cart.items.map(i => ({ name: i.name, qty: i.quantity, price: i.price })),
        total,
        payment_type: isStaff ? paymentType : '',
        status: 'New',
      });

      // Generate WhatsApp message and redirect
      const message = formatWhatsAppMessage(orderInfo, cart.items, total);
      const url = buildWhatsAppUrl(settings.kitchen_whatsapp_number, message);

      cart.clearCart();
      onOpenChange(false);
      window.open(url, '_blank');
      toast.success('Order sent!');
    } catch {
      toast.error('Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-card border-border max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="font-display text-foreground tracking-wider text-center">
            Your Order
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 overflow-y-auto flex-1">
          {cart.items.length === 0 ? (
            <p className="font-body text-cream-dim text-center py-8">Your order is empty</p>
          ) : (
            <div className="flex flex-col gap-4">
              {cart.items.map(item => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-display text-sm text-foreground">{item.name}</p>
                    <p className="font-body text-xs text-cream-dim">₱{item.price.toLocaleString()} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => cart.updateQuantity(item.id, item.quantity - 1)} className="text-cream-dim hover:text-foreground">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-body text-sm text-foreground w-5 text-center">{item.quantity}</span>
                    <button onClick={() => cart.updateQuantity(item.id, item.quantity + 1)} className="text-cream-dim hover:text-foreground">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => cart.removeItem(item.id)} className="text-cream-dim hover:text-destructive ml-2">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="font-display text-sm text-foreground w-20 text-right">
                    ₱{(item.price * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Staff payment type */}
          {isStaff && cart.items.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <p className="font-display text-sm text-foreground tracking-wider mb-3">Payment Type</p>
              <Select onValueChange={setPaymentType} value={paymentType}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Charge to Room" className="text-foreground font-body">Charge to Room</SelectItem>
                  <SelectItem value="Cash" className="text-foreground font-body">Cash</SelectItem>
                  <SelectItem value="Paid" className="text-foreground font-body">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {cart.items.length > 0 && (
          <DrawerFooter>
            <div className="flex justify-between items-center mb-3">
              <span className="font-display text-lg text-foreground tracking-wider">Total</span>
              <span className="font-display text-xl text-foreground">₱{total.toLocaleString()}</span>
            </div>
            <Button onClick={handleConfirm} disabled={submitting} className="font-display tracking-wider py-6 w-full">
              {submitting ? 'Sending...' : 'Confirm Order'}
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default CartDrawer;
