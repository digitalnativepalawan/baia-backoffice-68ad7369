import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useResortProfile } from '@/hooks/useResortProfile';

const Index = () => {
  const navigate = useNavigate();
  const { data: profile } = useResortProfile();
  const [passkeyMode, setPasskeyMode] = useState<'staff' | 'admin' | null>(null);
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState('');

  const handlePasskey = () => {
    if (passkey === '5309') {
      if (passkeyMode === 'staff') navigate('/order-type?mode=staff');
      else navigate('/admin');
      setPasskeyMode(null);
      setPasskey('');
      setError('');
    } else {
      setError('Invalid passkey');
    }
  };

  const logoSize = profile?.logo_size || 128;

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col items-center justify-center px-6">
      {/* Decorative line */}
      <div className="w-16 h-px bg-gold mb-8 opacity-60" />

      {/* Brand */}
      <h1 className="font-display text-4xl md:text-5xl tracking-[0.2em] text-foreground text-center mb-2">
        NATIVO
      </h1>
      <p className="font-display text-lg md:text-xl tracking-[0.35em] text-cream-dim mb-1">
        D' KUBO
      </p>

      {profile?.tagline && (
        <p className="font-body text-sm text-cream-dim/70 tracking-wider mb-1">{profile.tagline}</p>
      )}
      <div className="mb-12" />

      <div className="w-16 h-px bg-gold mb-12 opacity-40" />

      {/* Entry buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => navigate('/order-type?mode=guest')}
          className="font-display text-base tracking-wider py-4 border border-foreground/30 text-foreground hover:bg-foreground/5 transition-colors"
        >
          View Menu
        </button>
        <button
          onClick={() => setPasskeyMode('staff')}
          className="font-display text-base tracking-wider py-4 border border-foreground/20 text-cream-dim hover:bg-foreground/5 transition-colors"
        >
          Staff Order
        </button>
        <button
          onClick={() => setPasskeyMode('admin')}
          className="font-body text-sm tracking-wider py-3 text-cream-dim/60 hover:text-cream-dim transition-colors"
        >
          Admin
        </button>
      </div>

      {/* Passkey dialog */}
      <Dialog open={!!passkeyMode} onOpenChange={() => { setPasskeyMode(null); setPasskey(''); setError(''); }}>
        <DialogContent className="bg-card border-border max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider text-center">
              {passkeyMode === 'staff' ? 'Staff Access' : 'Admin Access'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <Input
              type="password"
              placeholder="Enter passkey"
              value={passkey}
              onChange={(e) => { setPasskey(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handlePasskey()}
              className="bg-secondary border-border text-foreground text-center font-body text-lg tracking-widest"
            />
            {error && <p className="text-destructive text-sm text-center font-body">{error}</p>}
            <Button onClick={handlePasskey} className="font-display tracking-wider">
              Enter
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
