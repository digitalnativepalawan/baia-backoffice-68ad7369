import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Briefcase, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { hasAccess } from '@/lib/permissions';
import { getHomeRoute } from '@/lib/getHomeRoute';

const SESSION_KEY = 'staff_home_session';

interface Session {
  name: string;
  employeeId: string;
  permissions: string[];
  expiresAt: number;
}

const getSession = (): Session | null => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const s = JSON.parse(stored);
      if (s.expiresAt > Date.now()) return s;
    }
  } catch {}
  return null;
};

const StaffNavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) return null;

  const perms: string[] = session.permissions || [];
  const isAdmin = perms.includes('admin');
  const displayName = session.name || 'Staff';

  // Dashboard access: admin or any manager-level permission
  const MANAGER_SECTIONS = ['orders', 'menu', 'kitchen', 'bar', 'housekeeping', 'reception', 'experiences', 'reports', 'inventory', 'payroll', 'resort_ops', 'rooms', 'schedules', 'setup', 'timesheet'];
  const hasDashboardAccess = isAdmin || MANAGER_SECTIONS.some(s => hasAccess(perms, s));

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('emp_id');
    localStorage.removeItem('emp_name');
    navigate('/');
  };

  const goHome = () => {
    const route = getHomeRoute(perms);
    navigate(route);
    setMenuOpen(false);
  };

  const goMyWork = () => {
    navigate('/employee-portal');
    setMenuOpen(false);
  };

  const goDashboard = () => {
    navigate('/admin');
    setMenuOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  // Shared nav items
  const NavItems = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <Button
        variant={isActive(getHomeRoute(perms)) ? 'default' : 'ghost'}
        size="sm"
        onClick={goHome}
        className={`font-display text-xs tracking-wider gap-1.5 ${mobile ? 'w-full justify-start' : ''}`}
      >
        <Home className="w-4 h-4" />
        Home
      </Button>
      <Button
        variant={isActive('/employee-portal') ? 'default' : 'ghost'}
        size="sm"
        onClick={goMyWork}
        className={`font-display text-xs tracking-wider gap-1.5 ${mobile ? 'w-full justify-start' : ''}`}
      >
        <Briefcase className="w-4 h-4" />
        My Work
      </Button>
      {hasDashboardAccess && (
        <Button
          variant={isActive('/admin') ? 'default' : 'ghost'}
          size="sm"
          onClick={goDashboard}
          className={`font-display text-xs tracking-wider gap-1.5 ${mobile ? 'w-full justify-start' : ''}`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </Button>
      )}
    </>
  );

  return (
    <nav className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border mb-4">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          <NavItems />
        </div>

        {/* Mobile nav - show Home and My Work directly */}
        <div className="flex sm:hidden items-center gap-1">
          <Button
            variant={isActive(getHomeRoute(perms)) ? 'default' : 'ghost'}
            size="sm"
            onClick={goHome}
            className="font-display text-xs tracking-wider gap-1 px-2"
          >
            <Home className="w-4 h-4" />
          </Button>
          <Button
            variant={isActive('/employee-portal') ? 'default' : 'ghost'}
            size="sm"
            onClick={goMyWork}
            className="font-display text-xs tracking-wider gap-1 px-2"
          >
            <Briefcase className="w-4 h-4" />
          </Button>
        </div>

        {/* Right side - staff name + logout (desktop) / hamburger (mobile) */}
        <div className="hidden sm:flex items-center gap-3">
          <span className="font-body text-xs text-muted-foreground">{displayName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="font-display text-xs tracking-wider gap-1 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>
        </div>

        {/* Mobile hamburger menu */}
        <div className="flex sm:hidden items-center">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="px-2">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 bg-background border-border">
              <SheetTitle className="font-display text-sm tracking-wider text-foreground mb-4">
                {displayName}
              </SheetTitle>
              <div className="flex flex-col gap-2">
                <NavItems mobile />
                <div className="border-t border-border my-2" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { handleLogout(); setMenuOpen(false); }}
                  className="font-display text-xs tracking-wider gap-1.5 w-full justify-start text-destructive hover:text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};

export default StaffNavBar;
