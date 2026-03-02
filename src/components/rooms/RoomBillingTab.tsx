import { useState } from 'react';
import { useRoomTransactions } from '@/hooks/useRoomTransactions';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { DollarSign, Plus, RefreshCw, LogOut } from 'lucide-react';
import AddPaymentModal from './AddPaymentModal';
import AdjustmentModal from './AdjustmentModal';
import CheckoutModal from './CheckoutModal';
import PrintBill from './PrintBill';

interface RoomBillingTabProps {
  unit: any;
  booking: any;
  guestName: string | null;
}

const RoomBillingTab = ({ unit, booking, guestName }: RoomBillingTabProps) => {
  const { data: transactions = [], isLoading, refetch } = useRoomTransactions(unit?.id);
  const [showPayment, setShowPayment] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const charges = transactions.filter(t => t.total_amount > 0);
  const payments = transactions.filter(t => t.total_amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const balance = totalCharges - totalPayments;

  if (isLoading) return <p className="font-body text-sm text-muted-foreground text-center py-8">Loading...</p>;

  return (
    <div className="space-y-4">
      {/* Balance header */}
      <div className="border border-border rounded-lg p-4 bg-secondary space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-xs text-muted-foreground">Current Balance</p>
            <p className={`font-display text-2xl tracking-wider ${balance > 0 ? 'text-destructive' : 'text-green-400'}`}>
              ₱{Math.abs(balance).toLocaleString()}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => refetch()} className="text-muted-foreground">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <p className="font-body text-xs text-muted-foreground">
          {guestName || 'No guest'} · {unit.name}
          {booking && ` · ${format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')}–${format(new Date(booking.check_out + 'T00:00:00'), 'MMM d')}`}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowPayment(true)}
          className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
          <DollarSign className="w-3.5 h-3.5" /> Add Payment
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowAdjustment(true)}
          className="font-display text-xs tracking-wider min-h-[44px]">
          Adjustment
        </Button>
        <PrintBill unitName={unit.name} guestName={guestName} booking={booking} transactions={transactions} />
        {booking && (
          <Button size="sm" variant="destructive" onClick={() => setShowCheckout(true)}
            className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
            <LogOut className="w-3.5 h-3.5" /> Check Out
          </Button>
        )}
      </div>

      <Separator />

      {/* Transaction list */}
      <div className="space-y-2">
        <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Transaction History</p>
        {transactions.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground text-center py-4">No transactions yet</p>
        ) : (
          transactions.map(t => (
            <div key={t.id} className="border border-border rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-body text-xs text-muted-foreground">
                    {format(new Date(t.created_at), 'MMM d h:mma')} · {t.staff_name}
                  </p>
                  <p className="font-display text-sm text-foreground capitalize">{t.transaction_type.replace('_', ' ')}</p>
                  {t.notes && <p className="font-body text-xs text-muted-foreground">{t.notes}</p>}
                </div>
                <p className={`font-display text-sm ${t.total_amount > 0 ? 'text-foreground' : 'text-green-400'}`}>
                  {t.total_amount > 0 ? '' : '-'}₱{Math.abs(t.total_amount).toLocaleString()}
                </p>
              </div>
              {(t.tax_amount !== 0 || t.service_charge_amount !== 0) && (
                <p className="font-body text-[10px] text-muted-foreground">
                  Sub: ₱{Math.abs(t.amount).toLocaleString()} · Tax: ₱{Math.abs(t.tax_amount).toLocaleString()} · SC: ₱{Math.abs(t.service_charge_amount).toLocaleString()}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <Separator />

      {/* Summary */}
      <div className="space-y-1.5">
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">Total Charges</span>
          <span className="text-foreground">₱{totalCharges.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">Total Payments</span>
          <span className="text-green-400">₱{totalPayments.toLocaleString()}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-display text-lg tracking-wider">
          <span className="text-foreground">Balance</span>
          <span className={balance > 0 ? 'text-destructive' : 'text-green-400'}>
            ₱{Math.abs(balance).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Modals */}
      <AddPaymentModal open={showPayment} onOpenChange={setShowPayment}
        unitId={unit.id} unitName={unit.name} guestName={guestName}
        bookingId={booking?.id || null} currentBalance={balance} />
      <AdjustmentModal open={showAdjustment} onOpenChange={setShowAdjustment}
        unitId={unit.id} unitName={unit.name} guestName={guestName}
        bookingId={booking?.id || null} transactions={transactions} />
      {booking && (
        <CheckoutModal open={showCheckout} onOpenChange={setShowCheckout}
          unitId={unit.id} unitName={unit.name} guestName={guestName}
          bookingId={booking.id} booking={booking} transactions={transactions}
          roomTypeId={(unit as any).room_type_id || null} />
      )}
    </div>
  );
};

export default RoomBillingTab;
