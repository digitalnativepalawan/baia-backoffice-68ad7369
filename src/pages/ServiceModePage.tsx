import { useNavigate } from 'react-router-dom';
import { Flame, GlassWater, BellRing, Banknote, ArrowLeft, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import { getStaffSession } from '@/lib/session';
import { getHomeRoute } from '@/lib/getHomeRoute';

const departments = [
  {
    key: 'kitchen',
    label: 'Kitchen',
    subtitle: 'Food preparation board',
    icon: <Flame className="w-7 h-7" />,
    gradient: 'from-[hsl(25,85%,55%)] to-[hsl(15,80%,45%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(25,85%,55%,0.3)]',
    route: '/service/kitchen',
    statusField: 'kitchen_status',
  },
  {
    key: 'bar',
    label: 'Bar',
    subtitle: 'Drink preparation board',
    icon: <GlassWater className="w-7 h-7" />,
    gradient: 'from-[hsl(270,60%,55%)] to-[hsl(280,55%,42%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(270,60%,55%,0.3)]',
    route: '/service/bar',
    statusField: 'bar_status',
  },
  {
    key: 'reception',
    label: 'Reception',
    subtitle: 'Service coordination & billing',
    icon: <BellRing className="w-7 h-7" />,
    gradient: 'from-[hsl(210,70%,50%)] to-[hsl(220,65%,40%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(210,70%,50%,0.3)]',
    route: '/service/reception',
    statusField: null,
  },
  {
    key: 'cashier',
    label: 'Cashier',
    subtitle: 'Fast checkout & payment',
    icon: <Banknote className="w-7 h-7" />,
    gradient: 'from-[hsl(45,90%,50%)] to-[hsl(35,85%,42%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(45,90%,50%,0.3)]',
    route: '/service/cashier',
    statusField: null,
  },
];

const ServiceModePage = () => {
  const navigate = useNavigate();

  // Get staff name from session
  const staffName = useMemo(() => {
    const s = getStaffSession();
    return s?.name || '';
  }, []);

  // Fetch today's active orders for live counts
  const { data: orders = [] } = useQuery({
    queryKey: ['service-mode-counts'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('orders')
        .select('id, status, kitchen_status, bar_status, items')
        .in('status', ['New', 'Preparing', 'Served'])
        .gte('created_at', start.toISOString())
        .limit(300);
      return data || [];
    },
    refetchInterval: 10000,
  });

  const counts = useMemo(() => {
    let kitchen = 0, bar = 0, reception = 0, cashier = 0;
    const isAutoPayable = (o: any) => o.payment_type === 'Charge to Room' || !!o.tab_id;
    orders.forEach((o: any) => {
      const items = (o.items as any[]) || [];
      const hasFood = items.some((i: any) => { const d = i.department || 'kitchen'; return d === 'kitchen' || d === 'both'; });
      const hasDrinks = items.some((i: any) => i.department === 'bar' || i.department === 'both');
      if (hasFood && o.kitchen_status !== 'ready') kitchen++;
      if (hasDrinks && o.bar_status !== 'ready') bar++;
      reception++;
      // Cashier count = served non-auto-payable (awaiting payment)
      if (o.status === 'Served' && !isAutoPayable(o)) cashier++;
    });
    return { kitchen, bar, reception, cashier };
  }, [orders]);

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { const s = getStaffSession(); navigate(s?.isAdmin ? '/admin' : getHomeRoute(s?.permissions || [])); }} className="w-10 h-10 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2.5 flex-1">
            <LayoutGrid className="w-5 h-5 text-gold" />
            <h1 className="font-display text-lg tracking-[0.12em] text-foreground">Service Mode</h1>
          </div>
          {staffName && (
            <span className="font-body text-xs text-muted-foreground truncate max-w-[120px]">{staffName}</span>
          )}
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-4">
          <p className="font-body text-sm text-muted-foreground text-center mb-2">
            Select a department to open its live board
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {departments.map(dept => {
              const count = counts[dept.key as keyof typeof counts] || 0;
              return (
                <button
                  key={dept.key}
                  onClick={() => navigate(dept.route)}
                  className={`relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 flex flex-col gap-4 text-left group transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${dept.glow} hover:border-accent/40`}
                >
                  {/* Gradient accent strip */}
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${dept.gradient}`} />

                  <div className="flex items-center justify-between">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${dept.gradient} flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-200`}>
                      {dept.icon}
                    </div>
                    {count > 0 && (
                      <span className="font-body text-xs font-bold bg-gold/20 text-gold rounded-full px-2.5 py-1 min-w-[28px] text-center tabular-nums">
                        {count}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-display text-xl text-foreground tracking-wider">{dept.label}</p>
                    <p className="font-body text-xs text-muted-foreground mt-0.5">{dept.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceModePage;
