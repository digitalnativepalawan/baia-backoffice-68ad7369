import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResortProfile } from '@/hooks/useResortProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LogOut, UtensilsCrossed, MapPin, Car, Bike, MessageSquare, Star, Receipt, ArrowLeft, ChevronRight, ClipboardList, Calendar, Clock, Users, StickyNote } from 'lucide-react';
import { setGuestSession } from '@/hooks/useGuestSession';

const GUEST_PORTAL_KEY = 'guest_portal_session';

interface GuestPortalSession {
  booking_id: string;
  room_id: string;
  room_name: string;
  guest_name: string;
  check_out: string;
  expires: number;
}

const getPortalSession = (): GuestPortalSession | null => {
  try {
    const s = sessionStorage.getItem(GUEST_PORTAL_KEY);
    if (!s) return null;
    const parsed: GuestPortalSession = JSON.parse(s);
    if (parsed.expires < Date.now()) { sessionStorage.removeItem(GUEST_PORTAL_KEY); return null; }
    return parsed;
  } catch { sessionStorage.removeItem(GUEST_PORTAL_KEY); return null; }
};

const GuestPortal = () => {
  const navigate = useNavigate();
  const { data: profile } = useResortProfile();
  const qc = useQueryClient();
  const [session, setSession] = useState<GuestPortalSession | null>(getPortalSession);
  const [view, setView] = useState<'dashboard' | 'menu' | 'tours' | 'transport' | 'rentals' | 'request' | 'review' | 'bill' | 'orders'>('dashboard');

  // Login state
  const [roomName, setRoomName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: allUnits = [] } = useQuery({
    queryKey: ['active-units-portal'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('id, unit_name').eq('active', true).order('unit_name');
      return data || [];
    },
    enabled: !session,
  });

  const handleLogin = async () => {
    if (!roomName || !lastName.trim()) return;
    setLoading(true);
    try {
      const unit = allUnits.find(u => u.unit_name === roomName);
      if (!unit) { toast.error('Room not found'); setLoading(false); return; }

      const { data: opsUnit } = await supabase.from('resort_ops_units').select('id').ilike('name', roomName.trim()).maybeSingle();
      if (!opsUnit) { toast.error('Room not found'); setLoading(false); return; }

      const today = new Date().toISOString().split('T')[0];
      const { data: booking } = await supabase
        .from('resort_ops_bookings')
        .select('id, check_in, check_out, resort_ops_guests(full_name)')
        .eq('unit_id', opsUnit.id)
        .lte('check_in', today)
        .gte('check_out', today)
        .maybeSingle();

      if (!booking) { toast.error('No active booking found for this room'); setLoading(false); return; }

      const guestName = (booking as any).resort_ops_guests?.full_name || '';
      const lastNameFromBooking = guestName.split(' ').pop()?.toLowerCase() || '';
      if (lastNameFromBooking !== lastName.trim().toLowerCase()) {
        toast.error('Last name does not match our records');
        setLoading(false);
        return;
      }

      await (supabase.from('resort_ops_bookings') as any).update({
        last_guest_login: new Date().toISOString(),
        guest_login_count: (booking as any).guest_login_count ? (booking as any).guest_login_count + 1 : 1,
      }).eq('id', booking.id);

      const portalSession: GuestPortalSession = {
        booking_id: booking.id,
        room_id: unit.id,
        room_name: unit.unit_name,
        guest_name: guestName,
        check_out: booking.check_out,
        expires: new Date(booking.check_out + 'T23:59:59').getTime(),
      };
      sessionStorage.setItem(GUEST_PORTAL_KEY, JSON.stringify(portalSession));
      setSession(portalSession);
      toast.success(`Welcome, ${guestName.split(' ')[0]}!`);
    } catch { toast.error('Login failed'); }
    setLoading(false);
  };

  const logout = () => {
    sessionStorage.removeItem(GUEST_PORTAL_KEY);
    setSession(null);
    setView('dashboard');
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-navy-texture flex flex-col items-center justify-center px-6">
        {profile?.logo_url && <img src={profile.logo_url} alt="Logo" style={{ width: profile.logo_size || 96, height: profile.logo_size || 96 }} className="object-contain mb-4" />}
        <h1 className="font-display text-2xl tracking-wider text-foreground mb-1">Guest Portal</h1>
        <p className="font-body text-sm text-muted-foreground mb-8">Access your room services</p>
        <div className="w-full max-w-xs space-y-3">
          <Select onValueChange={setRoomName} value={roomName}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body text-center h-12">
              <SelectValue placeholder="Select your room" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {allUnits.map(u => <SelectItem key={u.id} value={u.unit_name} className="text-foreground font-body">{u.unit_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Your last name" className="bg-secondary border-border text-foreground font-body text-center text-lg h-12" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          <Button onClick={handleLogin} disabled={loading || !roomName || !lastName.trim()} className="w-full font-display text-sm tracking-wider h-12">
            {loading ? 'Verifying...' : 'Enter Portal'}
          </Button>
          <button onClick={() => navigate('/')} className="w-full font-body text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-texture">
      <div className="max-w-lg mx-auto px-4 py-6">
        {view !== 'dashboard' ? (
          <button onClick={() => setView('dashboard')} className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-body text-sm mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <>
            <div className="bg-card border border-border rounded-lg p-4 mb-6">
              <p className="font-display text-lg text-foreground">Welcome, {session.guest_name.split(' ')[0]}!</p>
              <p className="font-body text-sm text-muted-foreground">{session.room_name} · Check-out: {new Date(session.check_out).toLocaleDateString()}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Tile icon={<UtensilsCrossed className="w-5 h-5" />} label="Order Food" onClick={() => {
                setGuestSession({ room_id: session.room_id, room_name: session.room_name, guest_name: session.guest_name, booking_id: session.booking_id });
                navigate('/menu?mode=guest-order');
              }} />
              <Tile icon={<MapPin className="w-5 h-5" />} label="Book Tour" onClick={() => setView('tours')} />
              <Tile icon={<Car className="w-5 h-5" />} label="Transport" onClick={() => setView('transport')} />
              <Tile icon={<Bike className="w-5 h-5" />} label="Rent Scooter" onClick={() => setView('rentals')} />
              <Tile icon={<MessageSquare className="w-5 h-5" />} label="Leave Note" onClick={() => setView('request')} />
              <Tile icon={<Star className="w-5 h-5" />} label="Write Review" onClick={() => setView('review')} />
              <Tile icon={<ClipboardList className="w-5 h-5" />} label="My Orders" onClick={() => setView('orders')} />
              <Tile icon={<Receipt className="w-5 h-5" />} label="My Bill" onClick={() => setView('bill')} className="col-span-2" />
            </div>
            <button onClick={logout} className="flex items-center justify-center gap-2 w-full font-body text-xs text-muted-foreground hover:text-foreground py-2">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </>
        )}

        {view === 'tours' && <ToursView session={session} qc={qc} />}
        {view === 'transport' && <TransportView session={session} qc={qc} />}
        {view === 'rentals' && <RentalsView session={session} qc={qc} />}
        {view === 'request' && <RequestView session={session} qc={qc} />}
        {view === 'review' && <ReviewView session={session} qc={qc} onDone={() => setView('dashboard')} />}
        {view === 'orders' && <OrdersView session={session} />}
        {view === 'bill' && <BillView session={session} />}
      </div>
    </div>
  );
};

const Tile = ({ icon, label, onClick, className = '' }: { icon: React.ReactNode; label: string; onClick: () => void; className?: string }) => (
  <button onClick={onClick} className={`bg-card border border-border rounded-lg p-4 flex flex-col items-center gap-2 hover:bg-secondary transition-colors ${className}`}>
    <span className="text-accent">{icon}</span>
    <span className="font-body text-sm text-foreground">{label}</span>
  </button>
);

// --- Tours (Enhanced: pickup time, notes, pending status) ---
const ToursView = ({ session, qc }: { session: GuestPortalSession; qc: any }) => {
  const { data: tours = [] } = useQuery({
    queryKey: ['tours-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('tours_config').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });
  const [selectedTour, setSelectedTour] = useState<any>(null);
  const [pax, setPax] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState('07:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const book = async () => {
    if (!selectedTour) return;
    setSubmitting(true);
    const totalPrice = selectedTour.price * (parseInt(pax) || 1);
    // Create pending booking — NO room charge yet
    await (supabase.from('tour_bookings') as any).insert({
      booking_id: session.booking_id,
      guest_name: session.guest_name,
      tour_name: selectedTour.name,
      tour_date: date,
      pax: parseInt(pax) || 1,
      price: totalPrice,
      room_id: session.room_id,
      status: 'pending',
      pickup_time: pickupTime,
      notes: notes.trim(),
    });
    qc.invalidateQueries({ queryKey: ['tour-bookings-admin'] });
    toast.success('Tour request submitted! Staff will confirm shortly.');
    setSelectedTour(null);
    setNotes('');
    setPickupTime('07:00');
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-foreground">Book a Tour</h2>
      <p className="font-body text-xs text-muted-foreground">Select a tour below. Staff will confirm your booking.</p>
      {tours.map((t: any) => (
        <div key={t.id} onClick={() => setSelectedTour(t)} className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors ${selectedTour?.id === t.id ? 'border-accent' : 'border-border hover:border-muted-foreground'}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-body text-sm text-foreground font-medium">{t.name}</p>
              <p className="font-body text-xs text-muted-foreground">{t.description}</p>
              <p className="font-body text-xs text-muted-foreground">{t.duration} · {t.schedule} · Max {t.max_pax} pax</p>
            </div>
            <span className="font-body text-sm text-accent font-medium">₱{t.price}/pax</span>
          </div>
        </div>
      ))}
      {selectedTour && (
        <div className="bg-secondary p-4 rounded-lg space-y-3">
          <p className="font-body text-sm text-foreground font-medium">{selectedTour.name}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-card text-foreground h-10" />
            </div>
            <div className="space-y-1">
              <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Pax</Label>
              <Input type="number" value={pax} onChange={e => setPax(e.target.value)} min="1" max={selectedTour.max_pax} className="bg-card text-foreground h-10" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Pickup Time</Label>
            <Input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} className="bg-card text-foreground h-10" />
          </div>
          <div className="space-y-1">
            <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><StickyNote className="w-3 h-3" /> Special Requests</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Vegetarian lunch, need snorkel gear..." className="bg-card text-foreground min-h-[60px]" />
          </div>
          <p className="font-body text-sm text-foreground text-right">Total: ₱{selectedTour.price * (parseInt(pax) || 1)}</p>
          <Button onClick={book} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Request Tour Booking'}</Button>
          <p className="font-body text-xs text-muted-foreground text-center">Staff will confirm and charge to your room</p>
        </div>
      )}
      {tours.length === 0 && <p className="font-body text-sm text-muted-foreground">No tours available at the moment.</p>}
    </div>
  );
};

// --- Transport (Now pending, no auto-charge) ---
const TransportView = ({ session, qc }: { session: GuestPortalSession; qc: any }) => {
  const { data: rates = [] } = useQuery({
    queryKey: ['transport-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('transport_rates').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });
  const [selectedRate, setSelectedRate] = useState<any>(null);
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState('08:00');
  const [submitting, setSubmitting] = useState(false);

  const book = async () => {
    if (!selectedRate) return;
    setSubmitting(true);
    const label = `${selectedRate.origin} → ${selectedRate.destination}`;
    // Create pending request — NO room charge yet
    await supabase.from('guest_requests').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      request_type: 'Transport',
      details: `${label} — ₱${selectedRate.price} — ${pickupDate} ${pickupTime}`,
      status: 'pending',
    });
    qc.invalidateQueries({ queryKey: ['guest-requests-admin'] });
    toast.success('Transport request submitted! Staff will confirm shortly.');
    setSelectedRate(null);
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-foreground">Request Transport</h2>
      <p className="font-body text-xs text-muted-foreground">Select a route. Staff will confirm and charge to your room.</p>
      {rates.map((r: any) => (
        <div key={r.id} onClick={() => setSelectedRate(r)} className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors ${selectedRate?.id === r.id ? 'border-accent' : 'border-border hover:border-muted-foreground'}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="font-body text-sm text-foreground">{r.origin} → {r.destination}</p>
              {r.description && <p className="font-body text-xs text-muted-foreground">{r.description}</p>}
            </div>
            <span className="font-body text-sm text-accent font-medium">₱{r.price}</span>
          </div>
        </div>
      ))}
      {selectedRate && (
        <div className="bg-secondary p-4 rounded-lg space-y-3">
          <p className="font-body text-sm text-foreground">{selectedRate.origin} → {selectedRate.destination}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Date</Label>
              <Input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} className="bg-card text-foreground h-10" />
            </div>
            <div className="space-y-1">
              <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Time</Label>
              <Input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} className="bg-card text-foreground h-10" />
            </div>
          </div>
          <p className="font-body text-sm text-foreground text-right">Total: ₱{selectedRate.price}</p>
          <Button onClick={book} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Request Transport'}</Button>
          <p className="font-body text-xs text-muted-foreground text-center">Staff will confirm and charge to your room</p>
        </div>
      )}
      {rates.length === 0 && <p className="font-body text-sm text-muted-foreground">No transport options available.</p>}
    </div>
  );
};

// --- Rentals (Enhanced: duration selection, date, qty, notes, pending) ---
const RentalsView = ({ session, qc }: { session: GuestPortalSession; qc: any }) => {
  const { data: rates = [] } = useQuery({
    queryKey: ['rentals-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('rental_rates').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });

  // Group rates by item_type
  const itemTypes = [...new Set(rates.map((r: any) => r.item_type))];
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState<any>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const typeRates = rates.filter((r: any) => r.item_type === selectedType);
  const totalPrice = selectedRate ? selectedRate.price * (parseInt(qty) || 1) : 0;

  const ITEM_ICONS: Record<string, string> = {
    'Scooter': '🛵',
    'Bicycle': '🚲',
    'Kayak': '🛶',
    'Surfboard': '🏄',
    'Snorkel': '🤿',
  };

  const book = async () => {
    if (!selectedRate) return;
    setSubmitting(true);
    const detail = `${selectedType} — ${selectedRate.rate_name} × ${qty} — ₱${totalPrice} — Start: ${startDate}${notes.trim() ? ` — Notes: ${notes.trim()}` : ''}`;
    // Create pending request — NO room charge yet
    await supabase.from('guest_requests').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      request_type: 'Rental',
      details: detail,
      status: 'pending',
    });
    qc.invalidateQueries({ queryKey: ['guest-requests-admin'] });
    toast.success('Rental request submitted! Staff will confirm shortly.');
    setSelectedType(null);
    setSelectedRate(null);
    setNotes('');
    setQty('1');
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-foreground">Rent Equipment</h2>
      <p className="font-body text-xs text-muted-foreground">Choose what you'd like to rent. Staff will confirm availability.</p>

      {!selectedType ? (
        <div className="grid grid-cols-2 gap-3">
          {itemTypes.map(type => (
            <button key={type} onClick={() => setSelectedType(type)} className="bg-card border border-border rounded-lg p-5 flex flex-col items-center gap-2 hover:border-accent transition-colors">
              <span className="text-3xl">{ITEM_ICONS[type] || '🏷️'}</span>
              <span className="font-body text-sm text-foreground font-medium">{type}</span>
              <span className="font-body text-xs text-muted-foreground">{rates.filter((r: any) => r.item_type === type).length} options</span>
            </button>
          ))}
          {itemTypes.length === 0 && <p className="font-body text-sm text-muted-foreground col-span-2">No rentals available.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <button onClick={() => { setSelectedType(null); setSelectedRate(null); }} className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-body text-xs">
            <ArrowLeft className="w-3 h-3" /> All equipment
          </button>

          <h3 className="font-body text-sm text-foreground font-medium">{ITEM_ICONS[selectedType] || '🏷️'} {selectedType} — Choose Duration</h3>

          <RadioGroup value={selectedRate?.id || ''} onValueChange={id => setSelectedRate(typeRates.find((r: any) => r.id === id))}>
            {typeRates.map((r: any) => (
              <div key={r.id} className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors ${selectedRate?.id === r.id ? 'border-accent' : 'border-border'}`}>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value={r.id} id={r.id} />
                  <Label htmlFor={r.id} className="flex-1 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-body text-sm text-foreground">{r.rate_name}</p>
                        {r.description && <p className="font-body text-xs text-muted-foreground">{r.description}</p>}
                      </div>
                      <span className="font-body text-sm text-accent font-medium">₱{r.price}</span>
                    </div>
                  </Label>
                </div>
              </div>
            ))}
          </RadioGroup>

          {selectedRate && (
            <div className="bg-secondary p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Start Date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-card text-foreground h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="font-body text-xs text-muted-foreground">Quantity</Label>
                  <Input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" max="5" className="bg-card text-foreground h-10" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><StickyNote className="w-3 h-3" /> Preferences</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Automatic scooter preferred, need helmet..." className="bg-card text-foreground min-h-[60px]" />
              </div>
              <div className="flex justify-between items-center">
                <span className="font-body text-xs text-muted-foreground">{selectedRate.rate_name} × {qty}</span>
                <span className="font-body text-sm text-foreground font-medium">Total: ₱{totalPrice}</span>
              </div>
              <Button onClick={book} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Request Rental'}</Button>
              <p className="font-body text-xs text-muted-foreground text-center">Staff will confirm availability and charge to your room</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Request/Note ---
const RequestView = ({ session, qc }: { session: GuestPortalSession; qc: any }) => {
  const { data: categories = [] } = useQuery({
    queryKey: ['request-cats-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('request_categories').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });
  const [type, setType] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!type || !details.trim()) return;
    setSubmitting(true);
    await supabase.from('guest_requests').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      request_type: type,
      details: details.trim(),
      status: 'pending',
    });
    qc.invalidateQueries({ queryKey: ['guest-requests-admin'] });
    toast.success('Request submitted!');
    setDetails('');
    setType('');
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-foreground">Leave a Note / Request</h2>
      <Select onValueChange={setType} value={type}>
        <SelectTrigger className="bg-secondary border-border text-foreground h-12">
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          {categories.map((c: any) => <SelectItem key={c.id} value={c.name} className="text-foreground">{c.icon} {c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Describe your request..." className="bg-secondary border-border text-foreground min-h-[120px]" />
      <Button onClick={submit} disabled={submitting || !type || !details.trim()} className="w-full">{submitting ? 'Submitting...' : 'Submit Request'}</Button>
    </div>
  );
};

// --- Review ---
const ReviewView = ({ session, qc, onDone }: { session: GuestPortalSession; qc: any; onDone: () => void }) => {
  const { data: categories = [] } = useQuery({
    queryKey: ['review-cats-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('review_settings').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    await supabase.from('guest_reviews').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      ratings,
      comments: comments.trim(),
    });
    qc.invalidateQueries({ queryKey: ['guest-reviews-admin'] });
    toast.success('Thank you for your review!');
    setSubmitting(false);
    onDone();
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-foreground">Write a Review</h2>
      {categories.map((c: any) => (
        <div key={c.id} className="space-y-1">
          <p className="font-body text-sm text-foreground">{c.category_name}</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button key={star} onClick={() => setRatings(r => ({ ...r, [c.category_name]: star }))} className="text-2xl transition-colors">
                {(ratings[c.category_name] || 0) >= star ? <span className="text-accent">★</span> : <span className="text-muted-foreground">☆</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Textarea value={comments} onChange={e => setComments(e.target.value)} placeholder="Any additional comments..." className="bg-secondary border-border text-foreground min-h-[100px]" />
      <Button onClick={submit} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Submit Review'}</Button>
    </div>
  );
};

// --- Orders ---
const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  'New': { label: 'Received', color: 'bg-blue-500/20 text-blue-400' },
  'Preparing': { label: 'Preparing', color: 'bg-amber-500/20 text-amber-400' },
  'Served': { label: 'Served', color: 'bg-green-500/20 text-green-400' },
  'Paid': { label: 'Complete', color: 'bg-muted text-muted-foreground' },
  'Cancelled': { label: 'Cancelled', color: 'bg-destructive/20 text-destructive' },
};

const OrdersView = ({ session }: { session: GuestPortalSession }) => {
  const qc = useQueryClient();

  const { data: orders = [] } = useQuery({
    queryKey: ['guest-orders', session.room_id],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('room_id', session.room_id)
        .gte('created_at', start.toISOString())
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('guest-order-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `room_id=eq.${session.room_id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['guest-orders', session.room_id] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session.room_id, qc]);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-foreground">My Orders</h2>
      {orders.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground text-center py-8">No orders today.</p>
      ) : (
        orders.map((order: any) => {
          const statusInfo = ORDER_STATUS_MAP[order.status] || { label: order.status, color: 'bg-muted text-muted-foreground' };
          const items = Array.isArray(order.items) ? order.items : [];
          return (
            <div key={order.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-body text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`font-body text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>
              <div className="space-y-1">
                {items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span className="font-body text-sm text-foreground">{item.qty || item.quantity || 1}× {item.name}</span>
                    <span className="font-body text-sm text-muted-foreground">₱{((item.price || 0) * (item.qty || item.quantity || 1)).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-body text-sm text-foreground font-medium">Total</span>
                <span className="font-body text-sm text-foreground font-medium">₱{(order.total || 0).toLocaleString()}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

// --- Bill ---
const BillView = ({ session }: { session: GuestPortalSession }) => {
  const { data: transactions = [] } = useQuery({
    queryKey: ['guest-bill', session.booking_id],
    queryFn: async () => {
      const { data } = await (supabase.from('room_transactions') as any)
        .select('*')
        .eq('booking_id', session.booking_id)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const charges = transactions.filter((t: any) => t.transaction_type === 'charge');
  const payments = transactions.filter((t: any) => t.transaction_type === 'payment');
  const totalCharges = charges.reduce((s: number, t: any) => s + (t.total_amount || 0), 0);
  const totalPayments = payments.reduce((s: number, t: any) => s + (t.total_amount || 0), 0);
  const balance = totalCharges - totalPayments;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-foreground">My Bill</h2>
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex justify-between mb-2">
          <span className="font-body text-sm text-muted-foreground">Total Charges</span>
          <span className="font-body text-sm text-foreground">₱{totalCharges.toLocaleString()}</span>
        </div>
        <div className="flex justify-between mb-2">
          <span className="font-body text-sm text-muted-foreground">Total Payments</span>
          <span className="font-body text-sm text-green-400">₱{totalPayments.toLocaleString()}</span>
        </div>
        <div className="border-t border-border pt-2 flex justify-between">
          <span className="font-body text-sm text-foreground font-medium">Balance</span>
          <span className={`font-body text-sm font-medium ${balance > 0 ? 'text-amber-400' : 'text-green-400'}`}>₱{balance.toLocaleString()}</span>
        </div>
      </div>
      <div className="space-y-2">
        {transactions.map((t: any) => (
          <div key={t.id} className="bg-secondary p-3 rounded flex justify-between items-start">
            <div>
              <p className="font-body text-sm text-foreground">{t.notes || t.transaction_type}</p>
              <p className="font-body text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
            </div>
            <span className={`font-body text-sm ${t.transaction_type === 'payment' ? 'text-green-400' : 'text-foreground'}`}>
              {t.transaction_type === 'payment' ? '-' : '+'}₱{(t.total_amount || 0).toLocaleString()}
            </span>
          </div>
        ))}
        {transactions.length === 0 && <p className="font-body text-sm text-muted-foreground text-center">No transactions yet.</p>}
      </div>
    </div>
  );
};

export default GuestPortal;
