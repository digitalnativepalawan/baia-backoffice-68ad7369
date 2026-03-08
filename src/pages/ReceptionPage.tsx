import { useState, useEffect } from 'react';
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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ArrowLeft, LogIn, LogOut, DollarSign, BedDouble, MapPin, Car, Bike, Palmtree, UtensilsCrossed, ClipboardList, Sparkles, Receipt, ChevronDown, ChevronUp, CheckCircle, Clock, ShieldCheck, Eye } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import RoomsDashboard from '@/components/admin/RoomsDashboard';
import AddPaymentModal from '@/components/rooms/AddPaymentModal';
import HousekeeperPickerModal from '@/components/rooms/HousekeeperPickerModal';
import PasswordConfirmModal from '@/components/housekeeping/PasswordConfirmModal';
import HousekeepingInspection from '@/components/admin/HousekeepingInspection';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useRoomTransactions } from '@/hooks/useRoomTransactions';
import { canEdit, canManage, hasAccess } from '@/lib/permissions';
import { logAudit } from '@/lib/auditLog';

const from = (table: string) => supabase.from(table as any);

/** Inline bill summary for a unit */
const InlineBill = ({ unitId }: { unitId: string }) => {
  const { data: txns = [], isLoading } = useRoomTransactions(unitId);
  if (isLoading) return <p className="font-body text-xs text-muted-foreground py-2">Loading...</p>;
  if (txns.length === 0) return <p className="font-body text-xs text-muted-foreground py-2">No transactions</p>;
  const charges = txns.filter(t => t.total_amount > 0);
  const payments = txns.filter(t => t.total_amount < 0);
  const totalC = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalP = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const bal = totalC - totalP;
  return (
    <div className="border border-border rounded-lg p-2 bg-secondary space-y-1 mt-1">
      {txns.slice(0, 8).map(t => (
        <div key={t.id} className="flex justify-between font-body text-[10px]">
          <span className="text-muted-foreground truncate flex-1">{t.notes || t.transaction_type.replace('_', ' ')}</span>
          <span className={t.total_amount > 0 ? 'text-foreground' : 'text-green-400'}>
            {t.total_amount > 0 ? '' : '-'}₱{Math.abs(t.total_amount).toLocaleString()}
          </span>
        </div>
      ))}
      {txns.length > 8 && <p className="font-body text-[10px] text-muted-foreground">+{txns.length - 8} more</p>}
      <div className="flex justify-between font-display text-xs tracking-wider pt-1 border-t border-border">
        <span className="text-foreground">Balance</span>
        <span className={bal > 0 ? 'text-destructive' : 'text-green-400'}>₱{Math.abs(bal).toLocaleString()}</span>
      </div>
    </div>
  );
};

/** Compute balance for a unit from transactions */
const useUnitBalance = (unitId: string | null) => {
  const { data: txns = [] } = useRoomTransactions(unitId);
  const totalC = txns.filter(t => t.total_amount > 0).reduce((s, t) => s + t.total_amount, 0);
  const totalP = Math.abs(txns.filter(t => t.total_amount < 0).reduce((s, t) => s + t.total_amount, 0));
  return totalC - totalP;
};

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

