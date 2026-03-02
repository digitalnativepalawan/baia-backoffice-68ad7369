import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { RoomTransaction } from '@/hooks/useRoomTransactions';

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  unitName: string;
  guestName: string | null;
  bookingId: string | null;
  booking: any;
  transactions: RoomTransaction[];
  roomTypeId: string | null;
}

const CheckoutModal = ({ open, onOpenChange, unitId, unitName, guestName, bookingId, booking, transactions, roomTypeId }: CheckoutModalProps) => {
  const qc = useQueryClient();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const active = paymentMethods.filter(m => m.is_active && m.name !== 'Charge to Room');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const charges = transactions.filter(t => t.total_amount > 0);
  const payments = transactions.filter(t => t.total_amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const balance = totalCharges - totalPayments;

  // Room charge from booking
  const nights = booking ? Math.max(1, Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000)) : 0;
  const roomRate = booking ? Number(booking.room_rate) : 0;

  const handleCheckout = async () => {
    setSubmitting(true);
    try {
      const finalAmount = parseFloat(paymentAmount) || 0;
      // Record final payment if any
      if (finalAmount > 0 && paymentMethod) {
        await (supabase.from('room_transactions' as any) as any).insert({
          unit_id: unitId,
          unit_name: unitName,
          guest_name: guestName,
          booking_id: bookingId,
          transaction_type: 'payment',
          amount: -finalAmount,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: -finalAmount,
          payment_method: paymentMethod,
          staff_name: localStorage.getItem('emp_name') || 'Staff',
          notes: 'Final checkout payment',
        });
      }

      // Update booking checkout date
      if (bookingId) {
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('resort_ops_bookings').update({ check_out: today } as any).eq('id', bookingId);
      }

      // Set unit status to to_clean
      await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', unitId);

      // Create housekeeping order
      await (supabase.from('housekeeping_orders' as any) as any).insert({
        unit_name: unitName,
        room_type_id: roomTypeId || null,
        status: 'pending_inspection',
      });

      await logAudit('updated', 'units', unitId, `Checkout completed for ${guestName || 'Guest'} in ${unitName}`);

      qc.invalidateQueries({ queryKey: ['room-transactions', unitId] });
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      toast.success('Checkout complete — housekeeping order created');
      onOpenChange(false);
    } catch {
      toast.error('Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">Checkout — {unitName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Guest info */}
          <div className="border border-border rounded-lg p-3 bg-secondary space-y-1">
            <p className="font-display text-sm text-foreground">{guestName || 'Guest'}</p>
            {booking && (
              <p className="font-body text-xs text-muted-foreground">
                {nights} night{nights !== 1 ? 's' : ''} × ₱{roomRate.toLocaleString()}/night = ₱{(nights * roomRate).toLocaleString()}
              </p>
            )}
          </div>

          {/* Charges summary */}
          <div className="space-y-1.5">
            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Charges</p>
            {charges.map(t => (
              <div key={t.id} className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground truncate flex-1">{t.notes || t.transaction_type}</span>
                <span className="text-foreground">₱{t.total_amount.toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-display text-sm">
              <span className="text-foreground">Total Charges</span>
              <span className="text-foreground">₱{totalCharges.toLocaleString()}</span>
            </div>
          </div>

          <Separator />

          {/* Payments received */}
          <div className="space-y-1.5">
            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Payments Received</p>
            {payments.map(t => (
              <div key={t.id} className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground truncate flex-1">{t.payment_method} — {t.staff_name}</span>
                <span className="text-green-400">₱{Math.abs(t.total_amount).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-display text-sm">
              <span className="text-foreground">Total Paid</span>
              <span className="text-green-400">₱{totalPayments.toLocaleString()}</span>
            </div>
          </div>

          <Separator />

          <div className="flex justify-between font-display text-lg tracking-wider">
            <span className="text-foreground">Remaining Balance</span>
            <span className={balance > 0 ? 'text-destructive' : 'text-green-400'}>
              ₱{Math.abs(balance).toLocaleString()}
            </span>
          </div>

          {balance > 0 && (
            <div className="space-y-3 border border-border rounded-lg p-3">
              <p className="font-display text-xs tracking-wider text-foreground uppercase">Final Payment</p>
              <Select onValueChange={setPaymentMethod} value={paymentMethod}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                  <SelectValue placeholder="Payment method" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {active.map(m => (
                    <SelectItem key={m.id} value={m.name} className="text-foreground font-body">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                placeholder={`₱${balance.toLocaleString()}`}
                className="bg-secondary border-border text-foreground font-body" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-display text-xs tracking-wider">Cancel</Button>
          <Button onClick={handleCheckout} disabled={submitting} variant="destructive" className="font-display text-xs tracking-wider">
            {submitting ? 'Processing...' : 'Confirm Checkout'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutModal;
