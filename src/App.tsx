import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import OrderType from "./pages/OrderType";
import MenuPage from "./pages/MenuPage";
import AdminPage from "./pages/AdminPage";
import EmployeePage from "./pages/EmployeePage";
import EmployeePortal from "./pages/EmployeePortal";
import KitchenPage from "./pages/KitchenPage";
import BarPage from "./pages/BarPage";
import NotFound from "./pages/NotFound";
import HousekeeperPage from "./pages/HousekeeperPage";
import GuestPortalPage from "./pages/GuestPortal";
import ReceptionPage from "./pages/ReceptionPage";
import ExperiencesPage from "./pages/ExperiencesPage";
import StaffShell from "./pages/StaffShell";
import RequireAuth from "./components/RequireAuth";
import ServiceModePage from "./pages/ServiceModePage";
import ServiceKitchenPage from "./pages/ServiceKitchenPage";
import ServiceBarPage from "./pages/ServiceBarPage";
import ServiceReceptionPage from "./pages/ServiceReceptionPage";
import ServiceCashierPage from "./pages/ServiceCashierPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/guest-portal" element={<GuestPortalPage />} />

          {/* Service Mode — live operational boards */}
          <Route path="/service" element={<RequireAuth><ServiceModePage /></RequireAuth>} />
          <Route path="/service/kitchen" element={<RequireAuth requiredPermission={['kitchen', 'orders']}><ServiceKitchenPage /></RequireAuth>} />
          <Route path="/service/bar" element={<RequireAuth requiredPermission={['bar', 'orders']}><ServiceBarPage /></RequireAuth>} />
          <Route path="/service/reception" element={<RequireAuth requiredPermission={['reception', 'orders']}><ServiceReceptionPage /></RequireAuth>} />
          <Route path="/service/cashier" element={<RequireAuth requiredPermission={['reception', 'orders']}><ServiceCashierPage /></RequireAuth>} />

          {/* Staff Shell — role-aware action console */}
          <Route path="/staff" element={<RequireAuth><StaffShell /></RequireAuth>} />

          {/* Admin Shell — control tower */}
          <Route path="/admin" element={<RequireAuth adminOnly><AdminPage /></RequireAuth>} />

          {/* Shared operational routes (still accessible directly) */}
          <Route path="/order-type" element={<RequireAuth requiredPermission="orders"><OrderType /></RequireAuth>} />
          <Route path="/employee" element={<RequireAuth><EmployeePage /></RequireAuth>} />
          <Route path="/employee-portal" element={<RequireAuth><EmployeePortal /></RequireAuth>} />

          {/* Legacy direct routes — kept for bookmarks / deep links */}
          <Route path="/kitchen" element={<RequireAuth requiredPermission="kitchen"><KitchenPage /></RequireAuth>} />
          <Route path="/bar" element={<RequireAuth requiredPermission="bar"><BarPage /></RequireAuth>} />
          <Route path="/housekeeper" element={<RequireAuth requiredPermission="housekeeping"><HousekeeperPage /></RequireAuth>} />
          <Route path="/reception" element={<RequireAuth requiredPermission="reception"><ReceptionPage /></RequireAuth>} />
          <Route path="/experiences" element={<RequireAuth requiredPermission={['experiences', 'reception']}><ExperiencesPage /></RequireAuth>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
