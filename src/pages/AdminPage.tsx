import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Eye, EyeOff, Receipt, Search, Download, Upload, Trash2, Minus } from 'lucide-react';
import StaffNavBar from '@/components/StaffNavBar';
import MenuBulkImportModal from '@/components/admin/MenuBulkImportModal';
import ResortProfileForm from '@/components/admin/ResortProfileForm';
import SetupExportCard from '@/components/admin/SetupExportCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EditableRow from '@/components/admin/EditableRow';
import TimePicker from '@/components/admin/TimePicker';
import OrderCard from '@/components/admin/OrderCard';
import ReportsDashboard from '@/components/admin/ReportsDashboard';
import PayrollDashboard from '@/components/admin/PayrollDashboard';
import TabInvoice from '@/components/admin/TabInvoice';
import RecipeEditor from '@/components/admin/RecipeEditor';
import InventoryDashboard from '@/components/admin/InventoryDashboard';
import ResortOpsDashboard from '@/components/admin/ResortOpsDashboard';
import ExperiencesPage from '@/pages/ExperiencesPage';
import InvoiceSettingsForm from '@/components/admin/InvoiceSettingsForm';
import StaffAccessManager from '@/components/admin/StaffAccessManager';
import EmployeeContactConfig from '@/components/admin/EmployeeContactConfig';
import ReceptionPage from '@/pages/ReceptionPage';
import TimesheetDashboard from '@/components/admin/TimesheetDashboard';
import WeeklyScheduleManager from '@/components/admin/WeeklyScheduleManager';
import HousekeepingConfig from '@/components/admin/HousekeepingConfig';
import HousekeeperPage from '@/pages/HousekeeperPage';
import RoomSetup from '@/components/admin/RoomSetup';
import DeviceManager from '@/components/admin/DeviceManager';
import BillingConfigForm from '@/components/admin/BillingConfigForm';
import AuditLogView from '@/components/admin/AuditLogView';
import OrderArchive from '@/components/admin/OrderArchive';
import GuestPortalConfig from '@/components/admin/GuestPortalConfig';
import DepartmentOrdersView from '@/components/DepartmentOrdersView';
import IntegrationReadinessDashboard from '@/components/integration/IntegrationReadinessDashboard';
import LiveOpsDashboard from '@/components/admin/LiveOpsDashboard';
import SwarmControl from '@/components/admin/SwarmControl';   // ← Added

import { deductInventoryForOrder } from '@/lib/inventoryDeduction';
import { hasAccess, canEdit, canViewDocuments } from '@/lib/permissions';
import { usePermissions } from '@/hooks/usePermissions';

import { formatDistanceToNow } from 'date-fns';
import { useResortProfile } from '@/hooks/useResortProfile';
import { useDepartmentAlerts } from '@/hooks/useDepartmentAlerts';

type DateFilter = 'today' | 'yesterday' | 'all';

const ALERT_KEY_MAP: Record<string, string> = {
  rooms: 'reception',
  orders: 'orders',
  'guest-services': 'experiences',
  kitchen: 'kitchen',
  bar: 'bar',
  housekeeping: 'housekeeping',
};

// ── Tab / section definitions ────────────────────────────────────
interface TabDef { value: string; label: string; perm: string | null }

const OPERATIONS: TabDef[] = [
  { value: 'rooms', label: 'Reception', perm: 'rooms' },
  { value: 'orders', label: 'Orders', perm: 'orders' },
  { value: 'guest-services', label: 'Guest Services', perm: 'reception' },
  { value: 'kitchen', label: 'Kitchen', perm: 'kitchen' },
  { value: 'bar', label: 'Bar', perm: 'bar' },
  { value: 'housekeeping', label: 'Housekeeping', perm: 'housekeeping' },
  { value: 'live-ops', label: 'Live Ops', perm: null },
];

const PEOPLE: TabDef[] = [
  { value: 'payroll', label: 'HR', perm: 'payroll' },
  { value: 'schedules', label: 'Schedules', perm: 'schedules' },
  { value: 'timesheet', label: 'Timesheet', perm: 'timesheet' },
];

const CONFIG: TabDef[] = [
  { value: 'settings', label: 'Setup', perm: 'setup' },
  { value: 'menu', label: 'Menu', perm: 'menu' },
  { value: 'reports', label: 'Reports', perm: 'reports' },
  { value: 'inventory', label: 'Inventory', perm: 'inventory' },
  { value: 'resort-ops', label: 'Resort Ops', perm: 'resort_ops' },
  { value: 'swarm', label: 'Agent Swarm', perm: null },     // ← Agent Swarm
  { value: 'audit', label: 'Audit', perm: null },
  { value: 'archive', label: 'Archive', perm: null },
  { value: 'guest-portal', label: 'Guest Portal', perm: null },
  ...(import.meta.env.DEV ? [{ value: 'integration', label: 'Integration', perm: null } as TabDef] : []),
];

const AdminPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();

  // ── Permissions ────────────────────────────────────────────────
  const { perms, isAdmin, canView, canEdit: canEditModule, readOnly, canViewDocuments: docsAllowedFn } = usePermissions();

  const allowed = (t: TabDef) => isAdmin || (t.perm !== null && canView(t.perm));
  const opsTabs = OPERATIONS.filter(allowed);
  const peopleTabs = PEOPLE.filter(allowed);
  const cfgTabs = CONFIG.filter(allowed);
  const allTabs = [...opsTabs, ...peopleTabs, ...cfgTabs];
  const defaultTab = allTabs[0]?.value || 'orders';

  const [activeTab, setActiveTab] = useState(defaultTab);
  const alerts = useDepartmentAlerts();

  const docsAllowed = docsAllowedFn();

  // ── Realtime ───────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['orders-admin'] });
        qc.invalidateQueries({ queryKey: ['orders-staff'] });
        qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabs' }, () => {
        qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // ... [All your existing queries, states, functions remain exactly the same] ...

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      <StaffNavBar />

      <div className="max-w-2xl mx-auto px-4 pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab triggers - existing code unchanged */}

          {/* All your existing TabsContent blocks remain here */}

          {/* AGENT SWARM TAB - Added */}
          {isAdmin && (
            <TabsContent value="swarm" className="space-y-6">
              <SwarmControl />
            </TabsContent>
          )}

        </Tabs>
      </div>

      {/* All your existing Dialogs remain unchanged */}
      {/* ... existing Dialogs ... */}

    </div>
  );
};

export default AdminPage;
