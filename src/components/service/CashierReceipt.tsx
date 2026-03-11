import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { useResortProfile } from '@/hooks/useResortProfile';
import { useInvoiceSettings } from '@/hooks/useInvoiceSettings';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { format } from 'date-fns';

interface CashierReceiptProps {
  order: any;
  onDone: () => void;
}

const CashierReceipt = ({ order, onDone }: CashierReceiptProps) => {
  const { data: profile } = useResortProfile();
  const { data: invoiceSettings } = useInvoiceSettings();
  const { data: config } = useBillingConfig();

  const items = (order.items as any[]) || [];
  const subtotal = items.reduce((s: number, i: any) => s + i.price * (i.qty || i.quantity || 1), 0);
  const sc = Number(order.service_charge || 0);
  const total = subtotal + sc;

  const handlePrint = () => {
    const resortName = profile?.resort_name || 'RESORT';
    const tagline = profile?.tagline || '';
    const address = profile?.address || '';
    const contactParts: string[] = [];
    if (profile?.phone) contactParts.push(profile.phone);
    if (profile?.email) contactParts.push(profile.email);
    const contactLine = contactParts.join(' · ');
    const tinNumber = invoiceSettings?.tin_number || '';
    const thankYou = invoiceSettings?.thank_you_message || 'Thank you for dining with us!';
    const businessHours = invoiceSettings?.business_hours || '';
    const footerText = invoiceSettings?.footer_text || '';

    const html = `<!DOCTYPE html>
<html><head><style>
body { font-family: 'Courier New', monospace; max-width: 300px; margin: 0 auto; padding: 10px; font-size: 12px; }
.center { text-align: center; }
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
  ${tinNumber ? `<p class="small">TIN: ${tinNumber}</p>` : ''}
  <div class="line"></div>
  <p><strong>RECEIPT</strong></p>
  <p class="small">${format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}</p>
  <p class="small">${order.order_type}${order.location_detail ? ' — ' + order.location_detail : ''}</p>
  ${order.guest_name ? `<p class="small">Guest: ${order.guest_name}</p>` : ''}
</div>
<div class="line"></div>
${items.map((i: any) => `<div class="row"><span>${i.qty || i.quantity || 1}× ${i.name}</span><span>₱${(i.price * (i.qty || i.quantity || 1)).toLocaleString()}</span></div>`).join('')}
<div class="line"></div>
<div class="row"><span>Subtotal</span><span>₱${subtotal.toLocaleString()}</span></div>
${sc > 0 ? `<div class="row"><span>Service Charge</span><span>₱${sc.toLocaleString()}</span></div>` : ''}
<div class="row bold" style="font-size:14px"><span>TOTAL</span><span>₱${total.toLocaleString()}</span></div>
<div class="line"></div>
<div class="row"><span>Payment</span><span>${order.payment_type || '—'}</span></div>
<div class="line"></div>
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
    <div className="flex flex-col items-center gap-6 p-6">
      {/* On-screen receipt preview */}
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-5 space-y-3 font-body text-sm">
        <div className="text-center space-y-1">
          <p className="font-display text-lg tracking-wider text-foreground">{profile?.resort_name || 'RESORT'}</p>
          {profile?.tagline && <p className="text-xs text-muted-foreground">{profile.tagline}</p>}
          <p className="text-xs text-muted-foreground">{format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}</p>
        </div>

        <div className="border-t border-dashed border-border pt-3 space-y-1">
          {items.map((i: any, idx: number) => (
            <div key={idx} className="flex justify-between">
              <span className="text-foreground">{i.qty || i.quantity || 1}× {i.name}</span>
              <span className="text-muted-foreground tabular-nums">₱{(i.price * (i.qty || i.quantity || 1)).toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-border pt-3 space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">₱{subtotal.toLocaleString()}</span>
          </div>
          {sc > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service Charge</span>
              <span className="tabular-nums">₱{sc.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-display text-lg text-gold">
            <span>Total</span>
            <span className="tabular-nums">₱{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-border pt-3 text-center">
          <span className="text-xs text-muted-foreground">Paid with: <strong className="text-foreground">{order.payment_type}</strong></span>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handlePrint} className="gap-2 font-display tracking-wider">
          <Printer className="w-4 h-4" /> Print Receipt
        </Button>
        <Button variant="outline" onClick={onDone} className="gap-2 font-display tracking-wider">
          <X className="w-4 h-4" /> Done
        </Button>
      </div>
    </div>
  );
};

export default CashierReceipt;
