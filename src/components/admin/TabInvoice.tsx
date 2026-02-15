import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResortProfile } from '@/hooks/useResortProfile';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, X, Plus, Minus, ShoppingCart, Download, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { generateInvoicePdf, buildInvoiceWhatsAppText } from '@/lib/generateInvoicePdf';

interface TabInvoiceProps {
  tabId: string;
  onClose: () => void;
}

interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

interface CartEntry {
  id: string;
  name: string;
  price: number;
  qty: number;
}

const TYPE_LABELS: Record<string, string> = {
  Room: 'Room Delivery',
  DineIn: 'Dine In',
  Beach: 'Beach Delivery',
  WalkIn: 'Walk-In Guest',
};

const TabInvoice = ({ tabId, onClose }: TabInvoiceProps) => {
  const qc = useQueryClient();
  const { data: profile } = useResortProfile();
  const brandName = profile?.resort_name || 'Resort';
  const [paymentMethod, setPaymentMethod] = useState('');
  const [closing, setClosing] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: tab } = useQuery({
    queryKey: ['tab', tabId],
    queryFn: async () => {
      const { data } = await supabase.from('tabs').select('*').eq('id', tabId).single();
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['tab-orders', tabId],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('tab_id', tabId)
        .order('created_at', { ascending: true });
      return data || [];
    },
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-items-available'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .eq('available', true)
        .order('category')
        .order('sort_order');
      return data || [];
    },
    enabled: addingItems,
  });

  const { data: menuCategories = [] } = useQuery({
    queryKey: ['menu-categories-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_categories')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      return data || [];
    },
    enabled: addingItems,
  });

  const groupedMenu = useMemo(() => {
    const groups: Record<string, typeof menuItems> = {};
    menuItems.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    // Sort by category sort_order
    const catOrder = menuCategories.reduce((acc: Record<string, number>, c: any) => {
      acc[c.name] = c.sort_order;
      return acc;
    }, {});
    return Object.entries(groups).sort(([a], [b]) => (catOrder[a] || 0) - (catOrder[b] || 0));
  }, [menuItems, menuCategories]);

  if (!tab) return null;

  const subtotal = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalServiceCharge = orders.reduce((s, o) => s + Number(o.service_charge || 0), 0);
  const grandTotal = subtotal + totalServiceCharge;

  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartServiceCharge = Math.round(cartTotal * 0.1);

  const updateCart = (item: { id: string; name: string; price: number }, delta: number) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        const newQty = existing.qty + delta;
        if (newQty <= 0) return prev.filter(c => c.id !== item.id);
        return prev.map(c => c.id === item.id ? { ...c, qty: newQty } : c);
      }
      if (delta > 0) return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
      return prev;
    });
  };

  const getCartQty = (id: string) => cart.find(c => c.id === id)?.qty || 0;

  const submitOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.map(c => ({ name: c.name, price: c.price, qty: c.qty }));
      const total = cartTotal;
      const serviceCharge = cartServiceCharge;

      await supabase.from('orders').insert({
        tab_id: tabId,
        order_type: tab.location_type,
        location_detail: tab.location_detail,
        items,
        total,
        service_charge: serviceCharge,
        status: 'New',
      });

      setCart([]);
      setAddingItems(false);
      qc.invalidateQueries({ queryKey: ['tab-orders', tabId] });
      qc.invalidateQueries({ queryKey: ['orders-admin'] });
      qc.invalidateQueries({ queryKey: ['orders-staff'] });
      toast.success('Order added to tab');
    } catch {
      toast.error('Failed to add order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseTab = async () => {
    if (!paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }
    setClosing(true);
    try {
      await supabase.from('tabs').update({
        status: 'Closed',
        payment_method: paymentMethod,
        closed_at: new Date().toISOString(),
      }).eq('id', tabId);

      const orderIds = orders.map(o => o.id);
      if (orderIds.length > 0) {
        await supabase.from('orders').update({
          status: 'Closed',
          closed_at: new Date().toISOString(),
        }).in('id', orderIds);
      }

      qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      qc.invalidateQueries({ queryKey: ['orders-admin'] });
      toast.success('Tab closed and settled');
      onClose();
    } catch {
      toast.error('Failed to close tab');
    } finally {
      setClosing(false);
    }
  };

  // Build a combined order for PDF/WhatsApp (all items across all orders)
  const combinedOrder = {
    id: tabId,
    order_type: tab.location_type,
    location_detail: tab.location_detail,
    items: orders.flatMap(o => (Array.isArray(o.items) ? o.items : []) as unknown as OrderItem[]),
    total: grandTotal - totalServiceCharge,
    service_charge: totalServiceCharge,
    payment_type: tab.payment_method,
    created_at: tab.created_at,
  };

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button onClick={onClose} className="flex items-center gap-2 text-cream-dim hover:text-foreground font-body text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Tabs
      </button>

      {/* Invoice header */}
      <div className="text-center py-3 border border-border rounded-lg bg-secondary/30">
        {profile?.logo_url && (
          <img src={profile.logo_url} alt={brandName} className="w-12 h-12 object-contain mx-auto mb-1" />
        )}
        <p className="font-display text-xs tracking-[0.3em] text-cream-dim uppercase">{brandName}</p>
        <p className="font-display text-lg text-foreground tracking-wider mt-1">Tab Invoice</p>
        <div className="flex justify-center gap-2 mt-2">
          <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
            {TYPE_LABELS[tab.location_type] || tab.location_type}
          </span>
          <span className="font-body text-xs bg-secondary px-2 py-0.5 rounded text-cream-dim">
            {tab.location_detail}
          </span>
        </div>
        {tab.guest_name && (
          <p className="font-body text-sm text-foreground mt-1">{tab.guest_name}</p>
        )}
        <p className="font-body text-[10px] text-cream-dim mt-1">
          Opened: {format(new Date(tab.created_at), 'MMM d, yyyy h:mm a')}
        </p>
        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-display tracking-wider ${
          tab.status === 'Open' ? 'bg-green-900/50 text-green-300' : 'bg-muted text-cream-dim'
        }`}>
          {tab.status}
        </span>
      </div>

      {/* Add Items button (only for open tabs) */}
      {tab.status === 'Open' && !addingItems && (
        <Button onClick={() => setAddingItems(true)} variant="outline" className="w-full font-display tracking-wider gap-2 min-h-[44px]">
          <Plus className="w-4 h-4" /> Add Items to Tab
        </Button>
      )}

      {/* Add Items panel */}
      {addingItems && (
        <div className="border border-gold/40 rounded-lg p-3 space-y-3 bg-gold/5">
          <div className="flex justify-between items-center">
            <p className="font-display text-sm tracking-wider text-gold">Add Items</p>
            <button onClick={() => { setAddingItems(false); setCart([]); }} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Menu items grouped by category */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {groupedMenu.map(([category, items]) => (
              <div key={category}>
                <p className="font-display text-xs tracking-wider text-cream-dim uppercase mb-1">{category}</p>
                <div className="space-y-1">
                  {items.map(item => {
                    const qty = getCartQty(item.id);
                    return (
                      <div key={item.id} className="flex items-center justify-between py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-foreground truncate">{item.name}</p>
                          <p className="font-body text-xs text-cream-dim">₱{item.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {qty > 0 && (
                            <>
                              <button onClick={() => updateCart(item, -1)}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md bg-secondary text-foreground hover:bg-destructive/20">
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-display text-sm text-foreground w-6 text-center">{qty}</span>
                            </>
                          )}
                          <button onClick={() => updateCart(item, 1)}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md bg-secondary text-foreground hover:bg-gold/20">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Cart summary + submit */}
          {cart.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              {cart.map(c => (
                <div key={c.id} className="flex justify-between font-body text-sm">
                  <span className="text-foreground">{c.qty}× {c.name}</span>
                  <span className="text-cream-dim">₱{(c.price * c.qty).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-body text-xs text-cream-dim">
                <span>Subtotal: ₱{cartTotal.toLocaleString()}</span>
                <span>SC: ₱{cartServiceCharge.toLocaleString()}</span>
              </div>
              <Button onClick={submitOrder} disabled={submitting} className="w-full font-display tracking-wider gap-2 min-h-[44px]">
                <ShoppingCart className="w-4 h-4" />
                {submitting ? 'Adding...' : `Add Order — ₱${(cartTotal + cartServiceCharge).toLocaleString()}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Orders grouped */}
      {orders.map((order, idx) => {
        const items = (Array.isArray(order.items) ? order.items : []) as unknown as OrderItem[];
        return (
          <div key={order.id} className="border border-border rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-display text-xs text-cream-dim tracking-wider">
                Order #{idx + 1}
              </span>
              <span className="font-body text-[10px] text-cream-dim">
                {format(new Date(order.created_at), 'MMM d, h:mm a')}
              </span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex justify-between font-body text-sm py-0.5">
                <span className="text-foreground">{item.qty}x {item.name}</span>
                <span className="text-foreground">₱{(item.price * item.qty).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-body text-xs text-cream-dim mt-1 pt-1 border-t border-border/50">
              <span>Subtotal: ₱{Number(order.total).toLocaleString()}</span>
              <span>SC: ₱{Number(order.service_charge || 0).toLocaleString()}</span>
            </div>
          </div>
        );
      })}

      {/* Grand totals */}
      <div className="border border-border rounded-lg p-3 bg-secondary/30">
        <div className="flex justify-between font-body text-sm mb-1">
          <span className="text-cream-dim">Total Food & Drinks</span>
          <span className="text-foreground">₱{subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-body text-sm mb-2">
          <span className="text-cream-dim">Total Service Charge (10%)</span>
          <span className="text-foreground">₱{totalServiceCharge.toLocaleString()}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-display text-xl tracking-wider mt-2">
          <span className="text-foreground">Grand Total</span>
          <span className="text-foreground">₱{grandTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* Invoice download/share (when orders exist) */}
      {orders.length > 0 && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 font-body text-xs gap-1.5 min-h-[44px]"
            onClick={async () => {
              try {
                await generateInvoicePdf(combinedOrder, profile ?? null);
                toast.success('Invoice downloaded');
              } catch { toast.error('Failed to generate invoice'); }
            }}>
            <Download className="w-4 h-4" /> Download Invoice
          </Button>
          <Button variant="outline" className="flex-1 font-body text-xs gap-1.5 min-h-[44px]"
            onClick={() => {
              const text = buildInvoiceWhatsAppText(combinedOrder, profile ?? null);
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            }}>
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </Button>
        </div>
      )}

      {/* Close tab (only if open) */}
      {tab.status === 'Open' && (
        <div className="space-y-3 pt-2">
          <Select onValueChange={setPaymentMethod} value={paymentMethod}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body">
              <SelectValue placeholder="Select payment method" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="Cash" className="text-foreground font-body">Cash</SelectItem>
              <SelectItem value="Card" className="text-foreground font-body">Card</SelectItem>
              <SelectItem value="Charge to Room" className="text-foreground font-body">Charge to Room</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCloseTab} disabled={closing} className="font-display tracking-wider w-full py-5" variant="default">
            <X className="w-4 h-4 mr-2" />
            {closing ? 'Closing...' : 'Close Tab & Settle'}
          </Button>
        </div>
      )}

      {tab.status === 'Closed' && tab.payment_method && (
        <div className="text-center py-2">
          <p className="font-body text-sm text-cream-dim">
            Settled via <span className="text-foreground font-display">{tab.payment_method}</span>
          </p>
          {tab.closed_at && (
            <p className="font-body text-[10px] text-cream-dim">
              {format(new Date(tab.closed_at), 'MMM d, yyyy h:mm a')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TabInvoice;
