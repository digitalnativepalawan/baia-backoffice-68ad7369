import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, LogIn, LogOut, DollarSign, Users, BedDouble } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useRoomTransactions } from '@/hooks/useRoomTransactions';
import { canEdit, canManage } from '@/lib/permissions';
import { logAudit } from '@/lib/auditLog';

const from = (table: string) => supabase.from(table as any);

const SESSION_KEY = 'staff_home_session';
const getSession = () => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const s = JSON.parse(stored);
      if (s.expiresAt > Date.now()) return s;
    }
  } catch {}
  return null;
};

const ReceptionPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = getSession();
  const perms: string[] = session?.permissions || [];
  const isAdmin = perms.includes('admin');
  const canDoEdit = isAdmin || canEdit(perms, 'reception');
  const canDoManage = isAdmin || canManage(perms, 'reception');

  const today = new Date().toISOString().split('T')[0];

  // Check-in modal state
  const [checkInBooking, setCheckInBooking] = useState<any>(null);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // Walk-in modal state
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInUnit, setWalkInUnit] = useState<any>(null);
  const [walkInForm, setWalkInForm] = useState({
    guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: '0', notes: '',
  });
  const [walkingIn, setWalkingIn] = useState(false);

  // Check-out modal state
  const [checkOutBooking, setCheckOutBooking] = useState<any>(null);
  const [checkOutUnit, setCheckOutUnit] = useState<any>(null);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [checkOutPayment, setCheckOutPayment] = useState('');
  const [checkOutAmount, setCheckOutAmount] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);

  const { data: paymentMethods = [] } = usePaymentMethods();
  const activePM = paymentMethods.filter(m => m.is_active && m.name !== 'Charge to Room');

  // Units
  const { data: units = [] } = useQuery({
    queryKey: ['rooms-units'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').eq('active', true).order('unit_name');
      return (data || []).map((u: any) => ({ ...u, name: u.unit_name }));
    },
  });

  // Resort ops units
  const { data: resortUnits = [] } = useQuery({
    queryKey: ['resort-ops-units'],
    queryFn: async () => {
      const { data } = await from('resort_ops_units').select('*');
      return (data || []) as any[];
    },
  });

  // Bookings
  const { data: bookings = [] } = useQuery({
    queryKey: ['rooms-bookings'],
    queryFn: async () => {
      const { data } = await supabase.from('resort_ops_bookings').select('*, resort_ops_guests(*)').order('check_in', { ascending: false });
      return data || [];
    },
  });

  // Housekeeping orders (active)
  const { data: housekeepingOrders = [] } = useQuery({
    queryKey: ['housekeeping-orders'],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders').select('*').neq('status', 'completed').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Room transactions for checkout
  const { data: checkOutTransactions = [] } = useRoomTransactions(checkOutUnit?.id || null);

  const resolveResortUnit = (roomName: string) =>
    resortUnits.find((ru: any) => ru.name.toLowerCase().trim() === roomName.toLowerCase().trim());

  const getUnitStatus = (unit: any): 'occupied' | 'to_clean' | 'ready' => (unit as any).status || 'ready';

  const getActiveBooking = (unit: any) => {
    if (getUnitStatus(unit) !== 'occupied') return null;
    const resortUnit = resolveResortUnit(unit.name);
    if (!resortUnit) return null;
    return bookings.find((b: any) => b.unit_id === resortUnit.id && b.check_in <= today && b.check_out >= today) || null;
  };

  // Today's arrivals: bookings with check_in === today that haven't been checked in yet
  const todayArrivals = bookings.filter((b: any) => {
    if (b.check_in !== today) return false;
    // Check if unit is already occupied for this booking
    const unit = units.find((u: any) => {
      const ru = resolveResortUnit(u.name);
      return ru && ru.id === b.unit_id;
    });
    return !unit || getUnitStatus(unit) !== 'occupied';
  });

  // Today's departures: occupied units with booking check_out === today
  const todayDepartures = units.filter((u: any) => {
    const booking = getActiveBooking(u);
    return booking && booking.check_out === today;
  }).map(u => ({ unit: u, booking: getActiveBooking(u)! }));

  // Occupancy counts
  const occupiedUnits = units.filter((u: any) => getUnitStatus(u) === 'occupied');
  const toCleanUnits = units.filter((u: any) => getUnitStatus(u) === 'to_clean');
  const readyUnits = units.filter((u: any) => getUnitStatus(u) === 'ready');

  const getUnitNameForBooking = (booking: any) => {
    const ru = resortUnits.find((r: any) => r.id === booking.unit_id);
    return ru?.name || 'Unknown';
  };

  // ── CHECK-IN (reservation) ──
  const handleReservationCheckIn = async () => {
    if (!checkInBooking) return;
    setCheckingIn(true);
    try {
      const unitName = getUnitNameForBooking(checkInBooking);
      const unit = units.find((u: any) => u.name === unitName);
      if (!unit) throw new Error('Unit not found');
      if (getUnitStatus(unit) === 'to_clean') throw new Error('Complete housekeeping first');

      // Generate room password
      const roomPassword = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(checkInBooking.check_out);
      expiresAt.setDate(expiresAt.getDate() + 1);

      await from('resort_ops_bookings').update({
        room_password: roomPassword,
        password_expires_at: expiresAt.toISOString(),
      }).eq('id', checkInBooking.id);

      await supabase.from('units').update({ status: 'occupied' } as any).eq('id', unit.id);
      await logAudit('created', 'units', unit.id, `Check-in: ${checkInBooking.resort_ops_guests?.full_name} to ${unitName}`);

      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      setCheckInModalOpen(false);
      setCheckInBooking(null);
      toast.success(`Checked in to ${unitName}. Room password: ${roomPassword}`, { duration: 10000 });
    } catch (err: any) {
      toast.error(err.message || 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  // ── WALK-IN CHECK-IN ──
  const handleWalkIn = async () => {
    if (!walkInUnit || !walkInForm.guestName.trim() || !walkInForm.checkOut) {
      toast.error('Guest name and check-out date required');
      return;
    }
    setWalkingIn(true);
    try {
      // Create or find guest
      const { data: existing } = await from('resort_ops_guests')
        .select('id').ilike('full_name', walkInForm.guestName.trim()).maybeSingle() as any;

      let gId: string;
      if (existing) {
        gId = existing.id;
      } else {
        const { data: newG, error: gErr } = await from('resort_ops_guests').insert({
          full_name: walkInForm.guestName.trim(),
        }).select('id').single() as any;
        if (gErr || !newG) throw new Error('Failed to create guest');
        gId = newG.id;
      }

      let resortUnit = resolveResortUnit(walkInUnit.name);
      if (!resortUnit) {
        const { data: newU } = await from('resort_ops_units').insert({
          name: walkInUnit.name, type: 'room', capacity: 2,
        }).select('id').single() as any;
        if (!newU) throw new Error('Failed to create unit mapping');
        resortUnit = { id: newU.id };
        qc.invalidateQueries({ queryKey: ['resort-ops-units'] });
      }

      const roomPassword = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(walkInForm.checkOut);
      expiresAt.setDate(expiresAt.getDate() + 1);

      await from('resort_ops_bookings').insert({
        guest_id: gId,
        unit_id: resortUnit.id,
        platform: walkInForm.platform,
        check_in: walkInForm.checkIn,
        check_out: walkInForm.checkOut,
        adults: parseInt(walkInForm.adults) || 1,
        children: parseInt(walkInForm.children) || 0,
        room_rate: parseFloat(walkInForm.roomRate) || 0,
        notes: walkInForm.notes || '',
        room_password: roomPassword,
        password_expires_at: expiresAt.toISOString(),
      });

      await supabase.from('units').update({ status: 'occupied' } as any).eq('id', walkInUnit.id);
      await logAudit('created', 'units', walkInUnit.id, `Walk-in check-in: ${walkInForm.guestName.trim()} to ${walkInUnit.name}`);

      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      setWalkInOpen(false);
      setWalkInUnit(null);
      setWalkInForm({ guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: '0', notes: '' });
      toast.success(`Walk-in checked in to ${walkInUnit.name}. Password: ${roomPassword}`, { duration: 10000 });
    } catch (err: any) {
      toast.error(err.message || 'Walk-in failed');
    } finally {
      setWalkingIn(false);
    }
  };

  // ── CHECK-OUT ──
  const handleCheckOut = async () => {
    if (!checkOutBooking || !checkOutUnit) return;
    setCheckingOut(true);
    try {
      const finalAmount = parseFloat(checkOutAmount) || 0;
      if (finalAmount > 0 && checkOutPayment) {
        await (from('room_transactions') as any).insert({
          unit_id: checkOutUnit.id,
          unit_name: checkOutUnit.name,
          guest_name: checkOutBooking.resort_ops_guests?.full_name,
          booking_id: checkOutBooking.id,
          transaction_type: 'payment',
          amount: -finalAmount,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: -finalAmount,
          payment_method: checkOutPayment,
          staff_name: localStorage.getItem('emp_name') || 'Staff',
          notes: 'Final checkout payment',
        });
      }

      await from('resort_ops_bookings').update({ check_out: today }).eq('id', checkOutBooking.id);
      await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', checkOutUnit.id);

      // Create housekeeping order if none exists
      const existing = housekeepingOrders.find((o: any) => o.unit_name === checkOutUnit.name);
      if (!existing) {
        await from('housekeeping_orders').insert({
          unit_name: checkOutUnit.name,
          room_type_id: (checkOutUnit as any).room_type_id || null,
          status: 'pending_inspection',
        });
      }

      await logAudit('updated', 'units', checkOutUnit.id, `Checkout: ${checkOutBooking.resort_ops_guests?.full_name} from ${checkOutUnit.name}`);

      qc.invalidateQueries({ queryKey: ['room-transactions', checkOutUnit.id] });
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });

      setCheckOutOpen(false);
      setCheckOutBooking(null);
      setCheckOutUnit(null);
      toast.success('Checkout complete — housekeeping order created');
    } catch {
      toast.error('Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  };

  // Checkout billing summary
  const charges = checkOutTransactions.filter(t => t.total_amount > 0);
  const payments = checkOutTransactions.filter(t => t.total_amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const balance = totalCharges - totalPayments;

  return (
    <div className="min-h-screen bg-navy-texture p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl tracking-wider text-foreground">Reception</h1>
          <p className="font-body text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-red-400">{occupiedUnits.length}</p>
          <p className="font-body text-xs text-red-400/70">Occupied</p>
        </div>
        <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-amber-400">{toCleanUnits.length}</p>
          <p className="font-body text-xs text-amber-400/70">To Clean</p>
        </div>
        <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-emerald-400">{readyUnits.length}</p>
          <p className="font-body text-xs text-emerald-400/70">Ready</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="border border-border rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-foreground">{todayArrivals.length}</p>
          <p className="font-body text-xs text-muted-foreground">Arrivals</p>
        </div>
        <div className="border border-border rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-foreground">{todayDepartures.length}</p>
          <p className="font-body text-xs text-muted-foreground">Departures</p>
        </div>
        <div className="border border-border rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-foreground">{readyUnits.length}</p>
          <p className="font-body text-xs text-muted-foreground">Available</p>
        </div>
      </div>

      {/* ── Arrivals Today ── */}
      {todayArrivals.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-emerald-400 uppercase">🟢 Arrivals Today ({todayArrivals.length})</h2>
          {todayArrivals.map((b: any) => {
            const guest = b.resort_ops_guests;
            const unitName = getUnitNameForBooking(b);
            return (
              <div key={b.id} className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">{unitName}</p>
                  <p className="font-body text-xs text-muted-foreground">{guest?.full_name || 'Guest'} · {b.adults} adult{b.adults > 1 ? 's' : ''}</p>
                  <p className="font-body text-xs text-muted-foreground">{b.platform} · ₱{Number(b.room_rate).toLocaleString()}/night</p>
                </div>
                {canDoEdit && (
                  <Button size="sm" onClick={() => { setCheckInBooking(b); setCheckInModalOpen(true); }}
                    className="font-display text-xs tracking-wider min-h-[44px]">
                    <LogIn className="w-4 h-4 mr-1" /> Check In
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Departures Today ── */}
      {todayDepartures.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-amber-400 uppercase">🟨 Departures Today ({todayDepartures.length})</h2>
          {todayDepartures.map(({ unit, booking }) => {
            const guest = (booking as any)?.resort_ops_guests;
            return (
              <div key={unit.id} className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
                  <p className="font-body text-xs text-muted-foreground">{guest?.full_name || 'Guest'}</p>
                </div>
                {canDoEdit && (
                  <Button size="sm" variant="destructive" onClick={() => {
                    setCheckOutBooking(booking);
                    setCheckOutUnit(unit);
                    setCheckOutPayment('');
                    setCheckOutAmount('');
                    setCheckOutOpen(true);
                  }} className="font-display text-xs tracking-wider min-h-[44px]">
                    <LogOut className="w-4 h-4 mr-1" /> Check Out
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Walk-In / Sell Room ── */}
      {readyUnits.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-xs tracking-wider text-foreground uppercase">Walk-In / Sell Room</h2>
          </div>
          {readyUnits.map((unit: any) => (
            <div key={unit.id} className="border border-emerald-500/30 rounded-lg p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
                  <Badge className="font-body text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Ready</Badge>
                </div>
              </div>
              {canDoEdit && (
                <Button size="sm" variant="outline" onClick={() => {
                  setWalkInUnit(unit);
                  setWalkInForm({ guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: '0', notes: '' });
                  setWalkInOpen(true);
                }} className="font-display text-xs tracking-wider min-h-[44px]">
                  <DollarSign className="w-4 h-4 mr-1" /> Sell
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Quick Room Status ── */}
      <div className="space-y-2">
        <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">Quick Room Status</h2>
        <div className="grid grid-cols-3 gap-2">
          {units.map((unit: any) => {
            const status = getUnitStatus(unit);
            const booking = getActiveBooking(unit);
            const guest = (booking as any)?.resort_ops_guests;
            const borderColor = status === 'occupied' ? 'border-red-500/40' : status === 'to_clean' ? 'border-amber-500/40' : 'border-emerald-500/40';
            const bgColor = status === 'occupied' ? 'bg-red-500/5' : status === 'to_clean' ? 'bg-amber-500/5' : '';
            const dotColor = status === 'occupied' ? '🟥' : status === 'to_clean' ? '🟨' : '🟩';

            return (
              <div key={unit.id} className={`border rounded-lg p-2 text-center ${borderColor} ${bgColor}`}>
                <p className="font-body text-xs">
                  {dotColor} {unit.name}
                </p>
                {guest && (
                  <p className="font-body text-[10px] text-muted-foreground truncate">{guest.full_name}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════ CHECK-IN MODAL (reservation) ══════ */}
      <Dialog open={checkInModalOpen} onOpenChange={setCheckInModalOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">Check-In — {checkInBooking && getUnitNameForBooking(checkInBooking)}</DialogTitle>
          </DialogHeader>
          {checkInBooking && (() => {
            const guest = checkInBooking.resort_ops_guests;
            const nights = Math.max(1, Math.ceil((new Date(checkInBooking.check_out).getTime() - new Date(checkInBooking.check_in).getTime()) / 86400000));
            const rate = Number(checkInBooking.room_rate);
            return (
              <div className="space-y-4">
                <div className="border border-border rounded-lg p-3 bg-secondary space-y-1">
                  <p className="font-display text-sm text-foreground">{guest?.full_name || 'Guest'}</p>
                  <p className="font-body text-xs text-muted-foreground">{guest?.email || ''} {guest?.phone || ''}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm font-body">
                  <div><span className="text-muted-foreground">Room:</span> <span className="text-foreground">{getUnitNameForBooking(checkInBooking)}</span></div>
                  <div><span className="text-muted-foreground">Dates:</span> <span className="text-foreground">{format(new Date(checkInBooking.check_in + 'T00:00:00'), 'MMM d')} – {format(new Date(checkInBooking.check_out + 'T00:00:00'), 'MMM d')}</span></div>
                  <div><span className="text-muted-foreground">Nights:</span> <span className="text-foreground">{nights}</span></div>
                  <div><span className="text-muted-foreground">Guests:</span> <span className="text-foreground">{checkInBooking.adults} Adult{checkInBooking.adults > 1 ? 's' : ''}{checkInBooking.children > 0 ? `, ${checkInBooking.children} Child` : ''}</span></div>
                  <div><span className="text-muted-foreground">Rate:</span> <span className="text-foreground">₱{rate.toLocaleString()}/night</span></div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="text-foreground">₱{(nights * rate).toLocaleString()}</span></div>
                  <div><span className="text-muted-foreground">Platform:</span> <span className="text-foreground">{checkInBooking.platform}</span></div>
                  {Number(checkInBooking.paid_amount) > 0 && (
                    <div><span className="text-muted-foreground">Paid:</span> <span className="text-green-400">₱{Number(checkInBooking.paid_amount).toLocaleString()}</span></div>
                  )}
                </div>
                {checkInBooking.special_requests && (
                  <div className="border border-border rounded-lg p-2 bg-secondary">
                    <p className="font-body text-xs text-muted-foreground">Special Requests</p>
                    <p className="font-body text-sm text-foreground">{checkInBooking.special_requests}</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInModalOpen(false)} className="font-display text-xs tracking-wider">Cancel</Button>
            <Button onClick={handleReservationCheckIn} disabled={checkingIn} className="font-display text-xs tracking-wider">
              {checkingIn ? 'Checking in...' : 'Confirm Check-In'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ WALK-IN MODAL ══════ */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">Sell Room — {walkInUnit?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={walkInForm.guestName} onChange={e => setWalkInForm(p => ({ ...p, guestName: e.target.value }))}
              placeholder="Guest full name *" className="bg-secondary border-border text-foreground font-body" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-body text-xs text-muted-foreground">Check-in</label>
                <Input type="date" value={walkInForm.checkIn} onChange={e => setWalkInForm(p => ({ ...p, checkIn: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Check-out *</label>
                <Input type="date" value={walkInForm.checkOut} onChange={e => setWalkInForm(p => ({ ...p, checkOut: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-body text-xs text-muted-foreground">Adults</label>
                <Input type="number" value={walkInForm.adults} onChange={e => setWalkInForm(p => ({ ...p, adults: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Children</label>
                <Input type="number" value={walkInForm.children} onChange={e => setWalkInForm(p => ({ ...p, children: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Rate/night</label>
                <Input type="number" value={walkInForm.roomRate} onChange={e => setWalkInForm(p => ({ ...p, roomRate: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
            </div>
            {walkInForm.checkOut && walkInForm.checkOut > walkInForm.checkIn && (
              <p className="font-body text-sm text-foreground text-center">
                {Math.ceil((new Date(walkInForm.checkOut).getTime() - new Date(walkInForm.checkIn).getTime()) / 86400000)} nights × ₱{Number(walkInForm.roomRate).toLocaleString()} = <strong>₱{(Math.ceil((new Date(walkInForm.checkOut).getTime() - new Date(walkInForm.checkIn).getTime()) / 86400000) * Number(walkInForm.roomRate)).toLocaleString()}</strong>
              </p>
            )}
            <Textarea value={walkInForm.notes} onChange={e => setWalkInForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notes (optional)" className="bg-secondary border-border text-foreground font-body text-sm min-h-[50px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalkInOpen(false)} className="font-display text-xs tracking-wider">Cancel</Button>
            <Button onClick={handleWalkIn} disabled={walkingIn} className="font-display text-xs tracking-wider">
              {walkingIn ? 'Processing...' : 'Complete Check-In'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ CHECK-OUT MODAL ══════ */}
      <Dialog open={checkOutOpen} onOpenChange={setCheckOutOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">Checkout — {checkOutUnit?.name}</DialogTitle>
          </DialogHeader>
          {checkOutBooking && (() => {
            const guest = checkOutBooking.resort_ops_guests;
            const nights = Math.max(1, Math.ceil((new Date(checkOutBooking.check_out).getTime() - new Date(checkOutBooking.check_in).getTime()) / 86400000));
            const rate = Number(checkOutBooking.room_rate);
            return (
              <div className="space-y-4">
                <div className="border border-border rounded-lg p-3 bg-secondary space-y-1">
                  <p className="font-display text-sm text-foreground">{guest?.full_name || 'Guest'}</p>
                  <p className="font-body text-xs text-muted-foreground">{nights} night{nights !== 1 ? 's' : ''} × ₱{rate.toLocaleString()}/night = ₱{(nights * rate).toLocaleString()}</p>
                </div>

                {charges.length > 0 && (
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
                )}

                <Separator />

                {payments.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Payments Received</p>
                    {payments.map(t => (
                      <div key={t.id} className="flex justify-between font-body text-sm">
                        <span className="text-muted-foreground truncate flex-1">{t.payment_method}</span>
                        <span className="text-green-400">₱{Math.abs(t.total_amount).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-display text-sm">
                      <span className="text-foreground">Total Paid</span>
                      <span className="text-green-400">₱{totalPayments.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between font-display text-lg tracking-wider">
                  <span className="text-foreground">Balance</span>
                  <span className={balance > 0 ? 'text-destructive' : 'text-green-400'}>
                    ₱{Math.abs(balance).toLocaleString()}
                  </span>
                </div>

                {balance > 0 && (
                  <div className="space-y-3 border border-border rounded-lg p-3">
                    <p className="font-display text-xs tracking-wider text-foreground uppercase">Final Payment</p>
                    <Select onValueChange={setCheckOutPayment} value={checkOutPayment}>
                      <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                        <SelectValue placeholder="Payment method" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {activePM.map(m => (
                          <SelectItem key={m.id} value={m.name} className="text-foreground font-body">{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={checkOutAmount} onChange={e => setCheckOutAmount(e.target.value)}
                      placeholder={`₱${balance.toLocaleString()}`}
                      className="bg-secondary border-border text-foreground font-body" />
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckOutOpen(false)} className="font-display text-xs tracking-wider">Cancel</Button>
            <Button onClick={handleCheckOut} disabled={checkingOut} variant="destructive" className="font-display text-xs tracking-wider">
              {checkingOut ? 'Processing...' : 'Confirm Checkout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReceptionPage;
