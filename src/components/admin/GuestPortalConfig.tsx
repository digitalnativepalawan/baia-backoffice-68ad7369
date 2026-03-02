import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';

const GuestPortalConfig = () => {
  const qc = useQueryClient();

  // Tours config
  const { data: tours = [] } = useQuery({
    queryKey: ['tours-config'],
    queryFn: async () => {
      const { data } = await supabase.from('tours_config').select('*').order('sort_order');
      return data || [];
    },
  });

  // Transport rates
  const { data: transport = [] } = useQuery({
    queryKey: ['transport-rates'],
    queryFn: async () => {
      const { data } = await supabase.from('transport_rates').select('*').order('sort_order');
      return data || [];
    },
  });

  // Rental rates
  const { data: rentals = [] } = useQuery({
    queryKey: ['rental-rates'],
    queryFn: async () => {
      const { data } = await supabase.from('rental_rates').select('*').order('sort_order');
      return data || [];
    },
  });

  // Request categories
  const { data: requestCats = [] } = useQuery({
    queryKey: ['request-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('request_categories').select('*').order('sort_order');
      return data || [];
    },
  });

  // Review settings
  const { data: reviewCats = [] } = useQuery({
    queryKey: ['review-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('review_settings').select('*').order('sort_order');
      return data || [];
    },
  });

  // Guest requests
  const { data: guestRequests = [] } = useQuery({
    queryKey: ['guest-requests-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('guest_requests').select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
  });

  // Guest reviews
  const { data: guestReviews = [] } = useQuery({
    queryKey: ['guest-reviews-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('guest_reviews').select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
  });

  // Tour bookings
  const { data: tourBookings = [] } = useQuery({
    queryKey: ['tour-bookings-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('tour_bookings').select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
  });

  const [tab, setTab] = useState<'tours' | 'transport' | 'rentals' | 'requests' | 'reviews' | 'activity'>('tours');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 mb-4">
        {(['tours', 'transport', 'rentals', 'requests', 'reviews', 'activity'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-body text-xs px-3 py-2 rounded transition-colors capitalize ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'tours' && <ToursSection tours={tours} qc={qc} />}
      {tab === 'transport' && <TransportSection items={transport} qc={qc} />}
      {tab === 'rentals' && <RentalsSection items={rentals} qc={qc} />}
      {tab === 'requests' && <RequestCatsSection items={requestCats} qc={qc} />}
      {tab === 'reviews' && <ReviewSettingsSection items={reviewCats} qc={qc} />}
      {tab === 'activity' && <ActivitySection requests={guestRequests} reviews={guestReviews} tourBookings={tourBookings} qc={qc} />}
    </div>
  );
};

// --- Tours ---
const ToursSection = ({ tours, qc }: { tours: any[]; qc: any }) => {
  const [form, setForm] = useState({ name: '', description: '', price: '', duration: '', schedule: '', max_pax: '10' });
  const [editId, setEditId] = useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim()) return;
    const payload = { name: form.name, description: form.description, price: parseFloat(form.price) || 0, duration: form.duration, schedule: form.schedule, max_pax: parseInt(form.max_pax) || 10, sort_order: tours.length };
    if (editId) {
      await supabase.from('tours_config').update(payload).eq('id', editId);
    } else {
      await supabase.from('tours_config').insert(payload);
    }
    setForm({ name: '', description: '', price: '', duration: '', schedule: '', max_pax: '10' });
    setEditId(null);
    qc.invalidateQueries({ queryKey: ['tours-config'] });
    toast.success('Tour saved');
  };

  const remove = async (id: string) => {
    await supabase.from('tours_config').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['tours-config'] });
    toast.success('Tour deleted');
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from('tours_config').update({ active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['tours-config'] });
  };

  return (
    <div className="space-y-3">
      <h4 className="font-display text-sm text-foreground tracking-wider">Tours</h4>
      {tours.map((t: any) => (
        <div key={t.id} className="bg-secondary p-3 rounded space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-body text-sm text-foreground">{t.name} — ₱{t.price}</span>
            <div className="flex items-center gap-2">
              <Switch checked={t.active} onCheckedChange={v => toggle(t.id, v)} />
              <button onClick={() => { setEditId(t.id); setForm({ name: t.name, description: t.description, price: String(t.price), duration: t.duration, schedule: t.schedule, max_pax: String(t.max_pax) }); }} className="text-muted-foreground hover:text-foreground text-xs">Edit</button>
              <button onClick={() => remove(t.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <p className="font-body text-xs text-muted-foreground">{t.description} · {t.duration} · Max {t.max_pax} pax</p>
        </div>
      ))}
      <div className="bg-card p-3 rounded space-y-2 border border-border">
        <p className="font-body text-xs text-muted-foreground">{editId ? 'Edit Tour' : 'Add Tour'}</p>
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Tour name" className="bg-secondary text-foreground h-10" />
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" className="bg-secondary text-foreground h-10" />
        <div className="grid grid-cols-3 gap-2">
          <Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="Price" type="number" className="bg-secondary text-foreground h-10" />
          <Input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="Duration" className="bg-secondary text-foreground h-10" />
          <Input value={form.max_pax} onChange={e => setForm(f => ({ ...f, max_pax: e.target.value }))} placeholder="Max pax" type="number" className="bg-secondary text-foreground h-10" />
        </div>
        <Input value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} placeholder="Schedule (e.g. Daily, Mon-Sat)" className="bg-secondary text-foreground h-10" />
        <Button onClick={save} size="sm" className="w-full"><Save className="w-3.5 h-3.5 mr-1" />{editId ? 'Update' : 'Add'}</Button>
        {editId && <button onClick={() => { setEditId(null); setForm({ name: '', description: '', price: '', duration: '', schedule: '', max_pax: '10' }); }} className="text-xs text-muted-foreground w-full text-center">Cancel</button>}
      </div>
    </div>
  );
};

// --- Transport ---
const TransportSection = ({ items, qc }: { items: any[]; qc: any }) => {
  const [form, setForm] = useState({ type: '', price: '', description: '' });

  const save = async () => {
    if (!form.type.trim()) return;
    await supabase.from('transport_rates').insert({ type: form.type, price: parseFloat(form.price) || 0, description: form.description, sort_order: items.length });
    setForm({ type: '', price: '', description: '' });
    qc.invalidateQueries({ queryKey: ['transport-rates'] });
    toast.success('Saved');
  };

  const remove = async (id: string) => {
    await supabase.from('transport_rates').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['transport-rates'] });
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from('transport_rates').update({ active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['transport-rates'] });
  };

  return (
    <div className="space-y-3">
      <h4 className="font-display text-sm text-foreground tracking-wider">Transport Rates</h4>
      {items.map((t: any) => (
        <div key={t.id} className="bg-secondary p-3 rounded flex items-center justify-between">
          <div>
            <span className="font-body text-sm text-foreground">{t.type} — ₱{t.price}</span>
            {t.description && <p className="font-body text-xs text-muted-foreground">{t.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={t.active} onCheckedChange={v => toggle(t.id, v)} />
            <button onClick={() => remove(t.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
      <div className="bg-card p-3 rounded space-y-2 border border-border">
        <Input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="Type (e.g. Airport Transfer)" className="bg-secondary text-foreground h-10" />
        <div className="grid grid-cols-2 gap-2">
          <Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="Price" type="number" className="bg-secondary text-foreground h-10" />
          <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" className="bg-secondary text-foreground h-10" />
        </div>
        <Button onClick={save} size="sm" className="w-full"><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
      </div>
    </div>
  );
};

// --- Rentals ---
const RentalsSection = ({ items, qc }: { items: any[]; qc: any }) => {
  const [form, setForm] = useState({ item_type: 'Scooter', rate_name: '', price: '', description: '' });

  const save = async () => {
    if (!form.rate_name.trim()) return;
    await supabase.from('rental_rates').insert({ item_type: form.item_type, rate_name: form.rate_name, price: parseFloat(form.price) || 0, description: form.description, sort_order: items.length });
    setForm({ item_type: 'Scooter', rate_name: '', price: '', description: '' });
    qc.invalidateQueries({ queryKey: ['rental-rates'] });
    toast.success('Saved');
  };

  const remove = async (id: string) => {
    await supabase.from('rental_rates').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['rental-rates'] });
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from('rental_rates').update({ active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['rental-rates'] });
  };

  return (
    <div className="space-y-3">
      <h4 className="font-display text-sm text-foreground tracking-wider">Rental Rates</h4>
      {items.map((t: any) => (
        <div key={t.id} className="bg-secondary p-3 rounded flex items-center justify-between">
          <div>
            <span className="font-body text-sm text-foreground">{t.item_type} — {t.rate_name} — ₱{t.price}</span>
            {t.description && <p className="font-body text-xs text-muted-foreground">{t.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={t.active} onCheckedChange={v => toggle(t.id, v)} />
            <button onClick={() => remove(t.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
      <div className="bg-card p-3 rounded space-y-2 border border-border">
        <Input value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))} placeholder="Item type" className="bg-secondary text-foreground h-10" />
        <div className="grid grid-cols-2 gap-2">
          <Input value={form.rate_name} onChange={e => setForm(f => ({ ...f, rate_name: e.target.value }))} placeholder="Rate name (e.g. Half Day)" className="bg-secondary text-foreground h-10" />
          <Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="Price" type="number" className="bg-secondary text-foreground h-10" />
        </div>
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" className="bg-secondary text-foreground h-10" />
        <Button onClick={save} size="sm" className="w-full"><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
      </div>
    </div>
  );
};

// --- Request Categories ---
const RequestCatsSection = ({ items, qc }: { items: any[]; qc: any }) => {
  const [name, setName] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    await supabase.from('request_categories').insert({ name: name.trim(), sort_order: items.length });
    setName('');
    qc.invalidateQueries({ queryKey: ['request-categories'] });
    toast.success('Added');
  };

  const remove = async (id: string) => {
    await supabase.from('request_categories').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['request-categories'] });
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from('request_categories').update({ active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['request-categories'] });
  };

  return (
    <div className="space-y-3">
      <h4 className="font-display text-sm text-foreground tracking-wider">Request Categories</h4>
      {items.map((c: any) => (
        <div key={c.id} className="bg-secondary p-3 rounded flex items-center justify-between">
          <span className="font-body text-sm text-foreground">{c.icon} {c.name}</span>
          <div className="flex items-center gap-2">
            <Switch checked={c.active} onCheckedChange={v => toggle(c.id, v)} />
            <button onClick={() => remove(c.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="New category" className="bg-secondary text-foreground h-10 flex-1" onKeyDown={e => e.key === 'Enter' && add()} />
        <Button onClick={add} size="sm"><Plus className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
};

// --- Review Settings ---
const ReviewSettingsSection = ({ items, qc }: { items: any[]; qc: any }) => {
  const [name, setName] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    await supabase.from('review_settings').insert({ category_name: name.trim(), sort_order: items.length });
    setName('');
    qc.invalidateQueries({ queryKey: ['review-settings'] });
    toast.success('Added');
  };

  const remove = async (id: string) => {
    await supabase.from('review_settings').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['review-settings'] });
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from('review_settings').update({ active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['review-settings'] });
  };

  return (
    <div className="space-y-3">
      <h4 className="font-display text-sm text-foreground tracking-wider">Review Categories</h4>
      {items.map((c: any) => (
        <div key={c.id} className="bg-secondary p-3 rounded flex items-center justify-between">
          <span className="font-body text-sm text-foreground">{c.category_name}</span>
          <div className="flex items-center gap-2">
            <Switch checked={c.active} onCheckedChange={v => toggle(c.id, v)} />
            <button onClick={() => remove(c.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="New review category" className="bg-secondary text-foreground h-10 flex-1" onKeyDown={e => e.key === 'Enter' && add()} />
        <Button onClick={add} size="sm"><Plus className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
};

// --- Activity Feed ---
const ActivitySection = ({ requests, reviews, tourBookings, qc }: { requests: any[]; reviews: any[]; tourBookings: any[]; qc: any }) => {
  const updateRequestStatus = async (id: string, status: string) => {
    await supabase.from('guest_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-requests-admin'] });
    toast.success(`Request ${status}`);
  };

  return (
    <div className="space-y-4">
      <h4 className="font-display text-sm text-foreground tracking-wider">Guest Requests</h4>
      {requests.length === 0 && <p className="font-body text-xs text-muted-foreground">No requests yet</p>}
      {requests.map((r: any) => (
        <div key={r.id} className="bg-secondary p-3 rounded space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-body text-sm text-foreground">{r.request_type} — {r.guest_name}</span>
            <span className={`font-body text-xs px-2 py-0.5 rounded ${r.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : r.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
          </div>
          <p className="font-body text-xs text-muted-foreground">{r.details}</p>
          {r.status === 'pending' && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => updateRequestStatus(r.id, 'in_progress')} className="font-body text-xs text-accent hover:underline">Accept</button>
              <button onClick={() => updateRequestStatus(r.id, 'completed')} className="font-body text-xs text-green-400 hover:underline">Complete</button>
            </div>
          )}
          {r.status === 'in_progress' && (
            <button onClick={() => updateRequestStatus(r.id, 'completed')} className="font-body text-xs text-green-400 hover:underline">Mark Complete</button>
          )}
        </div>
      ))}

      <h4 className="font-display text-sm text-foreground tracking-wider pt-4">Tour Bookings</h4>
      {tourBookings.length === 0 && <p className="font-body text-xs text-muted-foreground">No tour bookings yet</p>}
      {tourBookings.map((b: any) => (
        <div key={b.id} className="bg-secondary p-3 rounded">
          <span className="font-body text-sm text-foreground">{b.tour_name} — {b.guest_name} — {b.pax} pax — ₱{b.price}</span>
          <p className="font-body text-xs text-muted-foreground">{b.tour_date} · {b.status}</p>
        </div>
      ))}

      <h4 className="font-display text-sm text-foreground tracking-wider pt-4">Guest Reviews</h4>
      {reviews.length === 0 && <p className="font-body text-xs text-muted-foreground">No reviews yet</p>}
      {reviews.map((r: any) => (
        <div key={r.id} className="bg-secondary p-3 rounded space-y-1">
          <span className="font-body text-sm text-foreground">{r.guest_name}</span>
          {r.ratings && typeof r.ratings === 'object' && Object.entries(r.ratings as Record<string, number>).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="font-body text-xs text-muted-foreground w-28">{k}</span>
              <span className="font-body text-xs text-foreground">{'★'.repeat(v as number)}{'☆'.repeat(5 - (v as number))}</span>
            </div>
          ))}
          {r.comments && <p className="font-body text-xs text-muted-foreground italic">"{r.comments}"</p>}
        </div>
      ))}
    </div>
  );
};

export default GuestPortalConfig;
