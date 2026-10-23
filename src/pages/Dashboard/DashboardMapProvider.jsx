import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardMapContext } from './dashboardMapContext';
import DashboardTrackingMap from './DashboardTrackingMap';

function MapSession({ children }) {
  const [host] = useState(() => document.createElement('div'));
  const [visited, setVisited] = useState(false);

  return (
    <DashboardMapContext.Provider value={{ host, activate: setVisited }}>
      {children}
      {visited && createPortal(<DashboardTrackingMap />, host)}
    </DashboardMapContext.Provider>
  );
}

// A new account (or sign-out) releases the previous session's map and WebGL resources.
export default function DashboardMapProvider({ children }) {
  const { user, role } = useAuth();
  const sessionKey = user && ['admin', 'staff'].includes(role) ? user.id : 'signed-out';
  return <MapSession key={sessionKey}>{children}</MapSession>;
}

export function DashboardMapSlot() {
  const slot = useRef(null);
  const { host, activate } = useContext(DashboardMapContext);

  useLayoutEffect(() => {
    slot.current.appendChild(host);
    activate(true);
    return () => host.remove();
  }, [host, activate]);

  return <div ref={slot} />;
}
