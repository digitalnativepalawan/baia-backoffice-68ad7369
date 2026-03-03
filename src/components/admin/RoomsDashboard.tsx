import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Upload, Trash2, Plus, Users, FileText, UtensilsCrossed, MapPin, StickyNote, Sparkles, LogIn, LogOut, Camera, Download, Link as LinkIcon, ClipboardCheck, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import VibeCheckInForm from './vibe/VibeCheckInForm';
import VibeDetailView from './vibe/VibeDetailView';
import HousekeepingInspection from './HousekeepingInspection';
import RoomBillingTab from '@/components/rooms/RoomBillingTab';

const from = (table: string) => supabase.from(table as any);

type DetailTab = 'info' | 'orders' | 'documents' | 'notes' | 'tours' | 'vibe' | 'billing';

const RoomsDashboard = ({ readOnly = false, canViewDocuments = true }: { readOnly?: boolean; canViewDocuments?: boolean }) => {
  const qc = useQueryClient();
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [vibeMode, setVibeMode] = useState<'list' | 'form' | 'detail'>('list');
  const [editingVibeRecord, setEditingVibeRecord] = useState<any>(null);
  const [viewingVibeRecord, setViewingVibeRecord] = useState<any>(null);
  const [viewingHousekeepingOrder, setViewingHousekeepingOrder] = useState<any>(null);

  // Check-in form state
  const [checkInForm, setCheckInForm] = useState({
    guestName: '', phone: '', email: '',
    checkIn: new Date().toISOString().split('T')[0],
    checkOut: '', adults: '1', children: '0', platform: 'Direct', roomRate: '0', notes: '', specialRequests: '',
  });
  const [checkingIn, setCheckingIn] = useState(false);
  const [showCheckInForm, setShowCheckInForm] = useState(false);

  // Document form state
  const [docType, setDocType] = useState('passport');
  const [docNotes, setDocNotes] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Tour form state
  const [tourName, setTourName] = useState('');
  const [tourDate, setTourDate] = useState('');
  const [tourPax, setTourPax] = useState('1');
  const [tourPrice, setTourPrice] = useState('');
  const [tourProvider, setTourProvider] = useState('');
  const [tourPickupTime, setTourPickupTime] = useState('');
  const [tourNotes, setTourNotes] = useState('');

  // Note form
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');

  // Units
  const { data: units = [] } = useQuery({
    queryKey: ['rooms-units'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').eq('active', true).order('unit_name');
      return (data || []).map((u: any) => ({ ...u, name: u.unit_name, type: '', capacity: 0 }));
    },
  });

  // Resort ops units (for booking linkage)
  const { data: resortUnits = [] } = useQuery({
    queryKey: ['resort-ops-units'],
    queryFn: async () => {
      const { data } = await from('resort_ops_units').select('*');
      return (data || []) as any[];
    },
  });

  // Bookings (current)
  const { data: bookings = [] } = useQuery({
    queryKey: ['rooms-bookings'],
    queryFn: async () => {
      const { data } = await supabase.from('resort_ops_bookings').select('*, resort_ops_guests(*)').order('check_in', { ascending: false });
      return data || [];
    },
  });

  // All vibe records (for grid view badges)
  const { data: vibeRecords = [] } = useQuery({
    queryKey: ['vibe-records'],
    queryFn: async () => {
      const { data } = await from('guest_vibe_records')
        .select('*').eq('checked_out', false).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Housekeeping orders (active)
  const { data: housekeepingOrders = [] } = useQuery({
    queryKey: ['housekeeping-orders'],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders')
        .select('*').neq('status', 'completed').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Employees for housekeeper names
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-active'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id, name, display_name').eq('active', true).order('name');
      return data || [];
    },
  });

  // Orders for selected unit
  const { data: unitOrders = [] } = useQuery({
    queryKey: ['rooms-orders', selectedUnit?.name],
    enabled: !!selectedUnit,
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*')
        .eq('order_type', 'Room')
        .eq('location_detail', selectedUnit!.name)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Get unit status — must be declared before getActiveBooking which depends on it
  const getUnitStatus = (unit: any): 'occupied' | 'to_clean' | 'ready' => {
    return (unit as any).status || 'ready';
  };

  // Resolve resort_ops_unit for a room name
  const resolveResortUnit = (roomName: string) => {
    return resortUnits.find((ru: any) => ru.name.toLowerCase().trim() === roomName.toLowerCase().trim());
  };

  // Active booking: only when unit is operationally occupied (not just date overlap)
  const getActiveBooking = (unit: any) => {
    if (!unit) return null;
    const unitStatus = getUnitStatus(unit);
    // If unit has been checked out (to_clean or ready), don't show booking as active
    if (unitStatus !== 'occupied') return null;
    const today = new Date().toISOString().split('T')[0];
    const resortUnit = resolveResortUnit(unit.name);
    if (!resortUnit) return null;
    return bookings.find((b: any) => b.unit_id === resortUnit.id && b.check_in <= today && b.check_out >= today) || null;
  };

  const currentBooking = getActiveBooking(selectedUnit);
  const guestId = (currentBooking as any)?.guest_id;

  // Documents - query by unit_name (works with or without guest)
  const { data: documents = [] } = useQuery({
    queryKey: ['guest-documents', selectedUnit?.name],
    enabled: !!selectedUnit,
    queryFn: async () => {
      const { data } = await from('guest_documents').select('*').eq('unit_name', selectedUnit!.name).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Guest notes
  const { data: notes = [] } = useQuery({
    queryKey: ['guest-notes', selectedUnit?.name],
    enabled: !!selectedUnit,
    queryFn: async () => {
      const { data } = await from('guest_notes').select('*').eq('unit_name', selectedUnit!.name).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Guest tours - query by unit_name (works without booking)
  const { data: tours = [] } = useQuery({
    queryKey: ['guest-tours', selectedUnit?.name],
    enabled: !!selectedUnit,
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*').eq('unit_name', selectedUnit!.name).order('tour_date');
      return (data || []) as any[];
    },
  });

  // Vibe records for selected unit
  const unitVibeRecords = vibeRecords.filter((v: any) => v.unit_name === selectedUnit?.name);

  const getEmployeeName = (id: string) => {
    const emp = employees.find((e: any) => e.id === id);
    return emp ? (emp.display_name || emp.name) : '';
  };

  const addNote = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!noteContent.trim() || !selectedUnit) return;
    await from('guest_notes').insert({
      booking_id: currentBooking?.id || null,
      unit_name: selectedUnit.name,
      note_type: noteType,
      content: noteContent.trim(),
      created_by: 'admin',
    });
    setNoteContent('');
    qc.invalidateQueries({ queryKey: ['guest-notes', selectedUnit.name] });
    toast.success('Note added');
  };

  const deleteNote = async (id: string) => {
    if (readOnly) { toast.error('View-only access'); return; }
    await from('guest_notes').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-notes', selectedUnit?.name] });
    toast.success('Note deleted');
  };

  const addTour = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!tourName.trim() || !tourDate || !selectedUnit) return;
    await from('guest_tours').insert({
      booking_id: currentBooking?.id || null,
      unit_name: selectedUnit.name,
      tour_name: tourName.trim(),
      tour_date: tourDate,
      pax: parseInt(tourPax) || 1,
      price: parseFloat(tourPrice) || 0,
      provider: tourProvider.trim(),
      pickup_time: tourPickupTime.trim(),
      notes: tourNotes.trim(),
    });
    setTourName(''); setTourDate(''); setTourPax('1'); setTourPrice('');
    setTourProvider(''); setTourPickupTime(''); setTourNotes('');
    qc.invalidateQueries({ queryKey: ['guest-tours', selectedUnit.name] });
    toast.success('Tour added');
  };

  const updateTourStatus = async (id: string, status: string) => {
    if (readOnly) { toast.error('View-only access'); return; }
    await from('guest_tours').update({ status }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-tours', selectedUnit?.name] });
    toast.success('Tour updated');
  };

  const deleteTour = async (id: string) => {
    if (readOnly) { toast.error('View-only access'); return; }
    await from('guest_tours').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-tours', selectedUnit?.name] });
    toast.success('Tour deleted');
  };

  // Document upload (file or camera)
  const uploadDocument = async (file: File) => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!selectedUnit) return;
    const ext = file.name.split('.').pop();
    const folder = guestId || selectedUnit.name.replace(/\s+/g, '_');
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('guest-documents').upload(path, file);
    if (error) { toast.error('Upload failed'); return; }
    const { data: urlData } = supabase.storage.from('guest-documents').getPublicUrl(path);
    await from('guest_documents').insert({
      guest_id: guestId || null,
      unit_name: selectedUnit.name,
      document_type: docType,
      image_url: urlData.publicUrl,
      notes: docNotes.trim() || null,
    });
    setDocNotes('');
    qc.invalidateQueries({ queryKey: ['guest-documents', selectedUnit.name] });
    toast.success('Document uploaded');
  };

  const addDocumentUrl = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!docUrl.trim() || !selectedUnit) return;
    await from('guest_documents').insert({
      guest_id: guestId || null,
      unit_name: selectedUnit.name,
      document_type: docType,
      image_url: docUrl.trim(),
      notes: docNotes.trim() || null,
    });
    setDocUrl(''); setDocNotes(''); setShowUrlInput(false);
    qc.invalidateQueries({ queryKey: ['guest-documents', selectedUnit.name] });
    toast.success('Document link added');
  };

  const deleteDocument = async (doc: any) => {
    if (readOnly) { toast.error('View-only access'); return; }
    const path = doc.image_url.split('/guest-documents/')[1];
    if (path && !doc.image_url.startsWith('http://') && !doc.image_url.includes('//') === false) {
      await supabase.storage.from('guest-documents').remove([path]);
    }
    await from('guest_documents').delete().eq('id', doc.id);
    qc.invalidateQueries({ queryKey: ['guest-documents', selectedUnit?.name] });
    toast.success('Document deleted');
  };

  // Get current guest for a unit (grid view) — only when occupied
  const getUnitGuest = (unitName: string) => {
    const unit = units.find((u: any) => u.name === unitName);
    if (!unit || getUnitStatus(unit) !== 'occupied') return null;
    const today = new Date().toISOString().split('T')[0];
    const resortUnit = resolveResortUnit(unitName);
    if (!resortUnit) return null;
    return bookings.find((b: any) => b.unit_id === resortUnit.id && b.check_in <= today && b.check_out >= today) || null;
  };

  // Check if unit has high-risk vibe record
  const getUnitVibeRisk = (unitName: string) => {
    const records = vibeRecords.filter((v: any) => v.unit_name === unitName && !v.checked_out);
    return records.some((v: any) => (v.review_risk_level || []).includes('High'));
  };

  // Get latest housekeeping order for unit (only latest per unit)
  const getHousekeepingOrder = (unitName: string) => {
    // housekeepingOrders is already sorted by created_at DESC, so first match is latest
    return housekeepingOrders.find((o: any) => o.unit_name === unitName);
  };

  // --- CHECK-IN ---
  const handleCheckIn = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!selectedUnit || !checkInForm.guestName.trim() || !checkInForm.checkOut) {
      toast.error('Guest name and check-out date are required');
      return;
    }
    // Prevent check-in if room is to_clean
    if (getUnitStatus(selectedUnit) === 'to_clean') {
      toast.error('Complete housekeeping before check-in');
      return;
    }
    if (checkInForm.checkOut <= checkInForm.checkIn) {
      toast.error('Check-out must be after check-in');
      return;
    }
    setCheckingIn(true);
    try {
      // 1. Create or find guest
      const { data: existingGuest } = await from('resort_ops_guests')
        .select('id').ilike('full_name', checkInForm.guestName.trim()).maybeSingle() as any;

      let gId: string;
      if (existingGuest) {
        gId = existingGuest.id;
        await from('resort_ops_guests').update({
          phone: checkInForm.phone || null,
          email: checkInForm.email || null,
        }).eq('id', gId);
      } else {
        const { data: newGuest, error: gErr } = await from('resort_ops_guests').insert({
          full_name: checkInForm.guestName.trim(),
          phone: checkInForm.phone || null,
          email: checkInForm.email || null,
        }).select('id').single() as any;
        if (gErr || !newGuest) throw new Error('Failed to create guest');
        gId = newGuest.id;
      }

      // 2. Resolve or create resort_ops_unit
      let resortUnit = resolveResortUnit(selectedUnit.name);
      if (!resortUnit) {
        const { data: newUnit, error: uErr } = await from('resort_ops_units').insert({
          name: selectedUnit.name, type: 'room', capacity: 2,
        }).select('id').single() as any;
        if (uErr || !newUnit) throw new Error('Failed to create unit mapping');
        resortUnit = { id: newUnit.id };
        qc.invalidateQueries({ queryKey: ['resort-ops-units'] });
      }

      // 3. Generate room password
      const roomPassword = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(checkInForm.checkOut);
      expiresAt.setDate(expiresAt.getDate() + 1);

      // 4. Insert booking with password
      const { error: bErr } = await from('resort_ops_bookings').insert({
        guest_id: gId,
        unit_id: resortUnit.id,
        platform: checkInForm.platform,
        check_in: checkInForm.checkIn,
        check_out: checkInForm.checkOut,
        adults: parseInt(checkInForm.adults) || 1,
        children: parseInt(checkInForm.children) || 0,
        room_rate: parseFloat(checkInForm.roomRate) || 0,
        notes: checkInForm.notes || '',
        special_requests: checkInForm.specialRequests || '',
        room_password: roomPassword,
        password_expires_at: expiresAt.toISOString(),
      });
      if (bErr) throw new Error(bErr.message);

      // 5. Set unit status to occupied
      await supabase.from('units').update({ status: 'occupied' } as any).eq('id', selectedUnit.id);

      // 6. Refresh
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      setShowCheckInForm(false);
      setCheckInForm({
        guestName: '', phone: '', email: '',
        checkIn: new Date().toISOString().split('T')[0],
        checkOut: '', adults: '1', children: '0', platform: 'Direct', roomRate: '0', notes: '', specialRequests: '',
      });
      toast.success(`${checkInForm.guestName.trim()} checked in to ${selectedUnit.name}. Room password: ${roomPassword}`, { duration: 10000 });
    } catch (err: any) {
      toast.error(err.message || 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  // --- CHECK-OUT (idempotent — reuses existing housekeeping order) ---
  const handleCheckOut = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!currentBooking) return;
    const today = new Date().toISOString().split('T')[0];
    const { error } = await from('resort_ops_bookings').update({ check_out: today }).eq('id', currentBooking.id);
    if (error) { toast.error('Checkout failed'); return; }

    // Set unit status to 'to_clean'
    await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', selectedUnit.id);

    // Check for existing open housekeeping order before creating a new one
    const existingOrder = housekeepingOrders.find((o: any) => o.unit_name === selectedUnit.name);
    if (!existingOrder) {
      await from('housekeeping_orders').insert({
        unit_name: selectedUnit.name,
        room_type_id: (selectedUnit as any).room_type_id || null,
        status: 'pending_inspection',
      });
    }

    qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
    qc.invalidateQueries({ queryKey: ['rooms-units'] });
    qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
    toast.success('Guest checked out — housekeeping order created');
  };

  // ── HOUSEKEEPING INSPECTION VIEW ──
  if (viewingHousekeepingOrder) {
    return (
      <HousekeepingInspection
        order={viewingHousekeepingOrder}
        onClose={() => {
          setViewingHousekeepingOrder(null);
          qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
          qc.invalidateQueries({ queryKey: ['rooms-units'] });
        }}
      />
    );
  }

  // DETAIL VIEW
  if (selectedUnit) {
    const booking = getActiveBooking(selectedUnit);
    const guest = (booking as any)?.resort_ops_guests;
    const unitHkOrder = getHousekeepingOrder(selectedUnit.name);

    // Vibe sub-views
    if (detailTab === 'vibe' && vibeMode === 'form') {
      return (
        <VibeCheckInForm
          unitName={selectedUnit.name}
          existingRecord={editingVibeRecord}
          onClose={() => { setVibeMode('list'); setEditingVibeRecord(null); }}
        />
      );
    }

    if (detailTab === 'vibe' && vibeMode === 'detail' && viewingVibeRecord) {
      return (
        <VibeDetailView
          record={viewingVibeRecord}
          onBack={() => { setVibeMode('list'); setViewingVibeRecord(null); }}
          onEdit={() => { setEditingVibeRecord(viewingVibeRecord); setVibeMode('form'); }}
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => { setSelectedUnit(null); setShowCheckInForm(false); }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h3 className="font-display text-lg tracking-wider text-foreground">{selectedUnit.name}</h3>
          <Badge variant={booking ? 'default' : 'secondary'} className="font-body text-xs">
            {booking ? 'Occupied' : getUnitStatus(selectedUnit) === 'to_clean' ? 'To Clean' : 'Vacant'}
          </Badge>
        </div>

        {/* Housekeeping banner */}
        {unitHkOrder && !readOnly && (
          <button
            onClick={() => setViewingHousekeepingOrder(unitHkOrder)}
            className="w-full border-2 border-amber-500/50 bg-amber-500/10 rounded-lg p-3 text-left"
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-amber-400" />
              <span className="font-display text-sm text-amber-400 tracking-wider">
                Housekeeping: {unitHkOrder.status === 'pending_inspection' ? 'Pending Inspection' : unitHkOrder.status === 'inspecting' ? 'Inspecting' : 'Cleaning'}
              </span>
            </div>
            {unitHkOrder.assigned_to && (
              <p className="font-body text-xs text-muted-foreground mt-1">
                Assigned to: {getEmployeeName(unitHkOrder.assigned_to)}
              </p>
            )}
            <p className="font-body text-xs text-amber-400/70 mt-1">Tap to open →</p>
          </button>
        )}
        {/* Read-only housekeeping status banner */}
        {unitHkOrder && readOnly && (
          <div className="w-full border-2 border-amber-500/50 bg-amber-500/10 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-amber-400" />
              <span className="font-display text-sm text-amber-400 tracking-wider">
                Housekeeping: {unitHkOrder.status === 'pending_inspection' ? 'Pending Inspection' : unitHkOrder.status === 'inspecting' ? 'Inspecting' : 'Cleaning'}
              </span>
            </div>
            {unitHkOrder.assigned_to && (
              <p className="font-body text-xs text-muted-foreground mt-1">
                Assigned to: {getEmployeeName(unitHkOrder.assigned_to)}
              </p>
            )}
          </div>
        )}

        {/* Detail tabs */}
        <div className="flex gap-1 flex-wrap">
          {([
            { key: 'info' as DetailTab, label: 'Guest', icon: Users },
            { key: 'orders' as DetailTab, label: 'Orders', icon: UtensilsCrossed },
            ...(canViewDocuments ? [{ key: 'documents' as DetailTab, label: 'Docs', icon: FileText }] : []),
            { key: 'notes' as DetailTab, label: 'Notes', icon: StickyNote },
            { key: 'tours' as DetailTab, label: 'Tours', icon: MapPin },
            { key: 'vibe' as DetailTab, label: 'Vibe', icon: Sparkles },
            { key: 'billing' as DetailTab, label: 'Billing', icon: DollarSign },
          ]).map(({ key, label, icon: Icon }) => (
            <Button key={key} size="sm" variant={detailTab === key ? 'default' : 'outline'}
              onClick={() => { setDetailTab(key); if (key === 'vibe') setVibeMode('list'); }}
              className="font-display text-xs tracking-wider gap-1">
              <Icon className="w-3.5 h-3.5" /> {label}
            </Button>
          ))}
        </div>

        {/* GUEST INFO */}
        {detailTab === 'info' && (
          <div className="space-y-3">
            {booking ? (
              <>
                <div className="border border-border rounded-lg p-4 space-y-2">
                  <p className="font-display text-sm text-foreground">{guest?.full_name || 'Unknown Guest'}</p>
                  {guest?.email && <p className="font-body text-xs text-muted-foreground">Email: {guest.email}</p>}
                  {guest?.phone && <p className="font-body text-xs text-muted-foreground">Phone: {guest.phone}</p>}
                  <div className="flex gap-4 mt-2">
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Check-in</p>
                      <p className="font-body text-sm text-foreground">{format(new Date(booking.check_in + 'T00:00:00'), 'MMM d, yyyy')}</p>
                    </div>
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Check-out</p>
                      <p className="font-body text-sm text-foreground">{format(new Date(booking.check_out + 'T00:00:00'), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Platform</p>
                      <p className="font-body text-sm text-foreground">{booking.platform || '—'}</p>
                    </div>
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Adults</p>
                      <p className="font-body text-sm text-foreground">{booking.adults}</p>
                    </div>
                    {(booking as any).children > 0 && (
                      <div>
                        <p className="font-body text-xs text-muted-foreground">Children</p>
                        <p className="font-body text-sm text-foreground">{(booking as any).children}</p>
                      </div>
                    )}
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Rate</p>
                      <p className="font-body text-sm text-foreground">₱{Number(booking.room_rate).toLocaleString()}</p>
                    </div>
                  </div>
                  {(booking as any).room_password && (
                    <div className="mt-2 p-2 border border-primary/30 rounded bg-primary/5">
                      <p className="font-body text-xs text-muted-foreground">Room Password (for guest ordering)</p>
                      <p className="font-display text-lg tracking-[0.3em] text-primary">{(booking as any).room_password}</p>
                    </div>
                  )}
                  {booking.notes && (
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Booking Notes</p>
                      <p className="font-body text-sm text-foreground">{booking.notes}</p>
                    </div>
                  )}
                  {(booking as any).special_requests && (
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Special Requests</p>
                      <p className="font-body text-sm text-foreground">{(booking as any).special_requests}</p>
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <Button size="sm" variant="destructive" onClick={handleCheckOut}
                    className="w-full font-display text-xs tracking-wider min-h-[44px]">
                    <LogOut className="w-4 h-4 mr-2" /> Check Out Guest
                  </Button>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {!showCheckInForm ? (
                  <div className="border border-dashed border-border rounded-lg p-6 text-center space-y-3">
                    <p className="font-body text-sm text-muted-foreground">No guest currently checked in</p>
                    {getUnitStatus(selectedUnit) === 'to_clean' ? (
                      <p className="font-body text-xs text-amber-400">Complete housekeeping before check-in.</p>
                    ) : !readOnly ? (
                      <>
                        <p className="font-body text-xs text-muted-foreground">Check in a guest to enable full room management.</p>
                        <Button size="sm" onClick={() => setShowCheckInForm(true)}
                          className="font-display text-xs tracking-wider min-h-[44px]">
                          <LogIn className="w-4 h-4 mr-2" /> Check In Guest
                        </Button>
                      </>
                    ) : (
                      <p className="font-body text-xs text-muted-foreground">View-only access — cannot check in guests.</p>
                    )}
                  </div>
                ) : (
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <p className="font-display text-xs tracking-wider text-foreground uppercase">Check In Guest</p>
                    <Input value={checkInForm.guestName}
                      onChange={e => setCheckInForm(p => ({ ...p, guestName: e.target.value }))}
                      placeholder="Guest full name *" className="bg-secondary border-border text-foreground font-body text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={checkInForm.phone}
                        onChange={e => setCheckInForm(p => ({ ...p, phone: e.target.value }))}
                        placeholder="Phone" className="bg-secondary border-border text-foreground font-body text-xs" />
                      <Input value={checkInForm.email}
                        onChange={e => setCheckInForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="Email" className="bg-secondary border-border text-foreground font-body text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Check-in</label>
                        <Input type="date" value={checkInForm.checkIn}
                          onChange={e => setCheckInForm(p => ({ ...p, checkIn: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Check-out *</label>
                        <Input type="date" value={checkInForm.checkOut}
                          onChange={e => setCheckInForm(p => ({ ...p, checkOut: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Adults</label>
                        <Input type="number" value={checkInForm.adults}
                          onChange={e => setCheckInForm(p => ({ ...p, adults: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Children</label>
                        <Input type="number" value={checkInForm.children}
                          onChange={e => setCheckInForm(p => ({ ...p, children: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Platform</label>
                        <Select value={checkInForm.platform}
                          onValueChange={v => setCheckInForm(p => ({ ...p, platform: v }))}>
                          <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Direct">Direct</SelectItem>
                            <SelectItem value="Airbnb">Airbnb</SelectItem>
                            <SelectItem value="Booking.com">Booking.com</SelectItem>
                            <SelectItem value="Agoda">Agoda</SelectItem>
                            <SelectItem value="Website">Website</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Rate</label>
                        <Input type="number" value={checkInForm.roomRate}
                          onChange={e => setCheckInForm(p => ({ ...p, roomRate: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                    </div>
                    <Textarea value={checkInForm.specialRequests}
                      onChange={e => setCheckInForm(p => ({ ...p, specialRequests: e.target.value }))}
                      placeholder="Special requests (dietary, accessibility, etc.)"
                      className="bg-secondary border-border text-foreground font-body text-sm min-h-[50px]" />
                    <Textarea value={checkInForm.notes}
                      onChange={e => setCheckInForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Notes (optional)"
                      className="bg-secondary border-border text-foreground font-body text-sm min-h-[50px]" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowCheckInForm(false)}
                        className="flex-1 font-display text-xs tracking-wider min-h-[44px]">Cancel</Button>
                      <Button size="sm" onClick={handleCheckIn} disabled={checkingIn}
                        className="flex-1 font-display text-xs tracking-wider min-h-[44px]">
                        {checkingIn ? 'Checking in...' : 'Check In'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ORDERS */}
        {detailTab === 'orders' && (
          <div className="space-y-2">
            {unitOrders.length === 0 ? (
              <p className="font-body text-sm text-muted-foreground text-center py-4">No orders for this room</p>
            ) : unitOrders.map((order: any) => (
              <div key={order.id} className="border border-border rounded-lg p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <Badge variant={order.status === 'Closed' ? 'secondary' : 'default'} className="font-body text-xs">{order.status}</Badge>
                  <span className="font-body text-xs text-muted-foreground">{format(new Date(order.created_at), 'MMM d · h:mm a')}</span>
                </div>
                <div className="space-y-0.5">
                  {(order.items as any[]).map((item: any, i: number) => (
                    <p key={i} className="font-body text-xs text-foreground">
                      {item.qty || item.quantity}× {item.name} — ₱{(item.price * (item.qty || item.quantity)).toFixed(0)}
                    </p>
                  ))}
                </div>
                <p className="font-display text-xs text-foreground">Total: ₱{Number(order.total).toFixed(0)}</p>
              </div>
            ))}
          </div>
        )}

        {/* DOCUMENTS - always available */}
        {detailTab === 'documents' && (
          <div className="space-y-3">
            {!readOnly && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs">
                    <SelectValue placeholder="Document type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="government_id">Government ID</SelectItem>
                    <SelectItem value="booking_confirmation">Booking Confirmation</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>

                <Input value={docNotes} onChange={e => setDocNotes(e.target.value)}
                  placeholder="Notes (e.g., expires March 2027)"
                  className="bg-secondary border-border text-foreground font-body text-xs" />

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-3 justify-center hover:bg-secondary/50 min-h-[44px]">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <span className="font-body text-xs text-muted-foreground">Take Photo</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) uploadDocument(e.target.files[0]); }} />
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-3 justify-center hover:bg-secondary/50 min-h-[44px]">
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <span className="font-body text-xs text-muted-foreground">Upload File</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) uploadDocument(e.target.files[0]); }} />
                  </label>
                </div>

                {!showUrlInput ? (
                  <Button size="sm" variant="outline" onClick={() => setShowUrlInput(true)}
                    className="w-full font-display text-xs tracking-wider min-h-[44px]">
                    <LinkIcon className="w-3.5 h-3.5 mr-1" /> Add Document Link
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Input value={docUrl} onChange={e => setDocUrl(e.target.value)}
                      placeholder="https://..." className="bg-secondary border-border text-foreground font-body text-xs flex-1" />
                    <Button size="sm" onClick={addDocumentUrl} disabled={!docUrl.trim()}
                      className="font-display text-xs tracking-wider min-h-[44px]">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowUrlInput(false); setDocUrl(''); }}
                      className="font-display text-xs min-h-[44px]">✕</Button>
                  </div>
                )}
              </div>
            )}

            {/* Document list */}
            {documents.map((doc: any) => (
              <div key={doc.id} className="border border-border rounded-lg overflow-hidden">
                {doc.image_url && !doc.image_url.startsWith('http://') && doc.image_url.includes('guest-documents') ? (
                  <img src={doc.image_url} alt="Document" className="w-full max-h-64 object-contain bg-secondary" />
                ) : (
                  <div className="p-3 bg-secondary flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-body text-xs text-foreground truncate">{doc.image_url}</span>
                  </div>
                )}
                <div className="flex justify-between items-center p-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-body text-xs text-muted-foreground">
                      {doc.document_type?.replace('_', ' ')} · {format(new Date(doc.created_at), 'MMM d, yyyy')}
                    </span>
                    {doc.notes && <p className="font-body text-xs text-foreground mt-0.5 truncate">{doc.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <a href={doc.image_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost"><Download className="w-3.5 h-3.5 text-foreground" /></Button>
                    </a>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => deleteDocument(doc)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {documents.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-2">No documents yet</p>}
          </div>
        )}

        {/* NOTES */}
        {detailTab === 'notes' && (
          <div className="space-y-3">
            {!readOnly && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="w-32 bg-secondary border-border text-foreground font-body text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="request">Request</SelectItem>
                      <SelectItem value="allergy">Allergy</SelectItem>
                      <SelectItem value="preference">Preference</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea value={noteContent} onChange={e => setNoteContent(e.target.value)}
                  placeholder="Add a note..." className="bg-secondary border-border text-foreground font-body text-sm min-h-[60px]" />
                <Button size="sm" onClick={addNote} disabled={!noteContent.trim()} className="font-display text-xs tracking-wider w-full">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Note
                </Button>
              </div>
            )}
            {notes.map((note: any) => (
              <div key={note.id} className="border border-border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="outline" className="font-body text-xs mb-1">{note.note_type}</Badge>
                    <p className="font-body text-sm text-foreground">{note.content}</p>
                    <p className="font-body text-xs text-muted-foreground mt-1">
                      {note.created_by} · {format(new Date(note.created_at), 'MMM d · h:mm a')}
                    </p>
                  </div>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={() => deleteNote(note.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {notes.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-2">No notes yet</p>}
          </div>
        )}

        {/* TOURS - always available */}
        {detailTab === 'tours' && (
          <div className="space-y-3">
            {!readOnly && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <Input value={tourName} onChange={e => setTourName(e.target.value)} placeholder="Tour name *"
                  className="bg-secondary border-border text-foreground font-body text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={tourProvider} onChange={e => setTourProvider(e.target.value)} placeholder="Provider / vendor"
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                  <Input type="date" value={tourDate} onChange={e => setTourDate(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" value={tourPax} onChange={e => setTourPax(e.target.value)} placeholder="Pax"
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                  <Input type="number" value={tourPrice} onChange={e => setTourPrice(e.target.value)} placeholder="Price"
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                  <Input value={tourPickupTime} onChange={e => setTourPickupTime(e.target.value)} placeholder="Pickup time"
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                </div>
                <Input value={tourNotes} onChange={e => setTourNotes(e.target.value)} placeholder="Notes (optional)"
                  className="bg-secondary border-border text-foreground font-body text-xs" />
                <Button size="sm" onClick={addTour} disabled={!tourName.trim() || !tourDate}
                  className="font-display text-xs tracking-wider w-full min-h-[44px]">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Tour
                </Button>
              </div>
            )}
            {tours.map((tour: any) => (
              <div key={tour.id} className="border border-border rounded-lg p-3 space-y-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-display text-sm text-foreground">{tour.tour_name}</p>
                    <p className="font-body text-xs text-muted-foreground">
                      {format(new Date(tour.tour_date + 'T00:00:00'), 'MMM d')} · {tour.pax} pax · ₱{tour.price}
                    </p>
                    {tour.provider && <p className="font-body text-xs text-muted-foreground">via {tour.provider}</p>}
                    {tour.pickup_time && <p className="font-body text-xs text-muted-foreground">Pickup: {tour.pickup_time}</p>}
                    {tour.notes && <p className="font-body text-xs text-foreground mt-1">{tour.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    {!readOnly ? (
                      <>
                        <Select value={tour.status} onValueChange={v => updateTourStatus(tour.id, v)}>
                          <SelectTrigger className="h-7 w-24 text-xs bg-secondary border-border text-foreground font-body">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="booked">Booked</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" onClick={() => deleteTour(tour.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" className="font-body text-xs">{tour.status}</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {tours.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-2">No tours booked</p>}
          </div>
        )}

        {/* VIBE */}
        {detailTab === 'vibe' && vibeMode === 'list' && (
          <div className="space-y-3">
            {!readOnly && (
              <Button onClick={() => { setEditingVibeRecord(null); setVibeMode('form'); }}
                className="w-full font-display text-xs tracking-wider min-h-[44px]">
                <Plus className="w-4 h-4 mr-2" /> New Vibe Check-In
              </Button>
            )}
            {unitVibeRecords.length === 0 ? (
              <p className="font-body text-sm text-muted-foreground text-center py-4">No vibe records for this room</p>
            ) : unitVibeRecords.map((rec: any) => {
              const isHigh = (rec.review_risk_level || []).includes('High');
              return (
                <button key={rec.id} onClick={() => { setViewingVibeRecord(rec); setVibeMode('detail'); }}
                  className={`w-full text-left border rounded-lg p-3 hover:bg-secondary/50 transition-colors ${isHigh ? 'border-2 border-destructive' : 'border-border'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-display text-sm text-foreground">{rec.guest_name}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        {rec.nationality || 'N/A'} · {(rec.travel_composition || []).join(', ')}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {(rec.review_risk_level || []).map((r: string) => (
                        <Badge key={r} variant={r === 'High' ? 'destructive' : r === 'Medium' ? 'default' : 'secondary'}
                          className="font-body text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(rec.personality_type || []).map((p: string) => (
                      <Badge key={p} variant="outline" className="font-body text-xs">{p}</Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* BILLING */}
        {detailTab === 'billing' && (
          <RoomBillingTab unit={selectedUnit} booking={booking} guestName={guest?.full_name || null} readOnly={readOnly} />
        )}
      </div>
    );
  }
  const occupiedUnits = units.filter((u: any) => getUnitStatus(u) === 'occupied' || getUnitGuest(u.name));
  const toCleanUnits = units.filter((u: any) => getUnitStatus(u) === 'to_clean');
  const readyUnits = units.filter((u: any) => getUnitStatus(u) === 'ready' && !getUnitGuest(u.name));

  return (
    <div className="space-y-4">
      <h3 className="font-display text-sm tracking-wider text-foreground">Room Status Board</h3>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-2">
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

      {/* To Clean cards (most actionable) */}
      {toCleanUnits.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-display text-xs tracking-wider text-amber-400 uppercase">🟨 To Clean</h4>
          {toCleanUnits.map((unit: any) => {
            const hkOrder = getHousekeepingOrder(unit.name);
            return (
              <div key={unit.id} className="border-2 border-amber-500/40 bg-amber-500/5 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
                    {hkOrder?.assigned_to && (
                      <p className="font-body text-xs text-muted-foreground">
                        Assigned: {getEmployeeName(hkOrder.assigned_to)}
                      </p>
                    )}
                    {hkOrder && (
                      <Badge variant="outline" className="font-body text-xs mt-1 text-amber-400 border-amber-500/40">
                        {hkOrder.status === 'pending_inspection' ? 'Pending Inspection' : hkOrder.status === 'cleaning' ? 'Cleaning' : hkOrder.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {hkOrder && !readOnly && (
                      <Button size="sm" onClick={() => setViewingHousekeepingOrder(hkOrder)}
                        className="font-display text-xs tracking-wider min-h-[44px]">
                        <ClipboardCheck className="w-4 h-4 mr-1" /> Start
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setSelectedUnit(unit); setDetailTab('info'); setVibeMode('list'); setShowCheckInForm(false); }}
                      className="font-display text-xs tracking-wider min-h-[44px]">
                      View
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Room grid */}
      <h4 className="font-display text-xs tracking-wider text-muted-foreground uppercase">All Rooms</h4>
      <div className="grid grid-cols-2 gap-3">
        {units.map((unit: any) => {
          const booking = getUnitGuest(unit.name);
          const guest = (booking as any)?.resort_ops_guests;
          const isHighRisk = getUnitVibeRisk(unit.name);
          const status = getUnitStatus(unit);
          const borderColor = status === 'occupied' ? 'border-red-500/40' : status === 'to_clean' ? 'border-amber-500/40' : 'border-emerald-500/40';
          const statusBg = status === 'occupied' ? 'bg-red-500/5' : status === 'to_clean' ? 'bg-amber-500/5' : '';

          return (
            <button key={unit.id} onClick={() => { setSelectedUnit(unit); setDetailTab('info'); setVibeMode('list'); setShowCheckInForm(false); }}
              className={`border-2 rounded-lg p-3 text-left hover:bg-secondary/50 transition-colors ${borderColor} ${statusBg} ${isHighRisk ? 'ring-2 ring-destructive' : ''}`}>
              <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
              {booking ? (
                <div className="mt-2">
                  <Badge className="font-body text-xs bg-red-500/20 text-red-400 border-red-500/40">Occupied</Badge>
                  <p className="font-body text-xs text-foreground mt-1">{guest?.full_name || 'Guest'}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')} – {format(new Date(booking.check_out + 'T00:00:00'), 'MMM d')}
                  </p>
                </div>
              ) : status === 'to_clean' ? (
                <Badge className="font-body text-xs mt-2 bg-amber-500/20 text-amber-400 border-amber-500/40">To Clean</Badge>
              ) : (
                <Badge className="font-body text-xs mt-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Ready</Badge>
              )}
              {isHighRisk && (
                <Badge variant="destructive" className="font-body text-xs mt-1">⚠ High Risk</Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RoomsDashboard;
