import jsPDF from 'jspdf';
import { ResortProfile } from '@/hooks/useResortProfile';

interface InvoiceOrder {
  id: string;
  order_type: string;
  location_detail: string | null;
  items: any[];
  total: number;
  service_charge: number;
  payment_type: string | null;
  created_at: string;
}

// Use "P" for peso in PDF since jsPDF doesn't support the ₱ unicode glyph
function formatCurrency(amount: number): string {
  return `P${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const INVOICE_LOGO_PATH = '/invoice-logo.png';

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    // Use higher resolution for crisp output
    const scale = 3;
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, img.width, img.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function generateInvoicePdf(order: InvoiceOrder, profile: ResortProfile | null): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 12;

  // --- Hardcoded Logo ---
  const logoData = await loadImageAsBase64(INVOICE_LOGO_PATH);
  if (logoData) {
    // Logo is wide (landscape), use width-based sizing
    const logoW = 50;
    const logoH = 18;
    doc.addImage(logoData, 'PNG', (pageWidth - logoW) / 2, y, logoW, logoH);
    y += logoH + 3;
  }

  // --- Resort Header ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(profile?.resort_name || 'Resort', pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (profile?.address) {
    doc.text(profile.address, pageWidth / 2, y, { align: 'center' });
    y += 4;
  }
  const contactParts: string[] = [];
  if (profile?.phone) contactParts.push(profile.phone);
  if (profile?.email) contactParts.push(profile.email);
  if (contactParts.length) {
    doc.text(contactParts.join('  |  '), pageWidth / 2, y, { align: 'center' });
    y += 4;
  }

  // --- Divider ---
  y += 2;
  doc.setDrawColor(180);
  doc.line(10, y, pageWidth - 10, y);
  y += 6;

  // --- Invoice Title ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('OFFICIAL INVOICE', pageWidth / 2, y, { align: 'center' });
  y += 7;

  // --- Order Info ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const orderDate = new Date(order.created_at).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  doc.text(`Date: ${orderDate}`, 12, y);
  y += 5;

  const typeLabels: Record<string, string> = {
    Room: 'Room Delivery', DineIn: 'Dine In', Beach: 'Beach Delivery', WalkIn: 'Walk-In',
  };
  const typeLabel = typeLabels[order.order_type] || order.order_type;
  doc.text(`Type: ${typeLabel}${order.location_detail ? ` - ${order.location_detail}` : ''}`, 12, y);
  y += 6;

  // --- Divider ---
  doc.line(10, y, pageWidth - 10, y);
  y += 6;

  // --- Items ---
  doc.setFontSize(9);
  const items = order.items || [];
  items.forEach((item: any) => {
    const qty = item.qty || item.quantity;
    const name = `${qty}x ${item.name}`;
    const price = formatCurrency(item.price * qty);
    doc.setFont('helvetica', 'normal');
    doc.text(name, 12, y);
    doc.text(price, pageWidth - 12, y, { align: 'right' });
    y += 5;
  });

  y += 3;
  doc.line(10, y, pageWidth - 10, y);
  y += 6;

  // --- Totals ---
  const subtotal = items.reduce((sum: number, i: any) => sum + (i.price * (i.qty || i.quantity)), 0);
  doc.text('Subtotal', 12, y);
  doc.text(formatCurrency(subtotal), pageWidth - 12, y, { align: 'right' });
  y += 5;

  doc.text('Service Charge (10%)', 12, y);
  doc.text(formatCurrency(order.service_charge), pageWidth - 12, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', 12, y);
  doc.text(formatCurrency(order.total), pageWidth - 12, y, { align: 'right' });
  y += 7;

  // --- Payment ---
  if (order.payment_type) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.line(10, y, pageWidth - 10, y);
    y += 5;
    doc.text(`Payment: ${order.payment_type}`, 12, y);
    y += 7;
  }

  // --- Footer ---
  doc.line(10, y, pageWidth - 10, y);
  y += 6;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.text('Thank you for dining with us!', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('www.bingabeach.com', pageWidth / 2, y, { align: 'center' });

  // --- Save ---
  doc.save(`invoice-${order.id.slice(0, 8)}.pdf`);
}

export function buildInvoiceWhatsAppText(order: InvoiceOrder, profile: ResortProfile | null): string {
  const typeLabels: Record<string, string> = {
    Room: 'Room Delivery', DineIn: 'Dine In', Beach: 'Beach Delivery', WalkIn: 'Walk-In',
  };
  const items = order.items || [];
  const subtotal = items.reduce((sum: number, i: any) => sum + (i.price * (i.qty || i.quantity)), 0);

  const lines = [
    `*INVOICE - ${profile?.resort_name || 'Resort'}*`,
    '',
    `Date: ${new Date(order.created_at).toLocaleString('en-PH')}`,
    `Type: ${typeLabels[order.order_type] || order.order_type}${order.location_detail ? ` - ${order.location_detail}` : ''}`,
    '',
    '*Items:*',
    ...items.map((i: any) => `${i.qty || i.quantity}x ${i.name} - P${((i.price) * (i.qty || i.quantity)).toLocaleString()}`),
    '',
    `Subtotal: P${subtotal.toLocaleString()}`,
    `Service Charge (10%): P${order.service_charge.toLocaleString()}`,
    `*Total: P${order.total.toLocaleString()}*`,
  ];

  if (order.payment_type) lines.push(`Payment: ${order.payment_type}`);
  lines.push('', 'Thank you for dining with us!', 'www.bingabeach.com');

  return lines.join('\n');
}