const ReceptionPage = ({ embedded = false }: { embedded?: boolean }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = getSession();
  const perms: string[] = session?.permissions || [];
  const isAdmin = perms.includes('admin');
  const canDoEdit = isAdmin || canEdit(perms, 'reception');
  const canDoManage = isAdmin || canManage(perms, 'reception');
  const hasHousekeepingAccess = isAdmin || hasAccess(perms, 'housekeeping');
  const staffName = session?.name || localStorage.getItem('emp_name') || 'Staff';
  const empId = localStorage.getItem('emp_id');

  const today = new Date().toISOString().split('T')[0];

  // Walk-in modal state
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInUnit, setWalkInUnit] = useState<any>(null);
  const [walkInForm, setWalkInForm] = useState({
    guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: '0', notes: '',
  });
  const [walkingIn, setWalkingIn] = useState(false);

  // Check-in modal state (manage only)
  const [checkInBooking, setCheckInBooking] = useState<any>(null);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // Check-out modal state
  const [checkOutBooking, setCheckOutBooking] = useState<any>(null);
  const [checkOutUnit, setCheckOutUnit] = useState<any>(null);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [checkOutPayment, setCheckOutPayment] = useState('');
  const [checkOutAmount, setCheckOutAmount] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkOutHousekeeper, setCheckOutHousekeeper] = useState('');

  // Add Payment modal state
  const [paymentUnit, setPaymentUnit] = useState<any>(null);
  const [paymentBooking, setPaymentBooking] = useState<any>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // Housekeeper picker state
  const [hkPickerOpen, setHkPickerOpen] = useState(false);
  const [hkTargetUnit, setHkTargetUnit] = useState<any>(null);

  // View Bill state
  const [billUnitId, setBillUnitId] = useState<string | null>(null);

  // Send to clean loading
  const [sendingClean, setSendingClean] = useState<string | null>(null);

  // Housekeeping tracker state
  const [hkTrackerOpen, setHkTrackerOpen] = useState(true);
  const [activeHkOrder, setActiveHkOrder] = useState<any>(null);
  const [acceptingHkOrderId, setAcceptingHkOrderId] = useState<string | null>(null);
  const [forcingReady, setForcingReady] = useState<string | null>(null);

  // Room detail sheet state
  const [detailUnit, setDetailUnit] = useState<any>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const hasDocAccess = isAdmin || hasAccess(perms, 'documents');
  const { data: paymentMethods = [] } = usePaymentMethods();

  // Fetch housekeeping employees for checkout picker
  const { data: hkEmployeesForCheckout = [] } = useQuery({
    queryKey: ['housekeeping-employees'],
    queryFn: async () => {
      const { data: perms } = await supabase.from('employee_permissions')
        .select('employee_id')
        .like('permission', 'housekeeping%');
      const hkIds = new Set((perms || []).map((p: any) => p.employee_id));
      const { data: emps } = await supabase.from('employees')
        .select('id, name, display_name, whatsapp_number')
        .eq('active', true)
        .order('name');
      const all = (emps || []) as any[];
      const filtered = all.filter(e => hkIds.has(e.id));
      return filtered.length > 0 ? filtered : all;
    },
  });
  const activePM = paymentMethods.filter(m => m.is_active && m.name !== 'Charge to Room');

  // Compute balance for payment modal
  const paymentBalance = useUnitBalance(paymentUnit?.id || null);

  // Room types (for base rates)
  const { data: roomTypes = [] } = useQuery({
    queryKey: ['room-types'],
    queryFn: async () => {
      const { data } = await supabase.from('room_types').select('*').order('name');
      return (data || []) as any[];
    },
  });

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

  // All housekeeping orders (for tracker)
  const { data: allHkOrders = [] } = useQuery({
    queryKey: ['housekeeping-orders-all'],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders').select('*').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 5000,
  });

  // Derive latest active order per unit
  const latestHkByUnit = new Map<string, any>();
  allHkOrders.filter((o: any) => o.status !== 'completed').forEach((o: any) => {
    if (!latestHkByUnit.has(o.unit_name)) latestHkByUnit.set(o.unit_name, o);
  });
  const activeHkOrders = Array.from(latestHkByUnit.values());

  // Sync activeHkOrder with latest data
  useEffect(() => {
    if (activeHkOrder) {
      const fresh = allHkOrders.find((o: any) => o.id === activeHkOrder.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(activeHkOrder)) {
        setActiveHkOrder(fresh);
      }
    }
  }, [allHkOrders, activeHkOrder]);

  // Recent orders for all rooms
  const { data: recentOrders = [] } = useQuery({
    queryKey: ['reception-recent-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*')
        .eq('order_type', 'Room')
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Today's tours (guest_tours + tour_bookings)
  const { data: todayTours = [] } = useQuery({
    queryKey: ['reception-tours-today'],
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*').eq('tour_date', today).order('pickup_time');
      return (data || []) as any[];
    },
  });

  const { data: tourBookings = [] } = useQuery({
    queryKey: ['reception-tour-bookings'],
    queryFn: async () => {
      const { data } = await (supabase.from('tour_bookings') as any)
        .select('*')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(20);
      return (data || []) as any[];
    },
  });

  // Guest requests (transport, rentals)
  const { data: guestRequests = [] } = useQuery({
    queryKey: ['reception-guest-requests'],
    queryFn: async () => {
      const { data } = await from('guest_requests').select('*').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(20);
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

  // Today's arrivals
  const todayArrivals = bookings.filter((b: any) => {
    if (b.check_in !== today) return false;
    const unit = units.find((u: any) => {
      const ru = resolveResortUnit(u.name);
      return ru && ru.id === b.unit_id;
    });
    return !unit || getUnitStatus(unit) !== 'occupied';
  });

  // Today's departures
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

  const pendingRequests = guestRequests.filter((r: any) => r.status === 'pending');
  const pendingTourBookings = tourBookings.filter((b: any) => b.status === 'pending');

  const statusColor = (status: string) => {
    switch (status) {
      case 'booked': return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'confirmed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'completed': return 'bg-muted text-muted-foreground';
      case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'pending': return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // ── TOUR/REQUEST ACTION HANDLERS ──
  const parsePriceFromDetails = (details: string): number => {
    const match = details.match(/₱([\d,]+)/);
    return match ? Number(match[1].replace(/,/g, '')) : 0;
  };

  const getRoomInfo = async (roomId: string) => {
    const { data } = await supabase.from('units').select('id, unit_name').eq('id', roomId).maybeSingle();
    return data;
  };

  const updateTourStatus = async (id: string, status: string, tour?: any) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await from('guest_tours').update({ status, confirmed_by: staffName }).eq('id', id);

    // Insert room charge when confirming a guest_tour with a price
    if (status === 'confirmed' && tour && Number(tour.price) > 0 && tour.booking_id) {
      // Look up unit by unit_name
      const { data: unit } = await supabase.from('units').select('id, unit_name').eq('unit_name', tour.unit_name).maybeSingle();
      await (supabase.from('room_transactions') as any).insert({
        unit_id: unit?.id || null,
        unit_name: tour.unit_name || '',
        booking_id: tour.booking_id,
        guest_name: '',
        transaction_type: 'charge',
        amount: Number(tour.price),
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: Number(tour.price),
        payment_method: 'Charge to Room',
        staff_name: staffName,
        notes: `Tour: ${tour.tour_name} (${tour.pax} pax) on ${tour.tour_date}`,
      });
    }

    qc.invalidateQueries({ queryKey: ['reception-tours-today'] });
    toast.success(`Tour ${status}`);
  };

  const confirmTourBooking = async (b: any) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({
      status: 'confirmed',
      confirmed_by: staffName,
    }).eq('id', b.id);

    // Insert room charge
    if (Number(b.price) > 0 && b.room_id) {
      const room = await getRoomInfo(b.room_id);
      await (supabase.from('room_transactions') as any).insert({
        unit_id: b.room_id,
        unit_name: room?.unit_name || '',
        booking_id: b.booking_id,
        guest_name: b.guest_name || '',
        transaction_type: 'charge',
        amount: Number(b.price),
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: Number(b.price),
        payment_method: 'Charge to Room',
        staff_name: staffName,
        notes: `Tour: ${b.tour_name} (${b.pax} pax) on ${b.tour_date}${b.pickup_time ? ` pickup ${b.pickup_time}` : ''}`,
      });
    }

    qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
    toast.success('Tour booking confirmed & charged to room');
  };

  const cancelTourBooking = async (id: string) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({
      status: 'cancelled',
      confirmed_by: staffName,
    }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
    toast.success('Tour booking cancelled');
  };

  const completeTourBooking = async (id: string) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({ status: 'completed' }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
    toast.success('Tour completed');
  };

  const updateRequestStatus = async (id: string, status: string, req?: any) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await from('guest_requests').update({ status, confirmed_by: staffName }).eq('id', id);

    // Insert room charge when confirming a request with a price
    if (status === 'confirmed' && req) {
      const price = parsePriceFromDetails(req.details);
      if (price > 0 && req.room_id) {
        const room = await getRoomInfo(req.room_id);
        await (supabase.from('room_transactions') as any).insert({
          unit_id: req.room_id,
          unit_name: room?.unit_name || '',
          booking_id: req.booking_id,
          guest_name: req.guest_name || '',
          transaction_type: 'charge',
          amount: price,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: price,
          payment_method: 'Charge to Room',
          staff_name: staffName,
          notes: `${req.request_type}: ${req.details}`,
        });
      }
    }

    qc.invalidateQueries({ queryKey: ['reception-guest-requests'] });
    toast.success(`Request ${status}`);
  };

  // ── FORCE READY (manage only) ──
  const handleForceReady = async (unit: any) => {
    if (!canDoManage) { toast.error('Manage access required'); return; }
    setForcingReady(unit.id);
    try {
      await supabase.from('units').update({ status: 'ready' } as any).eq('id', unit.id);
      // Complete any active housekeeping orders for this unit
      const hkOrder = activeHkOrders.find((o: any) => o.unit_name === unit.name);
      if (hkOrder) {
        await from('housekeeping_orders').update({
          status: 'completed',
          cleaning_notes: `Force-marked ready by ${staffName}`,
          completed_by_name: staffName,
          cleaning_completed_at: new Date().toISOString(),
        } as any).eq('id', hkOrder.id);
      }
      await logAudit('updated', 'units', unit.id, `Force-marked ${unit.name} as Ready by ${staffName}`);
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      toast.success(`${unit.name} marked as Ready`);
    } catch {
      toast.error('Failed to mark ready');
    } finally {
      setForcingReady(null);
    }
  };

  // ── HOUSEKEEPING ACCEPT (for multi-role staff) ──
  const handleHkAccept = async (employee: { id: string; name: string; display_name: string }) => {
    if (!acceptingHkOrderId) return;
    try {
      await from('housekeeping_orders').update({
        accepted_by: employee.id,
        accepted_by_name: employee.display_name || employee.name,
        accepted_at: new Date().toISOString(),
        status: 'pending_inspection',
      } as any).eq('id', acceptingHkOrderId);
      localStorage.setItem('emp_id', employee.id);
      localStorage.setItem('emp_name', employee.name);
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      toast.success(`Accepted — ${employee.display_name || employee.name}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept');
    }
    setAcceptingHkOrderId(null);
  };


  const handleReservationCheckIn = async () => {
    if (!checkInBooking) return;
    setCheckingIn(true);
    try {
      const unitName = getUnitNameForBooking(checkInBooking);
      const unit = units.find((u: any) => u.name === unitName);
      if (!unit) throw new Error('Unit not found');
      if (getUnitStatus(unit) === 'to_clean') throw new Error('Complete housekeeping first');

      const guestFullName = checkInBooking.resort_ops_guests?.full_name || '';
      const roomPassword = guestFullName.split(' ').pop()?.toLowerCase() || 'guest';
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

  // ── WALK-IN CHECK-IN (edit level) ──
  const handleWalkIn = async () => {
    if (!walkInUnit || !walkInForm.guestName.trim() || !walkInForm.checkOut) {
      toast.error('Guest name and check-out date required');
      return;
    }
    setWalkingIn(true);
    try {
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

      const roomPassword = walkInForm.guestName.trim().split(' ').pop()?.toLowerCase() || 'guest';
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

  // ── SEND TO CLEAN (with housekeeper picker) ──
  const handleSendToCleanWithPicker = (unit: any) => {
    setHkTargetUnit(unit);
    setHkPickerOpen(true);
  };

  const handleSendToClean = async (unit: any, assignedTo?: string, assignedName?: string) => {
    setSendingClean(unit.id);
    try {
      await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', unit.id);
      const existing = activeHkOrders.find((o: any) => o.unit_name === unit.name);
      if (!existing) {
        await from('housekeeping_orders').insert({
          unit_name: unit.name,
          room_type_id: (unit as any).room_type_id || null,
          status: 'pending_inspection',
          assigned_to: assignedTo || null,
        });
      } else if (assignedTo) {
        await from('housekeeping_orders').update({ assigned_to: assignedTo }).eq('id', existing.id);
      }
      await logAudit('updated', 'units', unit.id, `Sent ${unit.name} to clean${assignedName ? ` (assigned: ${assignedName})` : ''}`);
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      toast.success(`${unit.name} assigned to ${assignedName || 'housekeeping'}`);
    } catch {
      toast.error('Failed to send to clean');
    } finally {
      setSendingClean(null);
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
          staff_name: staffName,
          notes: 'Final checkout payment',
        });
      }

      await from('resort_ops_bookings').update({ check_out: today }).eq('id', checkOutBooking.id);
      await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', checkOutUnit.id);

      const existing = activeHkOrders.find((o: any) => o.unit_name === checkOutUnit.name);
      const hkEmp = hkEmployeesForCheckout.find((e: any) => e.id === checkOutHousekeeper);

      if (!existing) {
        await from('housekeeping_orders').insert({
          unit_name: checkOutUnit.name,
          room_type_id: (checkOutUnit as any).room_type_id || null,
          status: 'pending_inspection',
          assigned_to: checkOutHousekeeper || null,
          accepted_by: checkOutHousekeeper || null,
          accepted_by_name: hkEmp ? (hkEmp.display_name || hkEmp.name) : '',
          accepted_at: checkOutHousekeeper ? new Date().toISOString() : null,
        });
      } else if (checkOutHousekeeper) {
        await from('housekeeping_orders').update({
          assigned_to: checkOutHousekeeper,
          accepted_by: checkOutHousekeeper,
          accepted_by_name: hkEmp ? (hkEmp.display_name || hkEmp.name) : '',
          accepted_at: new Date().toISOString(),
        }).eq('id', existing.id);
      }

      // Send WhatsApp notification
      if (hkEmp && hkEmp.whatsapp_number) {
        const { openWhatsApp } = await import('@/lib/messenger');
        const gName = checkOutBooking.resort_ops_guests?.full_name || 'Guest';
        const msg = `🧹 *Room ${checkOutUnit.name} needs cleaning*\n\nGuest "${gName}" has checked out.\nAssigned to you by ${staffName}.\n\nPlease start when ready.`;
        openWhatsApp(hkEmp.whatsapp_number, msg);
      }

      // Cancel any pending guest requests & tours for this booking
      if (checkOutBooking.id) {
        await (from('guest_requests') as any)
          .update({ status: 'cancelled' })
          .eq('booking_id', checkOutBooking.id)
          .eq('status', 'pending');
        await (from('guest_tours') as any)
          .update({ status: 'cancelled' })
          .eq('booking_id', checkOutBooking.id)
          .eq('status', 'pending');
      }

      await logAudit('updated', 'units', checkOutUnit.id, `Checkout: ${checkOutBooking.resort_ops_guests?.full_name} from ${checkOutUnit.name}${hkEmp ? ` — assigned to ${hkEmp.display_name || hkEmp.name}` : ''}`);

      qc.invalidateQueries({ queryKey: ['room-transactions', checkOutUnit.id] });
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      qc.invalidateQueries({ queryKey: ['all-requests-experiences'] });
      qc.invalidateQueries({ queryKey: ['all-tours-experiences'] });
      qc.invalidateQueries({ queryKey: ['tour-bookings-experiences'] });
      qc.invalidateQueries({ queryKey: ['reception-guest-requests'] });
      qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
      qc.invalidateQueries({ queryKey: ['reception-tours-today'] });

      setCheckOutOpen(false);
      setCheckOutBooking(null);
      setCheckOutUnit(null);
      setCheckOutHousekeeper('');
      toast.success(`Checkout complete${hkEmp ? ` — ${hkEmp.display_name || hkEmp.name} notified` : ''}`);
    } catch {
      toast.error('Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  };

  // Checkout billing
  const charges = checkOutTransactions.filter(t => t.total_amount > 0);
  const payments = checkOutTransactions.filter(t => t.total_amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const balance = totalCharges - totalPayments;

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-navy-texture p-4 max-w-2xl mx-auto'}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-display text-xl tracking-wider text-foreground">Reception</h1>
            <p className="font-body text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
          </div>
        </div>
      )}

      {/* ── Summary ── */}
      <div className="grid grid-cols-3 gap-2 mb-4">
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

      {/* ── Current Guests (all occupied rooms) ── */}
      {occupiedUnits.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-foreground uppercase">🏨 Current Guests ({occupiedUnits.length})</h2>
          {occupiedUnits.map((unit: any) => {
            const booking = getActiveBooking(unit);
            const guest = (booking as any)?.resort_ops_guests;
            const nights = booking ? Math.max(1, Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000)) : 0;
            const roomOrders = recentOrders.filter((o: any) => o.location_detail === unit.name);
            const isDepartingToday = booking?.check_out === today;

            return (
              <div key={unit.id} className={`border rounded-lg p-3 space-y-2 ${isDepartingToday ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
                    <p className="font-body text-xs text-foreground">{guest?.full_name || 'Guest'}</p>
                    <p className="font-body text-[10px] text-muted-foreground">
                      {booking && `${format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')} – ${format(new Date(booking.check_out + 'T00:00:00'), 'MMM d')} · ${nights} night${nights !== 1 ? 's' : ''}`}
                      {booking && ` · ${booking.platform}`}
                    </p>
                    {booking && Number(booking.room_rate) > 0 && (
                      <p className="font-body text-[10px] text-muted-foreground">₱{Number(booking.room_rate).toLocaleString()}/night · {booking.adults} adult{booking.adults > 1 ? 's' : ''}{booking.children > 0 ? `, ${booking.children} child` : ''}</p>
                    )}
                    {guest?.phone && <p className="font-body text-[10px] text-muted-foreground">📞 {guest.phone}</p>}
                    {guest?.email && <p className="font-body text-[10px] text-muted-foreground">✉️ {guest.email}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`font-body text-[10px] ${isDepartingToday ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-red-500/20 text-red-400 border-red-500/40'}`}>
                      {isDepartingToday ? 'Departing' : 'Occupied'}
                    </Badge>
                    {roomOrders.length > 0 && (
                      <span className="font-body text-[10px] text-muted-foreground flex items-center gap-1">
                        <UtensilsCrossed className="w-3 h-3" /> {roomOrders.length} order{roomOrders.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                {canDoEdit && isDepartingToday && (
                  <Button size="sm" variant="destructive" onClick={() => {
                    setCheckOutBooking(booking);
                    setCheckOutUnit(unit);
                    setCheckOutPayment('');
                    setCheckOutAmount('');
                    setCheckOutOpen(true);
                  }} className="font-display text-xs tracking-wider min-h-[36px]">
                    <LogOut className="w-4 h-4 mr-1" /> Check Out
                  </Button>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {canDoEdit && booking && (
                    <Button size="sm" variant="outline" onClick={() => {
                      setPaymentUnit(unit);
                      setPaymentBooking(booking);
                      setPaymentOpen(true);
                    }} className="font-display text-[10px] tracking-wider min-h-[32px]">
                      <DollarSign className="w-3 h-3 mr-0.5" /> Pay
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setBillUnitId(billUnitId === unit.id ? null : unit.id)}
                    className="font-display text-[10px] tracking-wider min-h-[32px]">
                    <Receipt className="w-3 h-3 mr-0.5" /> Bill {billUnitId === unit.id ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                  </Button>
                   {canDoEdit && (
                     <Button size="sm" variant="outline" onClick={() => handleSendToCleanWithPicker(unit)}
                       disabled={sendingClean === unit.id}
                       className="font-display text-[10px] tracking-wider min-h-[32px]">
                       <Sparkles className="w-3 h-3 mr-0.5" /> {sendingClean === unit.id ? '...' : 'Clean'}
                     </Button>
                   )}
                   <Button size="sm" variant="outline" onClick={() => { setDetailUnit(unit); setDetailSheetOpen(true); }}
                     className="font-display text-[10px] tracking-wider min-h-[32px]">
                     <Eye className="w-3 h-3 mr-0.5" /> Details
                   </Button>
                 </div>
                 {billUnitId === unit.id && <InlineBill unitId={unit.id} />}
              </div>
            );
          })}
        </div>
      )}

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

      {/* ── Walk-In / Sell Room (edit level) ── */}
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
                  const rt = roomTypes.find((r: any) => r.id === unit.room_type_id);
                  const defaultRate = rt?.base_rate ? String(rt.base_rate) : '0';
                  setWalkInForm({ guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: defaultRate, notes: '' });
                  setWalkInOpen(true);
                }} className="font-display text-xs tracking-wider min-h-[44px]">
                  <DollarSign className="w-4 h-4 mr-1" /> Sell
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tours & Activities Today (with action buttons) ── */}
      {(todayTours.length > 0 || tourBookings.length > 0) && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">🏝️ Tours & Activities ({todayTours.length + pendingTourBookings.length})</h2>
          {todayTours.map((tour: any) => (
            <div key={tour.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <p className="font-display text-sm text-foreground tracking-wider">{tour.tour_name}</p>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    {tour.pickup_time && `${tour.pickup_time} · `}{tour.unit_name} · {tour.pax} pax
                  </p>
                  {tour.provider && <p className="font-body text-xs text-muted-foreground">Provider: {tour.provider}</p>}
                </div>
                <Badge className={`font-body text-xs ${statusColor(tour.status)}`}>{tour.status}</Badge>
              </div>
              {canDoEdit && tour.status !== 'completed' && tour.status !== 'cancelled' && (
                <div className="flex gap-2">
                  {tour.status === 'booked' && (
                    <Button size="sm" variant="outline" onClick={() => updateTourStatus(tour.id, 'confirmed', tour)}
                      className="font-display text-xs tracking-wider min-h-[36px]">Confirm</Button>
                  )}
                  <Button size="sm" onClick={() => updateTourStatus(tour.id, 'completed')}
                    className="font-display text-xs tracking-wider min-h-[36px]">
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Complete
                  </Button>
                </div>
              )}
            </div>
          ))}
          {pendingTourBookings.map((b: any) => (
            <div key={b.id} className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Palmtree className="w-3.5 h-3.5 text-amber-400" />
                    <p className="font-display text-sm text-foreground tracking-wider">{b.tour_name}</p>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    {b.tour_date && format(new Date(b.tour_date + 'T00:00:00'), 'MMM d')} · {b.guest_name} · {b.pax} pax
                  </p>
                  {Number(b.price) > 0 && <p className="font-body text-xs text-foreground">₱{Number(b.price).toLocaleString()}</p>}
                </div>
                <Badge className={`font-body text-xs ${statusColor('pending')}`}>pending</Badge>
              </div>
              {canDoEdit && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => confirmTourBooking(b)}
                    className="font-display text-xs tracking-wider min-h-[36px]">Confirm</Button>
                  <Button size="sm" variant="destructive" onClick={() => cancelTourBooking(b.id)}
                    className="font-display text-xs tracking-wider min-h-[36px]">Cancel</Button>
                </div>
              )}
            </div>
          ))}
          {/* Show confirmed tour bookings with Complete button */}
          {tourBookings.filter((b: any) => b.status === 'confirmed').map((b: any) => (
            <div key={b.id} className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Palmtree className="w-3.5 h-3.5 text-emerald-400" />
                    <p className="font-display text-sm text-foreground tracking-wider">{b.tour_name}</p>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    {b.tour_date && format(new Date(b.tour_date + 'T00:00:00'), 'MMM d')} · {b.guest_name} · {b.pax} pax
                  </p>
                </div>
                <Badge className={`font-body text-xs ${statusColor('confirmed')}`}>confirmed</Badge>
              </div>
              {canDoEdit && (
                <Button size="sm" onClick={() => completeTourBooking(b.id)}
                  className="font-display text-xs tracking-wider min-h-[36px]">
                  <CheckCircle className="w-3.5 h-3.5 mr-1" /> Complete
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Guest Requests (with action buttons) ── */}
      {guestRequests.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">
            📋 Guest Requests ({pendingRequests.length} pending)
          </h2>
          {guestRequests.slice(0, 10).map((req: any) => (
            <div key={req.id} className={`border rounded-lg p-3 space-y-2 ${req.status === 'pending' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">{req.request_type}</p>
                  <p className="font-body text-xs text-muted-foreground">{req.guest_name} · {req.details}</p>
                  <p className="font-body text-[10px] text-muted-foreground">{format(new Date(req.created_at), 'MMM d, h:mm a')}</p>
                </div>
                <Badge className={`font-body text-xs ${statusColor(req.status)}`}>{req.status}</Badge>
              </div>
              {canDoEdit && req.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateRequestStatus(req.id, 'confirmed', req)}
                    className="font-display text-xs tracking-wider min-h-[36px]">Confirm</Button>
                  <Button size="sm" variant="destructive" onClick={() => updateRequestStatus(req.id, 'cancelled')}
                    className="font-display text-xs tracking-wider min-h-[36px]">Cancel</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Recent Room Orders ── */}
      {recentOrders.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">
            🍽️ Recent Room Orders
          </h2>
          {recentOrders.slice(0, 8).map((order: any) => (
            <div key={order.id} className="border border-border rounded-lg p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">{order.location_detail}</p>
                  <p className="font-body text-xs text-muted-foreground">{order.guest_name} · ₱{Number(order.total).toLocaleString()}</p>
                  <p className="font-body text-[10px] text-muted-foreground">{format(new Date(order.created_at), 'MMM d, h:mm a')}</p>
                </div>
                <Badge className={`font-body text-xs ${order.status === 'Served' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : order.status === 'New' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-muted text-muted-foreground'}`}>
                  {order.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Quick Room Status ── */}
      <div className="space-y-2 mb-6">
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
                {status === 'to_clean' && canDoManage && (
                  <Button size="sm" variant="outline" onClick={() => handleForceReady(unit)}
                    disabled={forcingReady === unit.id}
                    className="font-display text-[9px] tracking-wider min-h-[24px] h-6 px-1.5 mt-1 w-full border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                    <ShieldCheck className="w-3 h-3 mr-0.5" /> {forcingReady === unit.id ? '...' : 'Force Ready'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 🧹 Needs Cleaning — Live Housekeeping Progress ── */}
      {activeHkOrders.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-amber-400 uppercase">
            🧹 Needs Cleaning ({activeHkOrders.length})
          </h2>
          {activeHkOrder ? (
            <HousekeepingInspection
              order={activeHkOrder}
              onClose={() => {
                setActiveHkOrder(null);
                qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
                qc.invalidateQueries({ queryKey: ['rooms-units'] });
              }}
            />
          ) : (
            activeHkOrders.map((order: any) => {
              const hkStatusLabel = order.status === 'pending_inspection' ? 'Pending' : order.status === 'inspecting' ? 'Inspecting' : order.status === 'cleaning' ? 'Cleaning' : order.status;
              const hkStatusColor = order.status === 'pending_inspection' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : order.status === 'cleaning' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-muted text-muted-foreground';
              const isMyOrder = order.accepted_by === empId;
              const timeSince = order.created_at ? `${Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000)} min ago` : '';

              return (
                <div key={order.id} className={`border rounded-lg p-3 bg-card space-y-2 ${
                  order.priority === 'urgent' ? 'border-destructive/60 bg-destructive/5' : 'border-amber-500/30 bg-amber-500/5'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-display text-sm tracking-wider text-foreground">{order.unit_name}</span>
                      {order.accepted_by_name ? (
                        <p className="font-body text-xs text-foreground">👤 {order.accepted_by_name}</p>
                      ) : (
                        <p className="font-body text-xs text-amber-400">⚠ Unassigned</p>
                      )}
                      <p className="font-body text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {timeSince}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={`font-body text-xs ${hkStatusColor}`}>{hkStatusLabel}</Badge>
                      {order.priority === 'urgent' && (
                        <Badge className="bg-destructive text-destructive-foreground font-body text-[10px]">Urgent</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!order.accepted_by && (
                      <Button size="sm" variant="outline" onClick={() => {
                        setHkTargetUnit(units.find((u: any) => u.name === order.unit_name) || { id: '', name: order.unit_name });
                        setHkPickerOpen(true);
                      }} className="font-display text-[10px] tracking-wider min-h-[32px] border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                        Assign
                      </Button>
                    )}
                    {order.accepted_by_name && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        const emp = hkEmployeesForCheckout.find((e: any) => e.id === order.accepted_by);
                        if (emp?.whatsapp_number) {
                          import('@/lib/messenger').then(({ openWhatsApp }) => {
                            openWhatsApp(emp.whatsapp_number, `Reminder: Room ${order.unit_name} still needs cleaning. Please update status.`);
                          });
                        } else {
                          toast.info('No WhatsApp number for this staff member');
                        }
                      }} className="font-display text-[10px] tracking-wider min-h-[32px]">
                        📲 Remind
                      </Button>
                    )}
                    {canDoManage && (
                      <Button size="sm" variant="outline" onClick={() => handleForceReady(units.find((u: any) => u.name === order.unit_name) || { id: '', name: order.unit_name })}
                        disabled={!!forcingReady}
                        className="font-display text-[10px] tracking-wider min-h-[32px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                        <ShieldCheck className="w-3 h-3 mr-0.5" /> Force Ready
                      </Button>
                    )}
                    {hasHousekeepingAccess && !order.accepted_by && (
                      <Button size="sm" onClick={() => setAcceptingHkOrderId(order.id)}
                        className="font-display text-[10px] tracking-wider min-h-[32px]">
                        Accept with PIN
                      </Button>
                    )}
                    {hasHousekeepingAccess && isMyOrder && (
                      <Button size="sm" variant="outline" onClick={() => setActiveHkOrder(order)}
                        className="font-display text-[10px] tracking-wider min-h-[32px]">
                        Continue →
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}


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

      {/* ══════ CHECK-OUT MODAL (manage only) ══════ */}
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
                {/* Assign Housekeeper */}
                <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
                  <p className="font-display text-xs tracking-wider text-amber-400 uppercase">🧹 Assign Housekeeper</p>
                  <Select onValueChange={setCheckOutHousekeeper} value={checkOutHousekeeper}>
                    <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                      <SelectValue placeholder="Select housekeeper (optional)" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {hkEmployeesForCheckout.map((e: any) => (
                        <SelectItem key={e.id} value={e.id} className="text-foreground font-body">
                          {e.display_name || e.name}{e.whatsapp_number ? ' 📱' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {checkOutHousekeeper && (() => {
                    const emp = hkEmployeesForCheckout.find((e: any) => e.id === checkOutHousekeeper);
                    return emp?.whatsapp_number ? (
                      <p className="font-body text-xs text-emerald-400">✓ Will notify via WhatsApp on checkout</p>
                    ) : (
                      <p className="font-body text-xs text-muted-foreground">No WhatsApp number — assignment only</p>
                    );
                  })()}
                </div>
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

      {/* ══════ ADD PAYMENT MODAL ══════ */}
      {paymentUnit && (
        <AddPaymentModal
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          unitId={paymentUnit.id}
          unitName={paymentUnit.name}
          guestName={paymentBooking?.resort_ops_guests?.full_name || null}
          bookingId={paymentBooking?.id || null}
          currentBalance={paymentBalance}
        />
      )}

      {/* ══════ HOUSEKEEPER PICKER MODAL ══════ */}
      <HousekeeperPickerModal
        open={hkPickerOpen}
        onOpenChange={setHkPickerOpen}
        onSelect={(empId, empName) => {
          if (hkTargetUnit) {
            handleSendToClean(hkTargetUnit, empId, empName);
          }
        }}
      />

      {/* ══════ HOUSEKEEPING ACCEPT PIN MODAL ══════ */}
      <PasswordConfirmModal
        open={!!acceptingHkOrderId}
        onClose={() => setAcceptingHkOrderId(null)}
        onConfirm={handleHkAccept}
        title="Accept Assignment"
        description="Enter your name and PIN to accept this housekeeping assignment."
      />
      {/* ══════ ROOM DETAIL SHEET ══════ */}
      <Sheet open={detailSheetOpen} onOpenChange={(open) => { setDetailSheetOpen(open); if (!open) setDetailUnit(null); }}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="font-display text-lg tracking-wider">{detailUnit?.name} — Room Details</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {detailUnit && (
              <RoomsDashboard
                readOnly={!canDoEdit}
                canViewDocuments={hasDocAccess}
                initialUnit={detailUnit}
                singleUnitMode
                onClose={() => { setDetailSheetOpen(false); setDetailUnit(null); }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ReceptionPage;
