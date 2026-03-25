import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Calendar, Clock, Users, Cake, Phone, Mail } from 'lucide-react';

interface ReservationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ReservationModal = ({ open, onOpenChange }: ReservationModalProps) => {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    guest_name: '',
    reservation_date: '',
    reservation_time: '19:00',
    pax: 2,
    occasion: '',
    contact_number: '',
    email: '',
    notes: '',
  });

  const handleSubmit = async () => {
    if (!formData.guest_name.trim()) {
      toast.error('Guest name is required');
      return;
    }
    if (!formData.reservation_date) {
      toast.error('Reservation date is required');
      return;
    }
    if (!formData.reservation_time) {
      toast.error('Reservation time is required');
      return;
    }
    
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('dining_reservations')
        .insert({
          guest_name: formData.guest_name,
          reservation_date: formData.reservation_date,
          reservation_time: formData.reservation_time,
          pax: formData.pax,
          occasion: formData.occasion || null,
          contact_number: formData.contact_number || null,
          email: formData.email || null,
          notes: formData.notes || null,
          status: 'pending',
        });
      
      if (error) throw error;
      
      toast.success(`Reservation created for ${formData.guest_name}`);
      onOpenChange(false);
      setFormData({
        guest_name: '',
        reservation_date: '',
        reservation_time: '19:00',
        pax: 2,
        occasion: '',
        contact_number: '',
        email: '',
        notes: '',
      });
      qc.invalidateQueries({ queryKey: ['dining-reservations'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to create reservation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl tracking-wider">New Dinner Reservation</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Guest Name */}
          <div className="space-y-2">
            <Label className="font-body text-sm text-foreground">Guest Name *</Label>
            <Input
              placeholder="Full name"
              value={formData.guest_name}
              onChange={(e) => setFormData({ ...formData, guest_name: e.target.value })}
              className="bg-secondary border-border"
            />
          </div>
          
          {/* Reservation Date */}
          <div className="space-y-2">
            <Label className="font-body text-sm text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Reservation Date *
            </Label>
            <Input
              type="date"
              value={formData.reservation_date}
              onChange={(e) => setFormData({ ...formData, reservation_date: e.target.value })}
              className="bg-secondary border-border"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          {/* Reservation Time */}
          <div className="space-y-2">
            <Label className="font-body text-sm text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Reservation Time *
            </Label>
            <select
              value={formData.reservation_time}
              onChange={(e) => setFormData({ ...formData, reservation_time: e.target.value })}
              className="w-full bg-secondary border-border rounded-md px-3 py-2 text-sm"
            >
              <option value="17:00">5:00 PM</option>
              <option value="17:30">5:30 PM</option>
              <option value="18:00">6:00 PM</option>
              <option value="18:30">6:30 PM</option>
              <option value="19:00">7:00 PM</option>
              <option value="19:30">7:30 PM</option>
              <option value="20:00">8:00 PM</option>
              <option value="20:30">8:30 PM</option>
              <option value="21:00">9:00 PM</option>
            </select>
          </div>
          
          {/* Pax */}
          <div className="space-y-2">
            <Label className="font-body text-sm text-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Number of Guests *
            </Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={formData.pax}
              onChange={(e) => setFormData({ ...formData, pax: parseInt(e.target.value) || 1 })}
              className="bg-secondary border-border w-24"
            />
          </div>
          
          {/* Occasion */}
          <div className="space-y-2">
            <Label className="font-body text-sm text-foreground flex items-center gap-2">
              <Cake className="w-4 h-4" /> Occasion (Optional)
            </Label>
            <select
              value={formData.occasion}
              onChange={(e) => setFormData({ ...formData, occasion: e.target.value })}
              className="w-full bg-secondary border-border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Select occasion</option>
              <option value="Birthday">Birthday</option>
              <option value="Anniversary">Anniversary</option>
              <option value="Date Night">Date Night</option>
              <option value="Family Dinner">Family Dinner</option>
              <option value="Business Dinner">Business Dinner</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          {/* Contact Number */}
          <div className="space-y-2">
            <Label className="font-body text-sm text-foreground flex items-center gap-2">
              <Phone className="w-4 h-4" /> Contact Number
            </Label>
            <Input
              placeholder="+63 XXX XXX XXXX"
              value={formData.contact_number}
              onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              className="bg-secondary border-border"
            />
          </div>
          
          {/* Email */}
          <div className="space-y-2">
            <Label className="font-body text-sm text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email
            </Label>
            <Input
              type="email"
              placeholder="guest@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="bg-secondary border-border"
            />
          </div>
          
          {/* Notes */}
          <div className="space-y-2">
            <Label className="font-body text-sm text-foreground">Special Requests / Notes</Label>
            <Textarea
              placeholder="Dietary restrictions, special arrangements, etc."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="bg-secondary border-border min-h-[80px]"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-gold text-background hover:bg-gold/90">
            {loading ? 'Creating...' : 'Create Reservation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReservationModal;
