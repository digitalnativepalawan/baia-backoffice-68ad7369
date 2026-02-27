import { useNavigate } from 'react-router-dom';
import { useResortProfile } from '@/hooks/useResortProfile';

const Index = () => {
  const navigate = useNavigate();
  const { data: profile } = useResortProfile();

  const logoSize = profile?.logo_size || 128;

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col items-center justify-center px-6">
      {profile?.logo_url && (
        <img
          src={profile.logo_url}
          alt={profile.resort_name || 'Resort logo'}
          style={{ width: logoSize, height: logoSize }}
          className="object-contain mb-6"
        />
      )}

      {profile?.resort_name && (
        <h1 className="font-display text-4xl md:text-5xl tracking-[0.2em] text-foreground text-center mb-2">
          {profile.resort_name}
        </h1>
      )}

      {profile?.tagline && (
        <p className="font-body text-sm text-cream-dim/70 tracking-wider mb-1">{profile.tagline}</p>
      )}
      <div className="mb-12" />

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => navigate('/menu?mode=guest')}
          className="font-display text-base tracking-wider py-4 border border-foreground/30 text-foreground hover:bg-foreground/5 transition-colors"
        >
          View Menu
        </button>
        <button
          onClick={() => navigate('/order-type?mode=staff')}
          className="font-display text-base tracking-wider py-4 border border-foreground/20 text-cream-dim hover:bg-foreground/5 transition-colors"
        >
          Staff Order
        </button>
        <button
          onClick={() => navigate('/admin')}
          className="font-body text-sm tracking-wider py-3 text-cream-dim/60 hover:text-cream-dim transition-colors"
        >
          Admin
        </button>
        <button
          onClick={() => navigate('/employee')}
          className="font-body text-sm tracking-wider py-3 text-cream-dim/60 hover:text-cream-dim transition-colors"
        >
          Employee
        </button>
      </div>
    </div>
  );
};

export default Index;
