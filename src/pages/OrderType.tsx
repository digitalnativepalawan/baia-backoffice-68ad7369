import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import StaffOrdersView from '@/components/staff/StaffOrdersView';

const OrderType = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'guest';
  const returnTo = searchParams.get('returnTo') || '';
  const isStaff = mode === 'staff';

  const [selectedType, setSelectedType] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [tableDetail, setTableDetail] = useState('');
  const [guestName, setGuestName] = useState('');

  const { data: orderTypes = [] } = useQuery({
    queryKey: ['order-types'],
    queryFn: async () => {
      const { data } = await supabase.from('order_types').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').eq('active', true).order('unit_name');
      return data || [];
    },
  });

  const { data: tables } = useQuery({
    queryKey: ['resort_tables'],
    queryFn: async () => {
      const { data } = await supabase.from('resort_tables').select('*').eq('active', true).order('table_name');
      return data || [];
    },
  });

  // Query occupied rooms with guest names for quick-select
  const { data: occupiedGuests = [] } = useQuery({
    queryKey: ['occupied-guests'],
    enabled: isStaff,
    queryFn: async () => {
      // Get occupied units
      const occupiedUnits = (units || []).filter(u => u.status === 'occupied');
      if (occupiedUnits.length === 0) return [];

      // Get resort_ops_units for name-based matching
      const { data: opsUnits } = await supabase.from('resort_ops_units').select('id, name');

      // Get today's active bookings
      const today = new Date().toISOString().split('T')[0];
      const { data: bookings } = await supabase
        .from('resort_ops_bookings')
        .select('*, resort_ops_guests(full_name)')
        .lte('check_in', today)
        .gt('check_out', today);

      return occupiedUnits.map(unit => {
        // Find matching ops unit by normalized name
        const opsUnit = opsUnits?.find(
          ou => ou.name.toLowerCase().trim() === unit.unit_name.toLowerCase().trim()
        );
        // Find booking for this ops unit
        const booking = opsUnit
          ? bookings?.find(b => b.unit_id === opsUnit.id)
          : null;
        const guestName = booking?.resort_ops_guests?.full_name || '';
        return {
          unitId: unit.id,
          unitName: unit.unit_name,
          guestName,
        };
      });
    },
    refetchInterval: 30000, // refresh every 30s for real-time feel
  });

  const activeOrderType = orderTypes.find(ot => ot.type_key === selectedType);
  const isDineIn = selectedType === 'DineIn';
  const canProceed = selectedType && locationDetail && (!isDineIn || tableDetail);

  const getSelectOptions = (sourceTable: string | null) => {
    if (sourceTable === 'units') return units?.map(u => ({ id: u.id, name: u.unit_name })) || [];
    if (sourceTable === 'resort_tables') return tables?.map(t => ({ id: t.id, name: t.table_name })) || [];
    return [];
  };

  const handleGuestCardTap = (guest: { unitName: string; guestName: string }) => {
    const params = new URLSearchParams({
      mode,
      orderType: 'Room',
      location: guest.unitName,
      roomName: guest.unitName,
    });
    if (guest.guestName) params.set('guestName', guest.guestName);
    if (returnTo) params.set('returnTo', returnTo);
    navigate(`/menu?${params.toString()}`);
  };

  const handleProceed = () => {
    if (!canProceed) return;
    const finalLocation = isDineIn ? `${locationDetail} – ${tableDetail}` : locationDetail;
    const params = new URLSearchParams({ mode, orderType: selectedType, location: finalLocation });
    if (guestName.trim()) params.set('guestName', guestName.trim());
    const sourceTable = activeOrderType?.source_table;
    if (sourceTable === 'units' || isDineIn) {
      params.set('roomName', locationDetail);
    }
    if (returnTo) params.set('returnTo', returnTo);
    navigate(`/menu?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col">
      <div className="flex flex-col items-center justify-center px-6 py-12 relative">
        <button onClick={() => navigate(returnTo || '/')} className="absolute top-6 left-6 text-cream-dim hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>

        <h2 className="font-display text-2xl tracking-wider text-foreground mb-2">Order Type</h2>
        <p className="font-body text-sm text-cream-dim mb-6">Where would you like your order?</p>

        {/* Current Guests quick-select (staff only) */}
        {isStaff && occupiedGuests.length > 0 && (
          <div className="w-full max-w-xs mb-8">
            <p className="font-display text-xs tracking-widest text-gold uppercase mb-3 text-center">Current Guests</p>
            <div className="grid grid-cols-1 gap-2">
              {occupiedGuests.map(guest => (
                <button
                  key={guest.unitId}
                  onClick={() => handleGuestCardTap(guest)}
                  className="flex items-center gap-3 px-4 py-3 border border-border rounded-md bg-secondary/50 hover:border-gold/60 transition-colors text-left"
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-display text-sm text-foreground tracking-wide block truncate">{guest.unitName}</span>
                    {guest.guestName && (
                      <span className="font-body text-xs text-cream-dim block truncate">{guest.guestName}</span>
                    )}
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cream-dim shrink-0"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="w-full max-w-xs flex flex-col gap-6">
          {/* Order type buttons */}
          <div className="grid grid-cols-2 gap-3">
            {orderTypes.map(ot => (
              <button
                key={ot.id}
                onClick={() => { setSelectedType(ot.type_key); setLocationDetail(''); setTableDetail(''); setGuestName(''); }}
                className={`min-h-[48px] py-3 border font-display text-sm tracking-wider transition-colors ${
                  selectedType === ot.type_key
                    ? 'border-gold text-foreground bg-foreground/5'
                    : 'border-border text-cream-dim hover:border-foreground/30'
                }`}
              >
                {ot.label}
              </button>
            ))}
          </div>

          {/* DineIn: unit + table + guest name */}
          {activeOrderType && isDineIn && (
            <div className="space-y-3">
              <Select onValueChange={setLocationDetail} value={locationDetail}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {(units || []).map(u => (
                    <SelectItem key={u.id} value={u.unit_name} className="text-foreground font-body">
                      {u.unit_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select onValueChange={setTableDetail} value={tableDetail}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                  <SelectValue placeholder="Select table" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {(tables || []).map(t => (
                    <SelectItem key={t.id} value={t.table_name} className="text-foreground font-body">
                      {t.table_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Guest name (optional)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="bg-secondary border-border text-foreground font-body"
              />
            </div>
          )}

          {/* Standard select (non-DineIn) */}
          {activeOrderType && !isDineIn && activeOrderType.input_mode === 'select' && activeOrderType.source_table && (
            <div className="space-y-3">
              <Select onValueChange={setLocationDetail} value={locationDetail}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                  <SelectValue placeholder={activeOrderType.placeholder || 'Select'} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {getSelectOptions(activeOrderType.source_table).map(item => (
                    <SelectItem key={item.id} value={item.name} className="text-foreground font-body">
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Guest name (optional)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="bg-secondary border-border text-foreground font-body"
              />
            </div>
          )}

          {activeOrderType && !isDineIn && activeOrderType.input_mode === 'text' && (
            <div className="space-y-3">
              <Input
                placeholder={activeOrderType.placeholder || 'Table # or location'}
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                className="bg-secondary border-border text-foreground font-body"
              />
              <Input
                placeholder="Guest name (optional)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="bg-secondary border-border text-foreground font-body"
              />
            </div>
          )}

          <Button
            onClick={handleProceed}
            disabled={!canProceed}
            className="font-display tracking-wider py-6 mt-2"
          >
            View Menu
          </Button>
        </div>
      </div>

      {/* Real-time orders pipeline for staff */}
      {isStaff && (
        <div className="flex-1 border-t border-border">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <h3 className="font-display text-lg tracking-wider text-foreground text-center mb-1">Today's Orders</h3>
          </div>
          <StaffOrdersView />
        </div>
      )}
    </div>
  );
};

export default OrderType;
