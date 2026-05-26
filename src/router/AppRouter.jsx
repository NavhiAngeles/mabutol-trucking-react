import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "../pages/Login/login";
import Dashboard from "../pages/Dashboard/dashboard";
import Shipment from "../pages/Shipment/shipment";
import Fleet from "../pages/Fleet/fleet";
import Customer from "../pages/Customer/customer";
import Compliance from "../pages/Compliance/compliance";
// Reports
import Overview from "../pages/Report/Overview/overview";
import ShipmentReport from "../pages/Report/ShipmentReport/shipmentReport";
import DriverReport from "../pages/Report/DriverReport/driverReport";
import RevenueReport from "../pages/Report/RevenueReport/revenueReport";

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/shipment" element={<Shipment />} />
        <Route path="/fleet" element={<Fleet />} />
        <Route path="/customer" element={<Customer />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/Report/overview" element={<Overview />} />
        <Route path="/Report/shipmentReport" element={<ShipmentReport />} />
        <Route path="/Report/driverReport" element={<DriverReport />} />
        <Route path="/Report/revenueReport" element={<RevenueReport />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;