import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

import Login from "../pages/Login/login";
import Dashboard from "../pages/Dashboard/dashboard";
import Shipment from "../pages/Shipment/shipment";
import Fleet from "../pages/Fleet/fleet";
import Customer from "../pages/Customer/customer";
import Compliance from "../pages/Compliance/compliance";
import Overview from "../pages/Report/Overview/overview";
import ShipmentReport from "../pages/Report/ShipmentReport/shipmentReport";
import DriverReport from "../pages/Report/DriverReport/driverReport";
import RevenueReport from "../pages/Report/RevenueReport/revenueReport";
import Account from "../pages/Settings/Account/account";
import Notifications from "../pages/Settings/Notification/notification";
import Pricing from "../pages/Settings/Pricing/pricing";
import ComplianceThresholds from "../pages/Settings/ComplianceThreshold/complianceThreshold";
import UserManagement from "../pages/Settings/UserManagement/userManagement";
import Security from "../pages/Settings/Security/security";

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/shipment" element={<ProtectedRoute><Shipment /></ProtectedRoute>} />
        <Route path="/fleet" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
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
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;