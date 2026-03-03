import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle, Clock, ClipboardCheck, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, differenceInMinutes } from 'date-fns';
import PasswordConfirmModal from '@/components/housekeeping/PasswordConfirmModal';
import HousekeepingInspection from '@/components/admin/HousekeepingInspection';

const from = (table: string) => supabase.from(table as any);

const HousekeeperPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);

  const empId = localStorage.getItem('emp_id');
  const empName = localStorage.getItem('emp_name') || 'Housekeeper';

  // All housekeeping orders
  const { data: allOrders = [] } = useQuery({
    queryKey: ['housekeeping-orders-all'],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders').select('*').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 15000,
  });

  // Pending (unassigned)
  const pendingOrders = allOrders.filter((o: any) => !o.accepted_by && o.status !== 'completed');

  // My in-progress
  const myInProgress = allOrders.filter((o: any) => o.accepted_by === empId && o.status !== 'completed');

  // My completed today
  const today = new Date().toISOString().split('T')[0];
  const myCompletedToday = allOrders.filter((o: any) =>
    o.accepted_by === empId &&
    o.status === 'completed' &&
    o.cleaning_completed_at?.startsWith(today)
  );

  // Sync activeOrder with latest query data so props stay current
  useEffect(() => {
    if (activeOrder) {
      const fresh = allOrders.find((o: any) => o.id === activeOrder.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(activeOrder)) {
        setActiveOrder(fresh);
      }
    }
  }, [allOrders, activeOrder]);

  // My stats this month
  const monthStart = startOfMonth(new Date()).toISOString();
  const myCompletedMonth = allOrders.filter((o: any) =>
    o.accepted_by === empId &&
    o.status === 'completed' &&
    o.cleaning_completed_at >= monthStart
  );
  const avgTime = myCompletedMonth.length > 0
    ? Math.round(myCompletedMonth.reduce((sum: number, o: any) => sum + (o.time_to_complete_minutes || 0), 0) / myCompletedMonth.length)
    : 0;

  const handleAccept = async (employee: { id: string; name: string; display_name: string }) => {
    if (!acceptingOrderId) return;
    try {
      await from('housekeeping_orders').update({
        accepted_by: employee.id,
        accepted_by_name: employee.display_name || employee.name,
        accepted_at: new Date().toISOString(),
        status: 'pending_inspection',
      } as any).eq('id', acceptingOrderId);

      // Update emp_id/emp_name in localStorage for this session
      localStorage.setItem('emp_id', employee.id);
      localStorage.setItem('emp_name', employee.name);

      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      toast.success(`Accepted — ${employee.display_name || employee.name}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept');
    }
    setAcceptingOrderId(null);
  };

  const priorityColor = (p: string) => {
    if (p === 'urgent') return 'bg-destructive text-destructive-foreground';
    if (p === 'high') return 'bg-amber-600 text-white';
    return 'bg-muted text-muted-foreground';
  };

  if (activeOrder) {
    return (
      <HousekeepingInspection
        order={activeOrder}
        onClose={() => {
          setActiveOrder(null);
          qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl tracking-wider text-foreground">🏨 Housekeeping</h1>
          <p className="font-body text-xs text-muted-foreground">Welcome, {empName}</p>
        </div>
      </div>

      {/* New Assignments */}
      <section className="mb-6">
        <h2 className="font-display text-sm tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" /> New Assignments ({pendingOrders.length})
        </h2>
        {pendingOrders.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">No pending assignments</p>
        ) : (
          <div className="space-y-2">
            {pendingOrders.map((order: any) => (
              <div key={order.id} className="border border-border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-base tracking-wider text-foreground">{order.unit_name}</span>
                  <Badge className={priorityColor(order.priority || 'normal')} variant="secondary">
                    {order.priority || 'normal'}
                  </Badge>
                </div>
                <p className="font-body text-xs text-muted-foreground mb-3">
                  Created: {format(new Date(order.created_at), 'h:mm a')}
                </p>
                <Button
                  onClick={() => setAcceptingOrderId(order.id)}
                  className="w-full font-display tracking-wider min-h-[44px]"
                >
                  Accept with PIN
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* In Progress */}
      <section className="mb-6">
        <h2 className="font-display text-sm tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" /> In Progress ({myInProgress.length})
        </h2>
        {myInProgress.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">No rooms in progress</p>
        ) : (
          <div className="space-y-2">
            {myInProgress.map((order: any) => (
              <div key={order.id} className="border border-border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-base tracking-wider text-foreground">{order.unit_name}</span>
                  <Badge variant="outline" className="font-body text-xs">
                    {order.status === 'cleaning' ? 'Cleaning' : 'Inspection'}
                  </Badge>
                </div>
                {order.accepted_at && (
                  <p className="font-body text-xs text-muted-foreground mb-3">
                    Accepted: {format(new Date(order.accepted_at), 'h:mm a')}
                  </p>
                )}
                <Button
                  onClick={() => setActiveOrder(order)}
                  variant="outline"
                  className="w-full font-display tracking-wider min-h-[44px]"
                >
                  Continue →
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Completed Today */}
      <section className="mb-6">
        <h2 className="font-display text-sm tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Completed Today ({myCompletedToday.length})
        </h2>
        {myCompletedToday.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">No rooms completed today</p>
        ) : (
          <div className="space-y-1">
            {myCompletedToday.map((order: any) => (
              <div key={order.id} className="flex items-center gap-3 p-2 border border-border rounded bg-card">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="font-body text-sm text-foreground flex-1">{order.unit_name}</span>
                <span className="font-body text-xs text-muted-foreground">
                  {order.cleaning_completed_at && format(new Date(order.cleaning_completed_at), 'h:mm a')}
                </span>
                {order.time_to_complete_minutes && (
                  <span className="font-body text-xs text-muted-foreground">{order.time_to_complete_minutes}min</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My Stats */}
      <section>
        <h2 className="font-display text-sm tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> My Stats
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-border rounded-lg p-4 bg-card text-center">
            <p className="font-display text-2xl text-foreground">{myCompletedMonth.length}</p>
            <p className="font-body text-xs text-muted-foreground">Rooms this month</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card text-center">
            <p className="font-display text-2xl text-foreground">{avgTime || '—'}</p>
            <p className="font-body text-xs text-muted-foreground">Avg min/room</p>
          </div>
        </div>
      </section>

      {/* PIN Modal */}
      <PasswordConfirmModal
        open={!!acceptingOrderId}
        onClose={() => setAcceptingOrderId(null)}
        onConfirm={handleAccept}
        title="Accept Assignment"
        description="Enter your name and PIN to accept this housekeeping assignment."
      />
    </div>
  );
};

export default HousekeeperPage;
