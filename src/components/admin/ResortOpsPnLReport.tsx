import { useMemo } from 'react';
import jsPDF from 'jspdf';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

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

  // ── PDF export ─────────────────────────────────────────────────────────
  const downloadPDF = () => {
    const PDF_TOP_MARGIN = 18;
    const PDF_PAGE_THRESHOLD = 275;

    const monthDate = (() => {
      const raw = monthExpenses[0]?.expense_date || monthBookings[0]?.check_in;
      if (raw) {
        const dateOnly = String(raw).slice(0, 10);
        const d = new Date(dateOnly + 'T00:00:00');
        if (!isNaN(d.getTime())) return d;
      }
      return new Date();
    })();
    const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
    const yearStr = String(monthDate.getFullYear());
    const monthYearLabel = `${monthName} ${yearStr}`;
    const filename = `BAIA-PnL-${monthName}-${yearStr}.pdf`;

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = PDF_TOP_MARGIN;

    const checkPage = (needed = 8) => {
      if (y + needed > PDF_PAGE_THRESHOLD) { doc.addPage(); y = PDF_TOP_MARGIN; }
    };

    // ── HEADER ─────────────────────────────────────────────────────────
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BAIA Boutique Resort', pageW / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('San Vicente, Palawan', pageW / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Monthly P&L Report \u2014 ${monthYearLabel}`, pageW / 2, y, { align: 'center' });
    y += 10;
    doc.setLineWidth(0.4);
    doc.line(14, y, pageW - 14, y);
    y += 8;

    // ── SECTION 1 — Summary ────────────────────────────────────────────
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Section 1 \u2014 Summary', 14, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const summaryRows: [string, string][] = [
      ['Total Revenue',    `PHP ${fmt(totalRevenue)}`],
      ['Total Expenses',   `PHP ${fmt(totalExpenses)}`],
      ['Net Profit',       `PHP ${fmt(netProfit)}`],
      ['Profit Margin',    `${profitMargin.toFixed(1)}%`],
    ];
    summaryRows.forEach(([label, value]) => {
      checkPage();
      doc.text(label, 18, y);
      doc.text(value, pageW - 14, y, { align: 'right' });
      y += 6;
    });
    y += 4;

    // ── SECTION 2 — Revenue Breakdown ─────────────────────────────────
    checkPage(12);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Section 2 \u2014 Revenue Breakdown', 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Source', 18, y);
    doc.text('Amount', pageW - 14, y, { align: 'right' });
    y += 5;
    doc.setLineWidth(0.2);
    doc.line(14, y, pageW - 14, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    revenueRows.forEach(row => {
      checkPage();
      doc.text(row.label, 18, y);
      doc.text(`PHP ${fmt(row.value)}`, pageW - 14, y, { align: 'right' });
      y += 5;
    });
    doc.setLineWidth(0.2);
    doc.line(14, y, pageW - 14, y);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Total Revenue', 18, y);
    doc.text(`PHP ${fmt(totalRevenue)}`, pageW - 14, y, { align: 'right' });
    y += 8;

    // ── SECTION 3 — Expenses Breakdown ────────────────────────────────
    checkPage(12);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Section 3 \u2014 Expenses Breakdown', 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Category', 18, y);
    doc.text('Amount', pageW - 14, y, { align: 'right' });
    y += 5;
    doc.setLineWidth(0.2);
    doc.line(14, y, pageW - 14, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    expenseRows.forEach(row => {
      checkPage();
      doc.text(row.label, 18, y);
      doc.text(`PHP ${fmt(row.amount)}`, pageW - 14, y, { align: 'right' });
      y += 5;
    });
    doc.setLineWidth(0.2);
    doc.line(14, y, pageW - 14, y);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Total Expenses', 18, y);
    doc.text(`PHP ${fmt(totalExpenses)}`, pageW - 14, y, { align: 'right' });
    y += 10;

    // ── SECTION 4 — Footer ────────────────────────────────────────────
    checkPage(14);
    doc.setLineWidth(0.4);
    doc.line(14, y, pageW - 14, y);
    y += 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const generatedDate = new Date().toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    doc.text(`Generated: ${generatedDate}`, 14, y);
    doc.text('Powered by BAIA ROS', pageW - 14, y, { align: 'right' });

    doc.save(filename);
  };

  return (
    <div className="space-y-4">
      {/* ── Section heading ── */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-wider text-foreground">Monthly P&amp;L Report</h3>
        <Button
          size="sm"
          variant="outline"
          className="font-display text-xs tracking-wider gap-1 min-h-[36px] whitespace-nowrap flex-shrink-0"
          onClick={downloadPDF}
        >
          <Download className="w-3.5 h-3.5" /> Download PDF
        </Button>
      </div>

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

      {/* ── Charts ── */}
      <div className="space-y-4">
        <h3 className="font-display text-sm tracking-wider text-foreground">Visual Summary</h3>

        {/* Chart 1 — Revenue vs Expenses */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent className="pr-4">
            <ResponsiveContainer width="100%" height={110}>
              <BarChart
                layout="vertical"
                data={[
                  { name: 'Total Revenue', value: totalRevenue },
                  { name: 'Total Expenses', value: totalExpenses },
                ]}
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`₱${fmt(v)}`, '']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={24}>
                  <Cell fill="hsl(var(--success))" />
                  <Cell fill="hsl(var(--destructive))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 2 — Revenue Breakdown by Source */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Revenue Breakdown by Source</CardTitle>
          </CardHeader>
          <CardContent className="pr-4">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart
                layout="vertical"
                data={[...revenueRows].sort((a, b) => b.value - a.value)}
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={130}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`₱${fmt(v)}`, 'Revenue']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="value" fill="hsl(var(--success))" radius={[0, 3, 3, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 3 — Top 5 Expenses by Category */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xs tracking-wider">Top 5 Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent className="pr-4">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart
                layout="vertical"
                data={[...expenseRows]
                  .filter(r => r.amount > 0)
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 5)}
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={150}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`₱${fmt(v)}`, 'Expense']}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="amount" fill="hsl(var(--warning))" radius={[0, 3, 3, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default ResortOpsPnLReport;
