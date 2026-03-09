import { useNavigate } from 'react-router-dom';
import { ChefHat, Wine, ConciergeBell, ArrowLeft, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

const departments = [
  {
    key: 'kitchen',
    label: 'Kitchen',
    subtitle: 'Food preparation board',
    icon: <ChefHat className="w-8 h-8" />,
    color: 'bg-[hsl(25,85%,55%)]',
    route: '/service/kitchen',
  },
  {
    key: 'bar',
    label: 'Bar',
    subtitle: 'Drink preparation board',
    icon: <Wine className="w-8 h-8" />,
    color: 'bg-[hsl(270,60%,55%)]',
    route: '/service/bar',
  },
  {
    key: 'reception',
    label: 'Reception',
    subtitle: 'Service coordination & billing',
    icon: <ConciergeBell className="w-8 h-8" />,
    color: 'bg-[hsl(210,70%,50%)]',
    route: '/service/reception',
  },
];

const ServiceModePage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="w-10 h-10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-gold" />
            <h1 className="font-display text-lg tracking-[0.15em] text-foreground">Service Mode</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-4">
          <p className="font-body text-sm text-muted-foreground text-center mb-6">
            Select a department to open its live service board
          </p>
          {departments.map(dept => (
            <button
              key={dept.key}
              onClick={() => navigate(dept.route)}
              className="w-full bg-card border-2 border-border rounded-xl p-6 flex items-center gap-5 hover:border-accent transition-all text-left group"
            >
              <div className={`w-16 h-16 rounded-xl ${dept.color} flex items-center justify-center text-white flex-shrink-0 group-hover:scale-105 transition-transform`}>
                {dept.icon}
              </div>
              <div>
                <p className="font-display text-xl text-foreground tracking-wider">{dept.label}</p>
                <p className="font-body text-sm text-muted-foreground">{dept.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ServiceModePage;
