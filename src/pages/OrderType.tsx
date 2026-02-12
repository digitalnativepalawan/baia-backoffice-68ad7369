import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type OrderType = 'Room' | 'DineIn' | 'Beach' | 'WalkIn';

const OrderType = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'guest';

  const [orderType, setOrderType] = useState<OrderType | ''>('');
  const [locationDetail, setLocationDetail] = useState('');

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

  const canProceed = orderType && locationDetail;

  const handleProceed = () => {
    if (!canProceed) return;
    const params = new URLSearchParams({ mode, orderType, location: locationDetail });
    navigate(`/menu?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col items-center justify-center px-6">
      <button onClick={() => navigate('/')} className="absolute top-6 left-6 font-body text-sm text-cream-dim hover:text-foreground transition-colors">
        ← Back
      </button>

      <h2 className="font-display text-2xl tracking-wider text-foreground mb-2">Order Type</h2>
      <p className="font-body text-sm text-cream-dim mb-10">Where would you like your order?</p>

      <div className="w-full max-w-xs flex flex-col gap-6">
        {/* Order type buttons */}
        <div className="grid grid-cols-2 gap-3">
          {([
            ['Room', 'Room / Unit'],
            ['DineIn', 'Dine In'],
            ['Beach', 'Beach'],
            ['WalkIn', 'Walk-In'],
          ] as [OrderType, string][]).map(([type, label]) => (
            <button
              key={type}
              onClick={() => { setOrderType(type); setLocationDetail(''); }}
              className={`py-3 border font-display text-sm tracking-wider transition-colors ${
                orderType === type
                  ? 'border-gold text-foreground bg-foreground/5'
                  : 'border-border text-cream-dim hover:border-foreground/30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Location detail */}
        {orderType === 'Room' && (
          <Select onValueChange={setLocationDetail} value={locationDetail}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {units?.map(u => (
                <SelectItem key={u.id} value={u.unit_name} className="text-foreground font-body">
                  {u.unit_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {orderType === 'DineIn' && (
          <Select onValueChange={setLocationDetail} value={locationDetail}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body">
              <SelectValue placeholder="Select table" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {tables?.map(t => (
                <SelectItem key={t.id} value={t.table_name} className="text-foreground font-body">
                  {t.table_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {orderType === 'Beach' && (
          <Input
            placeholder="Describe your location (e.g., near the kayaks)"
            value={locationDetail}
            onChange={(e) => setLocationDetail(e.target.value)}
            className="bg-secondary border-border text-foreground font-body"
          />
        )}

        {orderType === 'WalkIn' && (
          <Input
            placeholder="Your name"
            value={locationDetail}
            onChange={(e) => setLocationDetail(e.target.value)}
            className="bg-secondary border-border text-foreground font-body"
          />
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
  );
};

export default OrderType;
