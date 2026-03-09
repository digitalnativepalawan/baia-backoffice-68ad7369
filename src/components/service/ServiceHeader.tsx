import { useNavigate } from 'react-router-dom';
import { LogOut, ChefHat, Wine, ConciergeBell, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const DEPT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  kitchen: { label: 'Kitchen', icon: <ChefHat className="w-5 h-5" />, color: 'bg-[hsl(25,85%,55%)]' },
  bar: { label: 'Bar', icon: <Wine className="w-5 h-5" />, color: 'bg-[hsl(270,60%,55%)]' },
  reception: { label: 'Reception', icon: <ConciergeBell className="w-5 h-5" />, color: 'bg-[hsl(210,70%,50%)]' },
};

interface ServiceHeaderProps {
  department: 'kitchen' | 'bar' | 'reception';
}

const ServiceHeader = ({ department }: ServiceHeaderProps) => {
  const navigate = useNavigate();
  const config = DEPT_CONFIG[department];

  const handleBack = () => navigate('/service');

  const handleLogout = () => {
    sessionStorage.removeItem('staff_home_session');
    localStorage.removeItem('emp_id');
    localStorage.removeItem('emp_name');
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border flex-shrink-0">
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="w-10 h-10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Badge className={`${config.color} text-white font-display text-xs tracking-widest uppercase px-3 py-1 border-0 gap-1.5`}>
            {config.icon}
            {config.label} Service
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-body text-xs text-muted-foreground hidden sm:inline">Service Mode</span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1 text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline font-display text-xs tracking-wider">Exit</span>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default ServiceHeader;
