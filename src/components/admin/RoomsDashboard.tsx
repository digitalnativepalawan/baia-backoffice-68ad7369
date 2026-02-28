import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Upload, Trash2, Plus, Users, FileText, UtensilsCrossed, MapPin, StickyNote, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import VibeCheckInForm from './vibe/VibeCheckInForm';
import VibeDetailView from './vibe/VibeDetailView';

type DetailTab = 'info' | 'orders' | 'documents' | 'notes' | 'tours' | 'vibe';

const RoomsDashboard = () => {
  const qc = useQueryClient();
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [vibeMode, setVibeMode] = useState<'list' | 'form' | 'detail'>('list');
  const [editingVibeRecord, setEditingVibeRecord] = useState<any>(null);
  const [viewingVibeRecord, setViewingVibeRecord] = useState<any>(null);

  // Units
  const { data: units = [] } = useQuery({
    queryKey: ['rooms-units'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').eq('active', true).order('unit_name');
      return (data || []).map((u: any) => ({ ...u, name: u.unit_name, type: '', capacity: 0 }));
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
      const { data } = await (supabase.from('guest_vibe_records' as any) as any)
        .select('*').eq('checked_out', false).order('created_at', { ascending: false });
      return (data || []) as any[];
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

  // Guest documents
  const currentBooking = bookings.find((b: any) => {
    if (!selectedUnit) return false;
    const today = new Date().toISOString().split('T')[0];
    return b.unit_id === selectedUnit.id && b.check_in <= today && b.check_out >= today;
  });
  const guestId = (currentBooking as any)?.guest_id;

  const { data: documents = [] } = useQuery({
    queryKey: ['guest-documents', guestId],
    enabled: !!guestId,
    queryFn: async () => {
      const { data } = await (supabase.from('guest_documents' as any) as any).select('*').eq('guest_id', guestId).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Guest notes
  const { data: notes = [] } = useQuery({
    queryKey: ['guest-notes', selectedUnit?.name],
    enabled: !!selectedUnit,
    queryFn: async () => {
      const { data } = await (supabase.from('guest_notes' as any) as any).select('*').eq('unit_name', selectedUnit!.name).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Guest tours
  const { data: tours = [] } = useQuery({
    queryKey: ['guest-tours', currentBooking?.id],
    enabled: !!currentBooking,
    queryFn: async () => {
      const { data } = await (supabase.from('guest_tours' as any) as any).select('*').eq('booking_id', currentBooking!.id).order('tour_date');
      return (data || []) as any[];
    },
  });

  // Vibe records for selected unit
  const unitVibeRecords = vibeRecords.filter((v: any) => v.unit_name === selectedUnit?.name);

  // Note form
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');

  const addNote = async () => {
    if (!noteContent.trim() || !selectedUnit) return;
    await (supabase.from('guest_notes' as any) as any).insert({
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
    await (supabase.from('guest_notes' as any) as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-notes', selectedUnit?.name] });
    toast.success('Note deleted');
  };

  // Tour form
  const [tourName, setTourName] = useState('');
  const [tourDate, setTourDate] = useState('');
  const [tourPax, setTourPax] = useState('1');
  const [tourPrice, setTourPrice] = useState('');

  const addTour = async () => {
    if (!tourName.trim() || !tourDate || !currentBooking) return;
    await (supabase.from('guest_tours' as any) as any).insert({
      booking_id: currentBooking.id,
      tour_name: tourName.trim(),
      tour_date: tourDate,
      pax: parseInt(tourPax) || 1,
      price: parseFloat(tourPrice) || 0,
    });
    setTourName(''); setTourDate(''); setTourPax('1'); setTourPrice('');
    qc.invalidateQueries({ queryKey: ['guest-tours', currentBooking.id] });
    toast.success('Tour added');
  };

  const updateTourStatus = async (id: string, status: string) => {
    await (supabase.from('guest_tours' as any) as any).update({ status }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-tours', currentBooking?.id] });
    toast.success('Tour updated');
  };

  // Document upload
  const uploadDocument = async (file: File) => {
    if (!guestId) { toast.error('No guest checked in'); return; }
    const ext = file.name.split('.').pop();
    const path = `${guestId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('guest-documents').upload(path, file);
    if (error) { toast.error('Upload failed'); return; }
    const { data: urlData } = supabase.storage.from('guest-documents').getPublicUrl(path);
    await (supabase.from('guest_documents' as any) as any).insert({
      guest_id: guestId,
      document_type: 'passport',
      image_url: urlData.publicUrl,
    });
    qc.invalidateQueries({ queryKey: ['guest-documents', guestId] });
    toast.success('Document uploaded');
  };

  const deleteDocument = async (doc: any) => {
    const path = doc.image_url.split('/guest-documents/')[1];
    if (path) await supabase.storage.from('guest-documents').remove([path]);
    await (supabase.from('guest_documents' as any) as any).delete().eq('id', doc.id);
    qc.invalidateQueries({ queryKey: ['guest-documents', guestId] });
    toast.success('Document deleted');
  };

  // Get current guest for a unit
  const getUnitGuest = (unitId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const booking = bookings.find((b: any) => b.unit_id === unitId && b.check_in <= today && b.check_out >= today);
    return booking as any;
  };

  // Check if unit has high-risk vibe record
  const getUnitVibeRisk = (unitName: string) => {
    const records = vibeRecords.filter((v: any) => v.unit_name === unitName && !v.checked_out);
    return records.some((v: any) => (v.review_risk_level || []).includes('High'));
  };

  // DETAIL VIEW
  if (selectedUnit) {
    const booking = getUnitGuest(selectedUnit.id);
    const guest = (booking as any)?.resort_ops_guests;

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
          <Button size="sm" variant="ghost" onClick={() => setSelectedUnit(null)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h3 className="font-display text-lg tracking-wider text-foreground">{selectedUnit.name}</h3>
          <Badge variant={booking ? 'default' : 'secondary'} className="font-body text-xs">
            {booking ? 'Occupied' : 'Vacant'}
          </Badge>
        </div>

        {/* Detail tabs */}
        <div className="flex gap-1 flex-wrap">
          {([
            { key: 'info' as DetailTab, label: 'Guest', icon: Users },
            { key: 'orders' as DetailTab, label: 'Orders', icon: UtensilsCrossed },
            { key: 'documents' as DetailTab, label: 'Docs', icon: FileText },
            { key: 'notes' as DetailTab, label: 'Notes', icon: StickyNote },
            { key: 'tours' as DetailTab, label: 'Tours', icon: MapPin },
            { key: 'vibe' as DetailTab, label: 'Vibe', icon: Sparkles },
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
                  <div>
                    <p className="font-body text-xs text-muted-foreground">Rate</p>
                    <p className="font-body text-sm text-foreground">₱{Number(booking.room_rate).toLocaleString()}</p>
                  </div>
                </div>
                {booking.notes && (
                  <div>
                    <p className="font-body text-xs text-muted-foreground">Booking Notes</p>
                    <p className="font-body text-sm text-foreground">{booking.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-border rounded-lg p-4 text-center">
                <p className="font-body text-sm text-muted-foreground">No guest currently checked in</p>
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

        {/* DOCUMENTS */}
        {detailTab === 'documents' && (
          <div className="space-y-3">
            {!guestId ? (
              <p className="font-body text-sm text-muted-foreground text-center py-4">No guest checked in — can't upload documents</p>
            ) : (
              <>
                <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-4 justify-center hover:bg-secondary/50">
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <span className="font-body text-sm text-muted-foreground">Upload Passport / ID</span>
                  <input type="file" accept="image/*" className="hidden" capture="environment"
                    onChange={e => { if (e.target.files?.[0]) uploadDocument(e.target.files[0]); }} />
                </label>
                {documents.map((doc: any) => (
                  <div key={doc.id} className="border border-border rounded-lg overflow-hidden">
                    <img src={doc.image_url} alt="Document" className="w-full max-h-64 object-contain bg-secondary" />
                    <div className="flex justify-between items-center p-2">
                      <span className="font-body text-xs text-muted-foreground">
                        {doc.document_type} · {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => deleteDocument(doc)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* NOTES */}
        {detailTab === 'notes' && (
          <div className="space-y-3">
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
                  <Button size="sm" variant="ghost" onClick={() => deleteNote(note.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {notes.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-2">No notes yet</p>}
          </div>
        )}

        {/* TOURS */}
        {detailTab === 'tours' && (
          <div className="space-y-3">
            {currentBooking ? (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <Input value={tourName} onChange={e => setTourName(e.target.value)} placeholder="Tour name"
                  className="bg-secondary border-border text-foreground font-body text-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <Input type="date" value={tourDate} onChange={e => setTourDate(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                  <Input value={tourPax} onChange={e => setTourPax(e.target.value)} placeholder="Pax"
                    className="bg-secondary border-border text-foreground font-body text-xs" type="number" />
                  <Input value={tourPrice} onChange={e => setTourPrice(e.target.value)} placeholder="₱ Price"
                    className="bg-secondary border-border text-foreground font-body text-xs" type="number" />
                </div>
                <Button size="sm" onClick={addTour} disabled={!tourName.trim() || !tourDate}
                  className="font-display text-xs tracking-wider w-full">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Tour
                </Button>
              </div>
            ) : (
              <p className="font-body text-sm text-muted-foreground text-center py-4">No guest checked in — can't add tours</p>
            )}
            {tours.map((tour: any) => (
              <div key={tour.id} className="border border-border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-display text-sm text-foreground">{tour.tour_name}</p>
                    <p className="font-body text-xs text-muted-foreground">
                      {format(new Date(tour.tour_date + 'T00:00:00'), 'MMM d, yyyy')} · {tour.pax} pax · ₱{Number(tour.price).toLocaleString()}
                    </p>
                  </div>
                  <Select value={tour.status} onValueChange={v => updateTourStatus(tour.id, v)}>
                    <SelectTrigger className="w-28 bg-secondary border-border text-foreground font-body text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="booked">Booked</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {tour.notes && <p className="font-body text-xs text-muted-foreground mt-1">{tour.notes}</p>}
              </div>
            ))}
            {tours.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-2">No tours booked</p>}
          </div>
        )}

        {/* VIBE */}
        {detailTab === 'vibe' && vibeMode === 'list' && (
          <div className="space-y-3">
            <Button onClick={() => { setEditingVibeRecord(null); setVibeMode('form'); }}
              className="w-full font-display text-xs tracking-wider min-h-[44px]">
              <Plus className="w-4 h-4 mr-2" /> New Vibe Check-In
            </Button>
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
      </div>
    );
  }

  // GRID VIEW
  return (
    <div className="space-y-4">
      <h3 className="font-display text-sm tracking-wider text-foreground">Rooms & Units</h3>
      <div className="grid grid-cols-2 gap-3">
        {units.map((unit: any) => {
          const booking = getUnitGuest(unit.id);
          const guest = (booking as any)?.resort_ops_guests;
          const isHighRisk = getUnitVibeRisk(unit.name);
          return (
            <button key={unit.id} onClick={() => { setSelectedUnit(unit); setDetailTab('info'); setVibeMode('list'); }}
              className={`border rounded-lg p-3 text-left hover:bg-secondary/50 transition-colors ${isHighRisk ? 'border-2 border-destructive' : 'border-border'}`}>
              <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
              <p className="font-body text-xs text-muted-foreground">{unit.type} · {unit.capacity} pax</p>
              {booking ? (
                <div className="mt-2">
                  <Badge variant="default" className="font-body text-xs">Occupied</Badge>
                  <p className="font-body text-xs text-foreground mt-1">{guest?.full_name || 'Guest'}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')} – {format(new Date(booking.check_out + 'T00:00:00'), 'MMM d')}
                  </p>
                </div>
              ) : (
                <Badge variant="secondary" className="font-body text-xs mt-2">Vacant</Badge>
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
