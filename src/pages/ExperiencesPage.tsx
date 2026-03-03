import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MapPin, CheckCircle, Palmtree, Car, Bike } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { canEdit } from '@/lib/permissions';

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

const ExperiencesPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = getSession();
  const perms: string[] = session?.permissions || [];
  const isAdmin = perms.includes('admin');
  const canDoEdit = isAdmin || canEdit(perms, 'experiences');
  const staffName = session?.name || 'Staff';

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Admin-created tours (guest_tours)
  const { data: tours = [] } = useQuery({
    queryKey: ['all-tours-experiences'],
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*').gte('tour_date', todayStr).order('tour_date').order('pickup_time');
      return (data || []) as any[];
    },
  });

  // Guest portal tour bookings (tour_bookings)
  const { data: tourBookings = [] } = useQuery({
    queryKey: ['tour-bookings-experiences'],
    queryFn: async () => {
      const { data } = await (supabase.from('tour_bookings') as any)
        .select('*')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(50);
      return (data || []) as any[];
    },
  });

  // Guest requests (transport, rentals)
  const { data: requests = [] } = useQuery({
    queryKey: ['all-requests-experiences'],
    queryFn: async () => {
      const { data } = await from('guest_requests').select('*').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(50);
      return (data || []) as any[];
    },
  });

  const todayTours = tours.filter((t: any) => t.tour_date === todayStr);
  const upcomingTours = tours.filter((t: any) => t.tour_date > todayStr);

  // Guest portal bookings split
  const pendingBookings = tourBookings.filter((b: any) => b.status === 'pending');
  const confirmedBookings = tourBookings.filter((b: any) => b.status === 'confirmed');
  const todayBookings = tourBookings.filter((b: any) => b.tour_date === todayStr && b.status !== 'cancelled');

  const updateTourStatus = async (id: string, status: string) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await from('guest_tours').update({ status }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['all-tours-experiences'] });
    toast.success(`Tour ${status}`);
  };

  const confirmTourBooking = async (b: any) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({
      status: 'confirmed',
      confirmed_by: staffName,
    }).eq('id', b.id);
    qc.invalidateQueries({ queryKey: ['tour-bookings-experiences'] });
    toast.success('Tour booking confirmed');
  };

  const cancelTourBooking = async (id: string) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({
      status: 'cancelled',
      confirmed_by: staffName,
    }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['tour-bookings-experiences'] });
    toast.success('Tour booking cancelled');
  };

  const completeTourBooking = async (id: string) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({ status: 'completed' }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['tour-bookings-experiences'] });
    toast.success('Tour completed');
  };

  const updateRequestStatus = async (id: string, status: string) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await from('guest_requests').update({ status }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['all-requests-experiences'] });
    toast.success(`Request ${status}`);
  };

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

  const getRequestIcon = (type: string) => {
    if (type?.toLowerCase().includes('transport')) return <Car className="w-3.5 h-3.5 text-primary" />;
    if (type?.toLowerCase().includes('rent') || type?.toLowerCase().includes('scooter') || type?.toLowerCase().includes('bike'))
      return <Bike className="w-3.5 h-3.5 text-primary" />;
    return <Palmtree className="w-3.5 h-3.5 text-primary" />;
  };

  return (
    <div className="min-h-screen bg-navy-texture p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl tracking-wider text-foreground">Experiences</h1>
          <p className="font-body text-xs text-muted-foreground">{format(today, 'EEEE, MMM d, yyyy')}</p>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-amber-400">{pendingBookings.length}</p>
          <p className="font-body text-xs text-amber-400/70">Pending</p>
        </div>
        <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-emerald-400">{confirmedBookings.length}</p>
          <p className="font-body text-xs text-emerald-400/70">Confirmed</p>
        </div>
        <div className="border border-border rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-foreground">{requests.filter(r => r.status === 'pending').length}</p>
          <p className="font-body text-xs text-muted-foreground">Requests</p>
        </div>
      </div>

      {/* ── Pending Tour Bookings (from Guest Portal) ── */}
      {pendingBookings.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-amber-400 uppercase">⏳ Pending Tour Bookings ({pendingBookings.length})</h2>
          {pendingBookings.map((b: any) => (
            <div key={b.id} className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Palmtree className="w-3.5 h-3.5 text-amber-400" />
                    <p className="font-display text-sm text-foreground tracking-wider">{b.tour_name}</p>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    {b.tour_date && format(new Date(b.tour_date + 'T00:00:00'), 'MMM d')} · {b.pickup_time || ''} · {b.pax} pax
                  </p>
                  <p className="font-body text-xs text-muted-foreground">Guest: {b.guest_name}</p>
                  {Number(b.price) > 0 && <p className="font-body text-xs text-foreground">₱{Number(b.price).toLocaleString()}</p>}
                  {b.notes && <p className="font-body text-[10px] text-muted-foreground italic">{b.notes}</p>}
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
        </div>
      )}

      {/* ── Today's Tours (admin-created) ── */}
      <div className="mb-6 space-y-2">
        <h2 className="font-display text-xs tracking-wider text-foreground uppercase">🏝️ Today's Tours & Activities ({todayTours.length + todayBookings.length})</h2>
        {todayTours.length === 0 && todayBookings.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground text-center py-4">No tours scheduled today</p>
        ) : (
          <>
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
                    {Number(tour.price) > 0 && <p className="font-body text-xs text-foreground">₱{Number(tour.price).toLocaleString()}</p>}
                  </div>
                  <Badge className={`font-body text-xs ${statusColor(tour.status)}`}>{tour.status}</Badge>
                </div>
                {canDoEdit && tour.status !== 'completed' && tour.status !== 'cancelled' && (
                  <div className="flex gap-2">
                    {tour.status === 'booked' && (
                      <Button size="sm" variant="outline" onClick={() => updateTourStatus(tour.id, 'confirmed')}
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
            {todayBookings.map((b: any) => (
              <div key={b.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <Palmtree className="w-3.5 h-3.5 text-primary" />
                      <p className="font-display text-sm text-foreground tracking-wider">{b.tour_name}</p>
                    </div>
                    <p className="font-body text-xs text-muted-foreground mt-1">
                      {b.pickup_time || ''} · {b.guest_name} · {b.pax} pax
                    </p>
                    {Number(b.price) > 0 && <p className="font-body text-xs text-foreground">₱{Number(b.price).toLocaleString()}</p>}
                  </div>
                  <Badge className={`font-body text-xs ${statusColor(b.status)}`}>{b.status}</Badge>
                </div>
                {canDoEdit && b.status === 'confirmed' && (
                  <Button size="sm" onClick={() => completeTourBooking(b.id)}
                    className="font-display text-xs tracking-wider min-h-[36px]">
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Complete
                  </Button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Upcoming Tours ── */}
      {upcomingTours.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">Upcoming Tours</h2>
          {upcomingTours.slice(0, 10).map((tour: any) => (
            <div key={tour.id} className="border border-border rounded-lg p-3 flex justify-between items-center">
              <div>
                <p className="font-display text-sm text-foreground tracking-wider">{tour.tour_name}</p>
                <p className="font-body text-xs text-muted-foreground">
                  {format(new Date(tour.tour_date + 'T00:00:00'), 'MMM d')} · {tour.unit_name} · {tour.pax} pax
                </p>
              </div>
              <Badge className={`font-body text-xs ${statusColor(tour.status)}`}>{tour.status}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* ── Guest Requests (Transport, Rentals) ── */}
      {requests.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">Guest Requests ({requests.length})</h2>
          {requests.slice(0, 15).map((req: any) => (
            <div key={req.id} className="border border-border rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    {getRequestIcon(req.request_type)}
                    <p className="font-display text-sm text-foreground tracking-wider">{req.request_type}</p>
                  </div>
                  <p className="font-body text-xs text-muted-foreground">{req.guest_name} · {req.details}</p>
                  <p className="font-body text-[10px] text-muted-foreground">{format(new Date(req.created_at), 'MMM d, h:mm a')}</p>
                </div>
                <Badge className={`font-body text-xs ${statusColor(req.status)}`}>{req.status}</Badge>
              </div>
              {canDoEdit && req.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateRequestStatus(req.id, 'confirmed')}
                    className="font-display text-xs tracking-wider min-h-[36px]">Confirm</Button>
                  <Button size="sm" variant="destructive" onClick={() => updateRequestStatus(req.id, 'cancelled')}
                    className="font-display text-xs tracking-wider min-h-[36px]">Cancel</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExperiencesPage;
