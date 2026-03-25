import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Home, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface OrderItem {
  name: string;
  qty: number;
  price: number;
  department?: string;
}

interface RoomCharge {
  room_id: string;
  room_name: string;
  guest_name: string;
  orders: any[];
  items: OrderItem[];
  total: number;
  oldestCreatedAt: string;
}

const PendingCharges = () => {
  const { data: pendingCharges = [], isLoading, refetch } = useQuery({
    queryKey: ['reception-pending-charges'],
    queryFn: async () => {
      // Get orders ready for billing
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('ready_for_billing', true)
        .order('created_at', { ascending: false });
      
      if (!orders || orders.length === 0) return [];
      
      // Group by room_id
      const groupedByRoom = new Map<string, RoomCharge>();
      
      for (const order of orders) {
        if (!order.room_id) continue;
        
        // Get room name
        const { data: room } = await supabase
          .from('resort_ops_units')
          .select('name')
          .eq('id', order.room_id)
          .single();
        
        const roomName = room?.name || 'Unknown Room';
        const items = order.items as OrderItem[] || [];
        
        if (groupedByRoom.has(order.room_id)) {
          const existing = groupedByRoom.get(order.room_id)!;
          existing.items.push(...items);
          existing.total += order.total;
          existing.orders.push(order);
          if (order.created_at < existing.oldestCreatedAt) {
            existing.oldestCreatedAt = order.created_at;
          }
        } else {
          groupedByRoom.set(order.room_id, {
            room_id: order.room_id,
            room_name: roomName,
            guest_name: order.guest_name || 'Guest',
            items: [...items],
            total: order.total,
            orders: [order],
            oldestCreatedAt: order.created_at,
          });
        }
      }
      
      return Array.from(groupedByRoom.values());
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading pending charges...
      </div>
    );
  }

  if (pendingCharges.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No pending room charges
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 border border-border rounded-lg bg-card/50">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-wider text-foreground">
          Pending Room Charges ({pendingCharges.length} unit{pendingCharges.length !== 1 ? 's' : ''})
        </h3>
        <button 
          onClick={() => refetch()} 
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      
      {pendingCharges.map((room) => {
        const elapsed = formatDistanceToNow(new Date(room.oldestCreatedAt), { addSuffix: true });
        
        return (
          <Card key={room.room_id} className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  {room.room_name}
                </span>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                  Pending
                </Badge>
              </CardTitle>
              <div className="flex items-center justify-between">
                <p className="font-body text-xs text-muted-foreground">{room.guest_name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{elapsed}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                {room.items.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-foreground">{item.qty}× {item.name}</span>
                    <span className="text-muted-foreground">₱{(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
                {room.items.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    +{room.items.length - 5} more items
                  </p>
                )}
              </div>
              
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-display text-sm text-gold">
                  Total: ₱{room.total.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PendingCharges;
