import { useBillingConfig } from '@/hooks/useBillingConfig';
import { useResortProfile } from '@/hooks/useResortProfile';
import { useInvoiceSettings } from '@/hooks/useInvoiceSettings';
import type { RoomTransaction } from '@/hooks/useRoomTransactions';
import { format } from 'date-fns';

interface PrintBillProps {
  unitName: string;
  guestName: string | null;
  booking: any;
  transactions: RoomTransaction[];
  roomOrders?: any[];
  tours?: any[];
}

const PrintBill = ({ unitName, guestName, booking, transactions, roomOrders = [], tours = [] }: PrintBillProps) => {
  const { data: config } = useBillingConfig();
  const { data: profile } = useResortProfile();
  const { data: invoiceSettings } = useInvoiceSettings();

  const handlePrint = () => {
    const charges = transactions.filter(t => t.total_amount > 0);
    const payments = transactions.filter(t => t.total_amount < 0);
    const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
    const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));

    // Unpaid F&B orders (not charged to room)
    const unpaidFnB = roomOrders.filter((o: any) => o.status !== 'Paid' && o.payment_type !== 'Charge to Room');
    const fnbTotal = unpaidFnB.reduce((s: number, o: any) => s + Number(o.total || 0) + Number(o.service_charge || 0), 0);

    // Active tours
    const activeTours = tours.filter((t: any) => t.status !== 'cancelled');
    const toursTotal = activeTours.reduce((s: number, t: any) => s + Number(t.price || 0), 0);

    const balance = totalCharges - totalPayments + fnbTotal;

    const staffNames = [...new Set(transactions.map(t => t.staff_name))].join(', ');

    const resortName = profile?.resort_name || config?.receipt_header || 'RESORT';
    const tagline = profile?.tagline || '';
    const address = profile?.address || '';
    const contactParts: string[] = [];
    if (profile?.phone) contactParts.push(profile.phone);
    if (profile?.email) contactParts.push(profile.email);
    const contactLine = contactParts.join(' · ');
    const websiteLine = profile?.website_url || '';

    const thankYou = invoiceSettings?.thank_you_message || config?.receipt_footer || 'Thank you!';
    const businessHours = invoiceSettings?.business_hours || '';
    const footerText = invoiceSettings?.footer_text || '';
    const tinNumber = invoiceSettings?.tin_number || '';

    const html = `<!DOCTYPE html>
<html><head><style>
body { font-family: 'Courier New', monospace; max-width: 300px; margin: 0 auto; padding: 10px; font-size: 12px; }
.center { text-align: center; }
.right { text-align: right; }
.line { border-top: 1px dashed #000; margin: 8px 0; }
.row { display: flex; justify-content: space-between; }
.bold { font-weight: bold; }
h2, h3 { margin: 4px 0; }
.small { font-size: 10px; color: #555; }
</style></head><body>
<div class="center">
  <h2>${resortName}</h2>
  ${tagline ? `<p class="small">${tagline}</p>` : ''}
  ${address ? `<p class="small">${address}</p>` : ''}
  ${contactLine ? `<p class="small">${contactLine}</p>` : ''}
  ${websiteLine ? `<p class="small">${websiteLine}</p>` : ''}
  ${tinNumber ? `<p class="small">TIN: ${tinNumber}</p>` : ''}
  <div class="line"></div>
  <p><strong>GUEST BILL</strong></p>
  <div class="line"></div>
  <p><strong>Room:</strong> ${unitName}</p>
  <p><strong>Guest:</strong> ${guestName || '—'}</p>
  ${booking ? `<p>${format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')} — ${format(new Date(booking.check_out + 'T00:00:00'), 'MMM d, yyyy')}</p>` : ''}
  <p>${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
</div>
<div class="line"></div>
<h3>CHARGES</h3>
${charges.map(t => `<div class="row"><span>${format(new Date(t.created_at), 'M/d h:mma')}</span><span>₱${t.total_amount.toLocaleString()}</span></div>
${config?.show_itemized_taxes ? `<div style="font-size:10px;color:#666">&nbsp;&nbsp;Sub:₱${t.amount.toLocaleString()} Tax:₱${t.tax_amount.toLocaleString()} SC:₱${t.service_charge_amount.toLocaleString()}</div>` : ''}`).join('')}
<div class="line"></div>
<div class="row bold"><span>Room Charges</span><span>₱${totalCharges.toLocaleString()}</span></div>
${unpaidFnB.length > 0 ? `
<div class="line"></div>
<h3>F&B ORDERS</h3>
${unpaidFnB.map((o: any) => {
  const items = Array.isArray(o.items) ? o.items : [];
  const orderTotal = Number(o.total || 0) + Number(o.service_charge || 0);
  return `<div style="margin-bottom:4px">
<div class="row"><span>${items.map((i: any) => (i.qty || 1) + '× ' + i.name).join(', ')}</span></div>
<div style="font-size:10px;color:#666">&nbsp;&nbsp;Sub:₱${Number(o.total || 0).toLocaleString()} SC:₱${Number(o.service_charge || 0).toLocaleString()}</div>
<div class="row"><span>${o.status}</span><span>₱${orderTotal.toLocaleString()}</span></div>
</div>`;
}).join('')}
<div class="row bold"><span>F&B Total</span><span>₱${fnbTotal.toLocaleString()}</span></div>` : ''}
${activeTours.length > 0 ? `
<div class="line"></div>
<h3>TOURS & EXPERIENCES</h3>
${activeTours.map((t: any) => `<div class="row"><span>${t.tour_name} (${t.pax}pax)</span><span>₱${Number(t.price || 0).toLocaleString()}</span></div>
<div style="font-size:10px;color:#666">&nbsp;&nbsp;${t.tour_date} · ${t.status}</div>`).join('')}
<div class="row bold"><span>Tours Total</span><span>₱${toursTotal.toLocaleString()}</span></div>` : ''}
<div class="line"></div>
<h3>PAYMENTS</h3>
${payments.map(t => `<div class="row"><span>${t.payment_method}</span><span>₱${Math.abs(t.total_amount).toLocaleString()}</span></div>`).join('')}
<div class="row bold"><span>Total Paid</span><span>₱${totalPayments.toLocaleString()}</span></div>
<div class="line"></div>
<div class="row bold" style="font-size:14px"><span>BALANCE</span><span>₱${balance.toLocaleString()}</span></div>
<div class="line"></div>
${config?.show_staff_on_receipt ? `<p class="center small">Served by: ${staffNames}</p>` : ''}
${businessHours ? `<p class="center small">${businessHours}</p>` : ''}
<p class="center">${thankYou}</p>
${footerText ? `<p class="center small">${footerText}</p>` : ''}
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  };

  return (
    <button onClick={handlePrint}
      className="min-h-[44px] py-2 px-3 border border-border rounded font-display text-xs tracking-wider text-muted-foreground hover:text-foreground transition-colors">
      Print Bill
    </button>
  );
};

export default PrintBill;
