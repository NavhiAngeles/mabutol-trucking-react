import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import WorkspaceLoadingScreen from "../components/WorkspaceLoadingScreen";
import "./AppRouter.css";

// Auth entry routes (kept static for instant landing TTI)
import Landing from "../pages/Landing/Landing";
import Login from "../pages/Login/login";
import { ForgotPassword, ResetPassword } from '../pages/Login/PasswordRecovery';

// Public informational routes
const ServicesPage = lazy(() => import("../pages/Public/ServicesPage"));
const WorkflowPage = lazy(() => import("../pages/Public/WorkflowPage"));
const MobileAppPage = lazy(() => import("../pages/Public/MobileAppPage"));

// Route-level code-split heavy office pages
const Dashboard = lazy(() => import("../pages/Dashboard/dashboard"));
const Shipment = lazy(() => import("../pages/Shipment/shipment"));
const Fleet = lazy(() => import("../pages/Fleet/fleet"));
const Customer = lazy(() => import("../pages/Customer/customer"));
const Compliance = lazy(() => import("../pages/Compliance/compliance"));

// Reports
const Overview = lazy(() => import("../pages/Report/Overview/overview"));
const ShipmentReport = lazy(() => import("../pages/Report/ShipmentReport/shipmentReport"));
const DriverReport = lazy(() => import("../pages/Report/DriverReport/driverReport"));
const RevenueReport = lazy(() => import("../pages/Report/RevenueReport/revenueReport"));

// Settings
const Account = lazy(() => import("../pages/Settings/Account/account"));
const Notifications = lazy(() => import("../pages/Settings/Notification/notification"));
const Pricing = lazy(() => import("../pages/Settings/Pricing/pricing"));
const ComplianceThresholds = lazy(() => import("../pages/Settings/ComplianceThreshold/complianceThreshold"));
const UserManagement = lazy(() => import("../pages/Settings/UserManagement/userManagement"));
const Security = lazy(() => import("../pages/Settings/Security/security"));

export function RouteLoadingFallback() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="route-loading-fallback">
      <div className="route-loading-card">
        <div className="route-loading-brand" aria-hidden="true">
          <img
            src="/tanaw-logo.png"
            alt=""
            width="36"
            height="36"
            className="route-loading-logo"
            decoding="sync"
          />
          <div className="route-loading-brand-text">
            <strong>TANAW</strong>
            <span>Mabutol Trucking</span>
          </div>
        </div>
        <div className="route-loading-status">
          <div className="route-loading-spinner" aria-hidden="true" />
          <span>Loading page…</span>
        </div>
      </div>
    </div>
  );
}

function WorkspaceSuspense() {
  return (
    <Suspense
      fallback={
        <WorkspaceLoadingScreen
          message="Loading dispatch workspace…"
          detail="Preparing operational views, live telemetry, and fleet controls."
        />
      }
    >
      <Outlet />
    </Suspense>
  );
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/workflow" element={<WorkflowPage />} />
          <Route path="/mobile-app" element={<MobileAppPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<WorkspaceSuspense />}>
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/shipment" element={<ProtectedRoute><Shipment /></ProtectedRoute>} />
            <Route path="/fleet" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
            <Route path="/fleet/overview" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
            <Route path="/fleet/vehicles" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
            <Route path="/fleet/drivers" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
            <Route path="/fleet/maintenance" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
            <Route path="/customer" element={<ProtectedRoute><Customer /></ProtectedRoute>} />
            <Route path="/compliance" element={<ProtectedRoute><Compliance /></ProtectedRoute>} />

            <Route path="/Report/overview" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
            <Route path="/Report/shipmentReport" element={<ProtectedRoute><ShipmentReport /></ProtectedRoute>} />
            <Route path="/Report/driverReport" element={<ProtectedRoute><DriverReport /></ProtectedRoute>} />
            <Route path="/Report/revenueReport" element={<ProtectedRoute><RevenueReport /></ProtectedRoute>} />

            <Route path="/Settings/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
            <Route path="/Settings/notification" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/Settings/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
            <Route path="/Settings/complianceThreshold" element={<ProtectedRoute><ComplianceThresholds /></ProtectedRoute>} />
            <Route path="/Settings/userManagement" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
            <Route path="/Settings/security" element={<ProtectedRoute><Security /></ProtectedRoute>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default AppRouter;
