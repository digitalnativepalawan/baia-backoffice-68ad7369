import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { startOfDay, startOfWeek, startOfMonth, startOfYear, subDays, endOfDay, format } from 'date-fns';
import { DollarSign, ShoppingCart, TrendingUp, Lock, Download, CalendarIcon, Percent, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'ytd' | 'custom';

const ReportsDashboard = () => {
  const [range, setRange] = useState<DateRange>('today');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    switch (range) {
      case 'today':
        return { dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'yesterday': {
        const y = subDays(now, 1);
        return { dateFrom: startOfDay(y).toISOString(), dateTo: endOfDay(y).toISOString() };
      }
      case 'week':
        return { dateFrom: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'month':
        return { dateFrom: startOfMonth(now).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'ytd':
        return { dateFrom: startOfYear(now).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'custom':
        return {
          dateFrom: customFrom ? startOfDay(customFrom).toISOString() : '2000-01-01T00:00:00Z',
          dateTo: customTo ? endOfDay(customTo).toISOString() : endOfDay(now).toISOString(),
        };
      default:
        return { dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() };
    }
  }, [range, customFrom, customTo]);

  // Fetch completed orders
  const { data: orders = [] } = useQuery({
    queryKey: ['reports-orders', dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['Paid', 'Closed'])
        .gte('closed_at', dateFrom)
        .lte('closed_at', dateTo)
        .order('closed_at', { ascending: false });
      return data || [];
    },
  });

  // Fetch menu items for food cost lookup
  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-items-cost'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_items').select('name, food_cost');
      return data || [];
    },
  });

  const costMap = useMemo(() => {
    const map: Record<string, number> = {};
    menuItems.forEach(m => { map[m.name] = m.food_cost || 0; });
    return map;
  }, [menuItems]);

  const stats = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const count = orders.length;
    const avg = count ? revenue / count : 0;

    // Revenue by type
    const byType: Record<string, number> = {};
    orders.forEach(o => {
      byType[o.order_type] = (byType[o.order_type] || 0) + (o.total || 0);
    });

    // Per-item breakdown with food cost
    const itemMap: Record<string, { qty: number; revenue: number; foodCost: number }> = {};
    orders.forEach(o => {
      ((o.items as any[]) || []).forEach((i: any) => {
        const qty = i.qty || 1;
        const price = i.price || 0;
        const fc = costMap[i.name] || 0;
        if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, revenue: 0, foodCost: 0 };
        itemMap[i.name].qty += qty;
        itemMap[i.name].revenue += price * qty;
        itemMap[i.name].foodCost += fc * qty;
      });
    });

    const itemBreakdown = Object.entries(itemMap)
      .map(([name, d]) => ({
        name,
        qty: d.qty,
        revenue: d.revenue,
        foodCost: d.foodCost,
        profit: d.revenue - d.foodCost,
        margin: d.revenue > 0 ? ((d.revenue - d.foodCost) / d.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalFoodCost = itemBreakdown.reduce((s, i) => s + i.foodCost, 0);
    const totalProfit = revenue - totalFoodCost;
    const marginPct = revenue > 0 ? (totalProfit / revenue) * 100 : 0;

    return { revenue, count, avg, byType, itemBreakdown, totalFoodCost, totalProfit, marginPct };
  }, [orders, costMap]);

  const ranges: { key: DateRange; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'ytd', label: 'YTD' },
    { key: 'custom', label: 'Custom' },
  ];

  const generateCSV = () => {
    const periodLabel = range === 'custom'
      ? `${customFrom ? format(customFrom, 'yyyy-MM-dd') : 'start'}_to_${customTo ? format(customTo, 'yyyy-MM-dd') : 'now'}`
      : range;

    let csv = '';
    // Summary
    csv += 'REPORT SUMMARY\n';
    csv += `Period,${periodLabel}\n`;
    csv += `Total Revenue,${stats.revenue.toFixed(2)}\n`;
    csv += `Total Food Cost,${stats.totalFoodCost.toFixed(2)}\n`;
    csv += `Total Profit,${stats.totalProfit.toFixed(2)}\n`;
    csv += `Margin %,${stats.marginPct.toFixed(1)}%\n`;
    csv += `Total Orders,${stats.count}\n`;
    csv += '\n';

    // Item breakdown
    csv += 'ITEM BREAKDOWN\n';
    csv += 'Item,Qty Sold,Revenue,Food Cost,Profit,Margin %\n';
    stats.itemBreakdown.forEach(i => {
      csv += `"${i.name}",${i.qty},${i.revenue.toFixed(2)},${i.foodCost.toFixed(2)},${i.profit.toFixed(2)},${i.margin.toFixed(1)}%\n`;
    });
    csv += '\n';

    // Transactions
    csv += 'TRANSACTIONS\n';
    csv += 'Order ID,Date/Time,Order Type,Location,Items,Subtotal,Service Charge,Total,Payment Type,Status\n';
    orders.forEach(o => {
      const items = ((o.items as any[]) || [])
        .map((i: any) => `${i.name} x${i.qty || 1} @${i.price || 0}`)
        .join('; ');
      const subtotal = (o.total || 0) - (o.service_charge || 0);
      const dateStr = o.closed_at ? format(new Date(o.closed_at), 'yyyy-MM-dd HH:mm') : '';
      csv += `"${o.id}","${dateStr}","${o.order_type}","${o.location_detail || ''}","${items}",${subtotal.toFixed(2)},${(o.service_charge || 0).toFixed(2)},${(o.total || 0).toFixed(2)},"${o.payment_type || ''}","${o.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${format(new Date(), 'yyyy-MM-dd')}-${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="flex flex-wrap gap-2">
        {ranges.map(r => (
          <Button
            key={r.key}
            size="sm"
            variant={range === r.key ? 'default' : 'outline'}
            onClick={() => setRange(r.key)}
            className="font-body text-xs flex-1 min-w-[60px]"
          >
            {r.label}
          </Button>
        ))}
      </div>

      {/* Custom date pickers */}
      {range === 'custom' && (
        <div className="flex gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("font-body text-xs justify-start min-w-[140px]", !customFrom && "text-muted-foreground")}>
                <CalendarIcon className="w-3 h-3 mr-1" />
                {customFrom ? format(customFrom, 'MMM dd, yyyy') : 'From date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("font-body text-xs justify-start min-w-[140px]", !customTo && "text-muted-foreground")}>
                <CalendarIcon className="w-3 h-3 mr-1" />
                {customTo ? format(customTo, 'MMM dd, yyyy') : 'To date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* CSV Download */}
      <Button size="sm" variant="outline" onClick={generateCSV} className="font-body text-xs w-full">
        <Download className="w-4 h-4 mr-1" /> Download CSV Report
      </Button>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-card/50 border-border">
          <CardContent className="p-3 text-center">
            <DollarSign className="w-4 h-4 text-gold mx-auto mb-1" />
            <p className="font-display text-lg text-foreground">₱{stats.revenue.toLocaleString()}</p>
            <p className="font-body text-xs text-cream-dim">Revenue</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="p-3 text-center">
            <ShoppingCart className="w-4 h-4 text-gold mx-auto mb-1" />
            <p className="font-display text-lg text-foreground">₱{stats.totalFoodCost.toLocaleString()}</p>
            <p className="font-body text-xs text-cream-dim">Food Cost</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="p-3 text-center">
            <PiggyBank className="w-4 h-4 text-gold mx-auto mb-1" />
            <p className="font-display text-lg text-foreground">₱{stats.totalProfit.toLocaleString()}</p>
            <p className="font-body text-xs text-cream-dim">Profit</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="p-3 text-center">
            <Percent className="w-4 h-4 text-gold mx-auto mb-1" />
            <p className="font-display text-lg text-foreground">{stats.marginPct.toFixed(1)}%</p>
            <p className="font-body text-xs text-cream-dim">Margin</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders count & avg */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-card/50 border-border">
          <CardContent className="p-3 text-center">
            <p className="font-display text-lg text-foreground">{stats.count}</p>
            <p className="font-body text-xs text-cream-dim">Orders</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardContent className="p-3 text-center">
            <p className="font-display text-lg text-foreground">₱{stats.avg.toFixed(0)}</p>
            <p className="font-body text-xs text-cream-dim">Avg Order</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Type */}
      {Object.keys(stats.byType).length > 0 && (
        <section>
          <h3 className="font-display text-sm tracking-wider text-foreground mb-3">Revenue by Order Type</h3>
          <div className="space-y-2">
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, rev]) => (
              <div key={type} className="flex justify-between items-center p-2 border border-border rounded">
                <span className="font-body text-sm text-foreground">{type}</span>
                <span className="font-display text-sm text-gold">₱{rev.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-item Profit Breakdown */}
      {stats.itemBreakdown.length > 0 && (
        <section>
          <h3 className="font-display text-sm tracking-wider text-foreground mb-3">Item Profit Breakdown</h3>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-body text-xs">Item</TableHead>
                  <TableHead className="font-body text-xs text-right">Qty</TableHead>
                  <TableHead className="font-body text-xs text-right">Revenue</TableHead>
                  <TableHead className="font-body text-xs text-right">Cost</TableHead>
                  <TableHead className="font-body text-xs text-right">Profit</TableHead>
                  <TableHead className="font-body text-xs text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.itemBreakdown.map(item => (
                  <TableRow key={item.name}>
                    <TableCell className="font-body text-xs">{item.name}</TableCell>
                    <TableCell className="font-body text-xs text-right">{item.qty}</TableCell>
                    <TableCell className="font-body text-xs text-right">₱{item.revenue.toLocaleString()}</TableCell>
                    <TableCell className="font-body text-xs text-right">₱{item.foodCost.toLocaleString()}</TableCell>
                    <TableCell className="font-body text-xs text-right">₱{item.profit.toLocaleString()}</TableCell>
                    <TableCell className="font-body text-xs text-right">{item.margin.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Coming Soon - Tours */}
      <section className="p-4 border border-dashed border-border rounded-lg opacity-60">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-cream-dim" />
          <h3 className="font-display text-sm tracking-wider text-foreground">Tours Revenue</h3>
        </div>
        <p className="font-body text-xs text-cream-dim">
          Coming soon — track revenue from tours and activities.
        </p>
      </section>
    </div>
  );
};

export default ReportsDashboard;
