import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "../pages/Login/login";
import Dashboard from "../pages/Dashboard/dashboard";
import Shipment from "../pages/Shipment/shipment";
import Fleet from "../pages/Fleet/fleet";

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/shipment" element={<Shipment />} />
        <Route path="/fleet" element={<Fleet />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;