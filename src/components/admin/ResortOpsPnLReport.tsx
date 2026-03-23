import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const BAR_CATEGORIES = new Set(['Cocktails', 'Wine', 'Spirits', 'Beer']);

const P_AND_L_EXPENSE_ROWS: { label: string; keys: string[] }[] = [
  { label: 'Labor/Staff',               keys: ['Labor/Staff'] },
  { label: 'Utilities',                 keys: ['Utilities (Electric/Water/Gas/Fuel)'] },
  { label: 'Food & Beverage (COGS)',    keys: ['Food & Beverage'] },
  { label: 'Housekeeping',              keys: ['Housekeeping'] },
  { label: 'Maintenance/Repairs',       keys: ['Maintenance/Repairs'] },
  { label: 'Transportation',            keys: ['Transportation'] },
  { label: 'Taxes/Government',          keys: ['Taxes/Government'] },
  { label: 'Miscellaneous',             keys: ['Miscellaneous'] },
  { label: 'Capital Expenditures',      keys: ['Capital Expenditures'] },
];

interface Props {
  monthBookings: any[];
  orders: any[];
  monthExpenses: any[];
  menuItems: any[];
}

const fmt = (n: number) =>
  n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ResortOpsPnLReport = ({ monthBookings, orders, monthExpenses, menuItems }: Props) => {
  // ── Menu-item category lookup ──────────────────────────────────────────
  const menuCategoryMap = useMemo(
    () => new Map<string, string>(menuItems.map((m: any) => [m.name as string, m.category as string])),
    [menuItems],
  );

  // ── Revenue breakdown ──────────────────────────────────────────────────
  const hotelAccommodation = useMemo(
    () => monthBookings.reduce((s: number, b: any) => s + Number(b.paid_amount || 0), 0),
    [monthBookings],
  );

  const hotelServices = useMemo(
    () => monthBookings.reduce((s: number, b: any) => s + Number(b.addons_total || 0), 0),
    [monthBookings],
  );

  const { foodBevRevenue, barRevenue } = useMemo(() => {
    let food = 0;
    let bar = 0;
    for (const order of orders) {
      const items: any[] = order.items || [];
      if (items.length === 0) {
        food += Number(order.total || 0);
        continue;
      }
      let orderFood = 0;
      let orderBar = 0;
      for (const item of items) {
        const price = Number(item.price || 0) * (Number(item.qty) || 1);
        const cat = menuCategoryMap.get(item.name) || '';
        if (BAR_CATEGORIES.has(cat)) {
          orderBar += price;
        } else {
          orderFood += price;
        }
      }
      // Proportional split when order total doesn't match item sum (discounts, etc.)
      const itemSum = orderFood + orderBar;
      const orderTotal = Number(order.total || 0);
      if (itemSum > 0 && Math.abs(itemSum - orderTotal) > 0.01) {
        const ratio = orderTotal / itemSum;
        food += orderFood * ratio;
        bar += orderBar * ratio;
      } else {
        food += orderFood;
        bar += orderBar;
      }
    }
    return { foodBevRevenue: food, barRevenue: bar };
  }, [orders, menuCategoryMap]);

  const totalRevenue = hotelAccommodation + hotelServices + foodBevRevenue + barRevenue;

  // ── Expense breakdown ──────────────────────────────────────────────────
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthExpenses) {
      const cat = (e.category as string) || '';
      map.set(cat, (map.get(cat) || 0) + Number(e.amount || 0));
    }
    return map;
  }, [monthExpenses]);

  const expenseRows = useMemo(
    () =>
      P_AND_L_EXPENSE_ROWS.map(row => ({
        label: row.label,
        amount: row.keys.reduce((s, k) => s + (expenseByCategory.get(k) || 0), 0),
      })),
    [expenseByCategory],
  );

  const totalExpenses = useMemo(
    () => expenseRows.reduce((s, r) => s + r.amount, 0),
    [expenseRows],
  );

  // ── Summary metrics ────────────────────────────────────────────────────
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const metricCards = [
    { label: 'Total Revenue',   value: `₱${fmt(totalRevenue)}`,           color: 'text-green-400' },
    { label: 'Total Expenses',  value: `₱${fmt(totalExpenses)}`,           color: 'text-red-400' },
    { label: 'Net Profit',      value: `₱${fmt(netProfit)}`,               color: netProfit >= 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Profit Margin',   value: `${profitMargin.toFixed(1)}%`,       color: profitMargin >= 0 ? 'text-blue-400' : 'text-red-400' },
  ];

  const revenueRows = [
    { label: 'Hotel Accommodation', value: hotelAccommodation },
    { label: 'Food & Beverage',     value: foodBevRevenue },
    { label: 'Bar Income',          value: barRevenue },
    { label: 'Hotel Services',      value: hotelServices },
  ];

  return (
    <div className="space-y-4">
      {/* ── Section heading ── */}
      <h3 className="font-display text-sm tracking-wider text-foreground">Monthly P&amp;L Report</h3>

      {/* ── Top-row metric cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metricCards.map(card => (
          <Card key={card.label} className="bg-card border-border">
            <CardContent className="p-3">
              <p className="font-body text-xs text-muted-foreground">{card.label}</p>
              <p className={`font-display text-lg ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Revenue & Expense tables ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Revenue Breakdown */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="font-display text-xs tracking-wider text-muted-foreground py-2 pl-4">Source</TableHead>
                  <TableHead className="font-display text-xs tracking-wider text-muted-foreground py-2 pr-4 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueRows.map(row => (
                  <TableRow key={row.label} className="border-border">
                    <TableCell className="font-body text-sm text-foreground py-2 pl-4">{row.label}</TableCell>
                    <TableCell className="font-body text-sm text-foreground py-2 pr-4 text-right">
                      ₱{fmt(row.value)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-border border-t-2 border-t-border">
                  <TableCell className="font-display text-xs tracking-wider text-foreground py-2 pl-4">Total Revenue</TableCell>
                  <TableCell className="font-display text-sm text-green-400 py-2 pr-4 text-right">
                    ₱{fmt(totalRevenue)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Expenses Breakdown */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Expenses Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="font-display text-xs tracking-wider text-muted-foreground py-2 pl-4">Category</TableHead>
                  <TableHead className="font-display text-xs tracking-wider text-muted-foreground py-2 pr-4 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseRows.map(row => (
                  <TableRow key={row.label} className="border-border">
                    <TableCell className="font-body text-sm text-foreground py-2 pl-4">{row.label}</TableCell>
                    <TableCell className="font-body text-sm text-foreground py-2 pr-4 text-right">
                      ₱{fmt(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-border border-t-2 border-t-border">
                  <TableCell className="font-display text-xs tracking-wider text-foreground py-2 pl-4">Total Expenses</TableCell>
                  <TableCell className="font-display text-sm text-red-400 py-2 pr-4 text-right">
                    ₱{fmt(totalExpenses)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResortOpsPnLReport;
