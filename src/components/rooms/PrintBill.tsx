import { useBillingConfig } from '@/hooks/useBillingConfig';
import type { RoomTransaction } from '@/hooks/useRoomTransactions';
import { format } from 'date-fns';

interface PrintBillProps {
  unitName: string;
  guestName: string | null;
  booking: any;
  transactions: RoomTransaction[];
}

const PrintBill = ({ unitName, guestName, booking, transactions }: PrintBillProps) => {
  const { data: config } = useBillingConfig();

  const handlePrint = () => {
    const charges = transactions.filter(t => t.total_amount > 0);
    const payments = transactions.filter(t => t.total_amount < 0);
    const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
    const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
    const balance = totalCharges - totalPayments;

    const staffNames = [...new Set(transactions.map(t => t.staff_name))].join(', ');

    const html = `<!DOCTYPE html>
<html><head><style>
body { font-family: 'Courier New', monospace; max-width: 300px; margin: 0 auto; padding: 10px; font-size: 12px; }
.center { text-align: center; }
.right { text-align: right; }
.line { border-top: 1px dashed #000; margin: 8px 0; }
.row { display: flex; justify-content: space-between; }
.bold { font-weight: bold; }
h2, h3 { margin: 4px 0; }
</style></head><body>
<div class="center">
  <h2>${config?.receipt_header || 'RESORT'}</h2>
  <p>GUEST BILL</p>
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
<div class="row bold"><span>Total Charges</span><span>₱${totalCharges.toLocaleString()}</span></div>
<div class="line"></div>
<h3>PAYMENTS</h3>
${payments.map(t => `<div class="row"><span>${t.payment_method}</span><span>₱${Math.abs(t.total_amount).toLocaleString()}</span></div>`).join('')}
<div class="row bold"><span>Total Paid</span><span>₱${totalPayments.toLocaleString()}</span></div>
<div class="line"></div>
<div class="row bold" style="font-size:14px"><span>BALANCE</span><span>₱${balance.toLocaleString()}</span></div>
<div class="line"></div>
${config?.show_staff_on_receipt ? `<p class="center" style="font-size:10px">Served by: ${staffNames}</p>` : ''}
<p class="center">${config?.receipt_footer || 'Thank you!'}</p>
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
