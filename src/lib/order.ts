import { CartItem } from './cart';

export interface OrderInfo {
  orderType: 'Room' | 'DineIn' | 'Beach' | 'WalkIn';
  locationDetail: string;
  isStaff: boolean;
  paymentType?: string;
}

export function formatWhatsAppMessage(order: OrderInfo, items: CartItem[], total: number): string {
  const typeLabels: Record<string, string> = {
    Room: 'Room Delivery',
    DineIn: 'Dine In',
    Beach: 'Beach Delivery',
    WalkIn: 'Walk-In Guest',
  };

  const lines = [
    '🌴 *NEW ORDER – BAIA PALAWAN*',
    '',
    `*Type:* ${typeLabels[order.orderType] || order.orderType}`,
    `*Location:* ${order.locationDetail}`,
  ];

  if (order.isStaff && order.paymentType) {
    lines.push(`*Payment:* ${order.paymentType}`);
  }

  lines.push('', '*Items:*');
  items.forEach(item => {
    lines.push(`${item.quantity}x ${item.name} – ₱${(item.price * item.quantity).toLocaleString()}`);
  });

  lines.push('', `*Total: ₱${total.toLocaleString()}*`);
  lines.push('', `*Time:* ${new Date().toLocaleString('en-PH')}`);

  return lines.join('\n');
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '');
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}
