import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ChefHat, Truck, CreditCard, Clock, AlertTriangle, Wine } from 'lucide-react';
import { useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-gold/20 text-gold border-gold/40',
  Preparing: 'bg-orange-500/20 text-orange-400 border-orange-400/40',
  Ready: 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40',
  Served: 'bg-[hsl(210,70%,50%)]/20 text-[hsl(210,70%,60%)] border-[hsl(210,70%,50%)]/40',
  Paid: 'bg-muted text-muted-foreground border-border',
};

interface ServiceOrderCardProps {
  order: any;
  department: 'kitchen' | 'bar' | 'reception';
  onAction?: (orderId: string, action: string) => Promise<void>;
  compact?: boolean;
}

const ServiceOrderCard = ({ order, department, onAction, compact }: ServiceOrderCardProps) => {
  const [busy, setBusy] = useState(false);
  const items = (order.items as any[]) || [];
  const isNew = order.status === 'New';
  const elapsed = formatDistanceToNow(new Date(order.created_at), { addSuffix: false });

  // Filter items by department context
  const deptItems = department === 'reception' ? items : items.filter((i: any) => {
    const d = i.department || 'kitchen';
    return d === department || d === 'both';
  });

  const deptStatus = department === 'kitchen' ? order.kitchen_status : department === 'bar' ? order.bar_status : order.status;

  const handleAction = async (action: string) => {
    if (!onAction || busy) return;
    setBusy(true);
    try { await onAction(order.id, action); } finally { setBusy(false); }
  };

  // Determine available action
  let actionBtn: { label: string; action: string; icon: React.ReactNode; variant?: string } | null = null;
  if (department === 'kitchen') {
    if (order.kitchen_status === 'pending') actionBtn = { label: 'Start Preparing', action: 'kitchen-start', icon: <ChefHat className="w-5 h-5" /> };
    else if (order.kitchen_status === 'preparing') actionBtn = { label: 'Mark Ready', action: 'kitchen-ready', icon: <Truck className="w-5 h-5" /> };
  } else if (department === 'bar') {
    if (order.bar_status === 'pending') actionBtn = { label: 'Start Mixing', action: 'bar-start', icon: <Wine className="w-5 h-5" /> };
    else if (order.bar_status === 'preparing') actionBtn = { label: 'Mark Ready', action: 'bar-ready', icon: <Truck className="w-5 h-5" /> };
  } else if (department === 'reception') {
    if (order.status === 'Preparing' || order.status === 'New') {
      // Show ready indicators only
    }
    if (order.kitchen_status === 'ready' && order.bar_status === 'ready' && order.status !== 'Served' && order.status !== 'Paid') {
      actionBtn = { label: 'Mark Served', action: 'mark-served', icon: <Truck className="w-5 h-5" /> };
    } else if (order.status === 'Served') {
      actionBtn = { label: 'Mark Paid', action: 'mark-paid', icon: <CreditCard className="w-5 h-5" /> };
    }
  }

  if (deptItems.length === 0 && department !== 'reception') return null;

  return (
    <div className={`rounded-xl border-2 transition-all ${
      isNew ? 'border-gold new-order-card bg-gold/5' : 'border-border bg-card'
    } ${compact ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-display text-base text-foreground tracking-wider">
            {order.order_type === 'Room' ? `🏠 ${order.location_detail}` : 
             order.order_type === 'DineIn' ? `🍽️ ${order.location_detail}` :
             `📋 ${order.location_detail || order.order_type}`}
          </p>
          {order.guest_name && (
            <p className="font-body text-sm text-muted-foreground">{order.guest_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-body text-xs">{elapsed}</span>
          </div>
        </div>
      </div>

      {/* Department status badges for reception */}
      {department === 'reception' && (
        <div className="flex gap-1.5 mb-2">
          {items.some((i: any) => (i.department || 'kitchen') === 'kitchen' || (i.department || 'kitchen') === 'both') && (
            <Badge variant="outline" className={`font-body text-xs ${
              order.kitchen_status === 'ready' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40' :
              order.kitchen_status === 'preparing' ? 'bg-orange-500/20 text-orange-400 border-orange-400/40' :
              'bg-gold/20 text-gold border-gold/40'
            }`}>
              🍳 {order.kitchen_status === 'ready' ? 'Ready' : order.kitchen_status === 'preparing' ? 'Cooking' : 'Waiting'}
            </Badge>
          )}
          {items.some((i: any) => i.department === 'bar' || i.department === 'both') && (
            <Badge variant="outline" className={`font-body text-xs ${
              order.bar_status === 'ready' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40' :
              order.bar_status === 'preparing' ? 'bg-orange-500/20 text-orange-400 border-orange-400/40' :
              'bg-gold/20 text-gold border-gold/40'
            }`}>
              🍹 {order.bar_status === 'ready' ? 'Ready' : order.bar_status === 'preparing' ? 'Mixing' : 'Waiting'}
            </Badge>
          )}
        </div>
      )}

      {/* Items */}
      <div className="space-y-1 mb-3">
        {(department === 'reception' ? items : deptItems).map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between font-body">
            <span className="text-foreground text-sm">{item.qty}× {item.name}</span>
            <span className="text-muted-foreground text-sm">₱{(item.price * item.qty).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Tab badge */}
      {order.tab_id && (
        <Badge variant="outline" className="font-body text-xs bg-purple-500/20 text-purple-400 border-purple-400/40 mb-2">
          Tab
        </Badge>
      )}

      {/* Total + Action */}
      <div className="pt-3 border-t border-border flex items-center justify-between">
        <span className="font-display text-lg text-gold">₱{order.total.toLocaleString()}</span>
        {actionBtn && onAction && (
          <Button
            onClick={() => handleAction(actionBtn!.action)}
            disabled={busy}
            size="lg"
            className={`font-display tracking-wider gap-2 text-sm min-h-[52px] px-6 ${
              isNew ? 'bg-gold text-primary-foreground hover:bg-gold/90 new-order-btn' : ''
            }`}
          >
            {busy ? 'Updating…' : <>{actionBtn.icon} {actionBtn.label}</>}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ServiceOrderCard;
