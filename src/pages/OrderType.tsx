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
  const isStaff = mode === 'staff';

  const [selectedType, setSelectedType] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
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

  const activeOrderType = orderTypes.find(ot => ot.type_key === selectedType);
  const canProceed = selectedType && locationDetail;

  const getSelectOptions = (sourceTable: string | null) => {
    if (sourceTable === 'units') return units?.map(u => ({ id: u.id, name: u.unit_name })) || [];
    if (sourceTable === 'resort_tables') return tables?.map(t => ({ id: t.id, name: t.table_name })) || [];
    return [];
  };

  const handleProceed = () => {
    if (!canProceed) return;
    const params = new URLSearchParams({ mode, orderType: selectedType, location: locationDetail });
    if (guestName.trim()) params.set('guestName', guestName.trim());
    navigate(`/menu?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col">
      {/* Order Type Selection */}
      <div className="flex flex-col items-center justify-center px-6 py-12 relative">
        <button onClick={() => navigate('/')} className="absolute top-6 left-6 text-cream-dim hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>

        <h2 className="font-display text-2xl tracking-wider text-foreground mb-2">Order Type</h2>
        <p className="font-body text-sm text-cream-dim mb-10">Where would you like your order?</p>

        <div className="w-full max-w-xs flex flex-col gap-6">
          {/* Order type buttons */}
          <div className="grid grid-cols-2 gap-3">
            {orderTypes.map(ot => (
              <button
                key={ot.id}
                onClick={() => { setSelectedType(ot.type_key); setLocationDetail(''); setGuestName(''); }}
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

          {/* Location detail */}
          {activeOrderType && activeOrderType.input_mode === 'select' && activeOrderType.source_table && (
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
          )}

          {activeOrderType && activeOrderType.input_mode === 'text' && (
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
