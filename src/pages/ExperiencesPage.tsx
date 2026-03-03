import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MapPin, CheckCircle } from 'lucide-react';
import { format, addDays, isSameDay, isAfter } from 'date-fns';
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

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Tours
  const { data: tours = [] } = useQuery({
    queryKey: ['all-tours-experiences'],
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*').gte('tour_date', todayStr).order('tour_date').order('pickup_time');
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

  const updateTourStatus = async (id: string, status: string) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await from('guest_tours').update({ status }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['all-tours-experiences'] });
    toast.success(`Tour ${status}`);
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

      {/* ── Today's Tours ── */}
      <div className="mb-6 space-y-2">
        <h2 className="font-display text-xs tracking-wider text-foreground uppercase">🏝️ Today's Tours & Activities ({todayTours.length})</h2>
        {todayTours.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground text-center py-4">No tours scheduled today</p>
        ) : todayTours.map((tour: any) => (
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
      </div>

      {/* ── Upcoming Tours ── */}
      {upcomingTours.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">Upcoming Bookings</h2>
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
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">Guest Requests</h2>
          {requests.slice(0, 15).map((req: any) => (
            <div key={req.id} className="border border-border rounded-lg p-3 space-y-1">
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
