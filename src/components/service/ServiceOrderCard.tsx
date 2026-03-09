import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ChefHat, Truck, CreditCard, Clock, Wine, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { canEdit } from '@/lib/permissions';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-muted-foreground',
  preparing: 'bg-orange-400',
  ready: 'bg-emerald-400',
};

interface ServiceOrderCardProps {
  order: any;
  department: 'kitchen' | 'bar' | 'reception';
  permissions: string[];
  onAction?: (orderId: string, action: string) => Promise<void>;
  onOpenDetail?: (order: any) => void;
  compact?: boolean;
}

const ServiceOrderCard = ({ order, department, permissions, onAction, onOpenDetail, compact }: ServiceOrderCardProps) => {
  const [busy, setBusy] = useState(false);
  const items = (order.items as any[]) || [];
  const isNew = order.status === 'New';
  const elapsed = formatDistanceToNow(new Date(order.created_at), { addSuffix: false });

  const foodItems = items.filter((i: any) => { const d = i.department || 'kitchen'; return d === 'kitchen' || d === 'both'; });
  const barItems = items.filter((i: any) => i.department === 'bar' || i.department === 'both');

  // Filter items by department context for display
  const deptItems = department === 'reception' ? items : items.filter((i: any) => {
    const d = i.department || 'kitchen';
    return d === department || d === 'both';
  });

  const handleAction = async (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    if (!onAction || busy) return;
    setBusy(true);
    try { await onAction(order.id, action); } finally { setBusy(false); }
  };

  // Compute primary action for the current department view
  let primaryAction: { label: string; action: string; icon: React.ReactNode } | null = null;

  if (department === 'kitchen' && canEdit(permissions, 'kitchen')) {
    if (order.kitchen_status === 'pending' && foodItems.length > 0) primaryAction = { label: 'Start Preparing', action: 'kitchen-start', icon: <ChefHat className="w-5 h-5" /> };
    else if (order.kitchen_status === 'preparing') primaryAction = { label: 'Mark Ready', action: 'kitchen-ready', icon: <CheckCircle2 className="w-5 h-5" /> };
  } else if (department === 'bar' && canEdit(permissions, 'bar')) {
    if (order.bar_status === 'pending' && barItems.length > 0) primaryAction = { label: 'Start Mixing', action: 'bar-start', icon: <Wine className="w-5 h-5" /> };
    else if (order.bar_status === 'preparing') primaryAction = { label: 'Mark Ready', action: 'bar-ready', icon: <CheckCircle2 className="w-5 h-5" /> };
  } else if (department === 'reception' && canEdit(permissions, 'reception')) {
    const allReady = (foodItems.length === 0 || order.kitchen_status === 'ready') && (barItems.length === 0 || order.bar_status === 'ready');
    if (allReady && order.status !== 'Served' && order.status !== 'Paid') {
      primaryAction = { label: 'Mark Served', action: 'mark-served', icon: <Truck className="w-5 h-5" /> };
    } else if (order.status === 'Served') {
      primaryAction = { label: 'Mark Paid', action: 'mark-paid', icon: <CreditCard className="w-5 h-5" /> };
    }
  }

  // Compute secondary cross-dept actions (shown as small buttons)
  const secondaryActions: { label: string; action: string; icon: React.ReactNode }[] = [];

  if (department !== 'kitchen' && canEdit(permissions, 'kitchen') && foodItems.length > 0) {
    if (order.kitchen_status === 'pending') secondaryActions.push({ label: '🍳 Start', action: 'kitchen-start', icon: <ChefHat className="w-4 h-4" /> });
    else if (order.kitchen_status === 'preparing') secondaryActions.push({ label: '🍳 Ready', action: 'kitchen-ready', icon: <CheckCircle2 className="w-4 h-4" /> });
  }
  if (department !== 'bar' && canEdit(permissions, 'bar') && barItems.length > 0) {
    if (order.bar_status === 'pending') secondaryActions.push({ label: '🍹 Start', action: 'bar-start', icon: <Wine className="w-4 h-4" /> });
    else if (order.bar_status === 'preparing') secondaryActions.push({ label: '🍹 Ready', action: 'bar-ready', icon: <CheckCircle2 className="w-4 h-4" /> });
  }
  if (department !== 'reception' && canEdit(permissions, 'reception')) {
    const allReady = (foodItems.length === 0 || order.kitchen_status === 'ready') && (barItems.length === 0 || order.bar_status === 'ready');
    if (allReady && order.status !== 'Served' && order.status !== 'Paid') {
      secondaryActions.push({ label: 'Served', action: 'mark-served', icon: <Truck className="w-4 h-4" /> });
    } else if (order.status === 'Served') {
      secondaryActions.push({ label: 'Paid', action: 'mark-paid', icon: <CreditCard className="w-4 h-4" /> });
    }
  }

  if (deptItems.length === 0 && department !== 'reception') return null;

  return (
    <div
      onClick={() => onOpenDetail?.(order)}
      className={`rounded-xl border-2 transition-all cursor-pointer active:scale-[0.98] ${
        isNew ? 'border-gold new-order-card bg-gold/5' : 'border-border bg-card'
      } ${compact ? 'p-3' : 'p-4'}`}
    >
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

      {/* Department status dots — always visible */}
      <div className="flex gap-2 mb-2">
        {foodItems.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[order.kitchen_status] || 'bg-muted-foreground'}`} />
            <span className="font-body text-xs text-muted-foreground">🍳 {foodItems.length}</span>
          </div>
        )}
        {barItems.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[order.bar_status] || 'bg-muted-foreground'}`} />
            <span className="font-body text-xs text-muted-foreground">🍹 {barItems.length}</span>
          </div>
        )}
        {order.tab_id && (
          <Badge variant="outline" className="font-body text-[10px] h-5 bg-purple-500/20 text-purple-400 border-purple-400/40">Tab</Badge>
        )}
      </div>

      {/* Items */}
      <div className="space-y-1 mb-3">
        {(department === 'reception' ? items : deptItems).slice(0, compact ? 4 : 8).map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between font-body">
            <span className="text-foreground text-sm">{item.qty}× {item.name}</span>
            <span className="text-muted-foreground text-sm">₱{(item.price * item.qty).toLocaleString()}</span>
          </div>
        ))}
        {(department === 'reception' ? items : deptItems).length > (compact ? 4 : 8) && (
          <p className="font-body text-xs text-muted-foreground">+{(department === 'reception' ? items : deptItems).length - (compact ? 4 : 8)} more…</p>
        )}
      </div>

      {/* Total + Actions */}
      <div className="pt-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg text-gold">₱{order.total.toLocaleString()}</span>
          {primaryAction && onAction && (
            <Button
              onClick={(e) => handleAction(e, primaryAction!.action)}
              disabled={busy}
              size="lg"
              className={`font-display tracking-wider gap-2 text-sm min-h-[52px] px-6 ${
                isNew ? 'bg-gold text-primary-foreground hover:bg-gold/90 new-order-btn' : ''
              }`}
            >
              {busy ? 'Updating…' : <>{primaryAction.icon} {primaryAction.label}</>}
            </Button>
          )}
        </div>

        {/* Secondary cross-dept actions */}
        {secondaryActions.length > 0 && onAction && (
          <div className="flex gap-2 flex-wrap">
            {secondaryActions.map(a => (
              <Button
                key={a.action}
                variant="outline"
                size="sm"
                onClick={(e) => handleAction(e, a.action)}
                disabled={busy}
                className="font-body text-xs gap-1 min-h-[36px]"
              >
                {a.icon} {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceOrderCard;
