import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute, AuthOnlyRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import PlanGate from "./pages/PlanGate";
import PaymentConfirmed from "./pages/PaymentConfirmed";
import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Placeholder from "./pages/dashboard/Placeholder";
import Family from "./pages/dashboard/Family";
import Wallets from "./pages/dashboard/Wallets";
import Categories from "./pages/dashboard/Categories";
import Cards from "./pages/dashboard/Cards";
import Bills from "./pages/dashboard/Bills";
import Transactions from "./pages/dashboard/Transactions";
import Goals from "./pages/dashboard/Goals";
import Investments from "./pages/dashboard/Investments";
import Behavior from "./pages/dashboard/Behavior";
import Reports from "./pages/dashboard/Reports";
import SupportChat from "./pages/dashboard/SupportChat";
import AdminSupport from "./pages/dashboard/AdminSupport";
import AdminUsers from "./pages/dashboard/AdminUsers";
import Settings from "./pages/dashboard/Settings";
import NyloChat from "./pages/dashboard/NyloChat";
import Reminders from "./pages/dashboard/Reminders";
import Gamification from "./pages/dashboard/Gamification";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";
import DesignPreview from "./pages/DesignPreview";
import { PWASplashScreen } from "./components/PWASplashScreen";

const queryClient = new QueryClient();

// If running as PWA (standalone), redirect / to /login instead of showing the landing page
function IndexRoute() {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
  return isStandalone ? <Navigate to="/login" replace /> : <Index />;
}

const App = () => (
  <PWASplashScreen>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<IndexRoute />} />
            <Route path="/design-preview" element={<DesignPreview />} />
            <Route path="/install" element={<Install />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* Página de planos — requer login mas não plano ativo */}
            <Route
              path="/planos"
              element={
                <AuthOnlyRoute>
                  <PlanGate />
                </AuthOnlyRoute>
              }
            />

            {/* Página de confirmação de pagamento */}
            <Route
              path="/pagamento-confirmado"
              element={
                <AuthOnlyRoute>
                  <PaymentConfirmed />
                </AuthOnlyRoute>
              }
            />

            {/* Dashboard — requer login + plano ativo */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="bills" element={<Bills />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="wallets" element={<Wallets />} />
              <Route path="cards" element={<Cards />} />
              <Route path="budgets" element={<Categories />} />
              <Route path="goals" element={<Goals />} />
              <Route path="reports" element={<Reports />} />
              <Route path="chat" element={<SupportChat />} />
              <Route path="family" element={<Family />} />
              <Route path="settings" element={<Settings />} />
              <Route path="investments" element={<Investments />} />
              <Route path="behavior" element={<Behavior />} />
              <Route path="admin/support" element={<AdminSupport />} />
              <Route path="admin/users" element={<AdminUsers />} />
              <Route path="brave-ia" element={<NyloChat />} />
              <Route path="reminders" element={<Reminders />} />
              <Route path="gamification" element={<Gamification />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </PWASplashScreen>
);

export default App;
