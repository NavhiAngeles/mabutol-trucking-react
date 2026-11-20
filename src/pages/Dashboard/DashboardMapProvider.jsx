import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardMapContext } from './dashboardMapContext';
import DashboardTrackingMap from './DashboardTrackingMap';

function MapSession({ children }) {
  const [host] = useState(() => document.createElement('div'));
  const [visited, setVisited] = useState(false);
  const [slotActive, setSlotActive] = useState(false);

  return (
    <DashboardMapContext.Provider value={{ host, activate: setVisited, setSlotActive }}>
      {children}
      {visited && createPortal(<DashboardTrackingMap active={slotActive} />, host)}
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
  const { host, activate, setSlotActive } = useContext(DashboardMapContext);

  useLayoutEffect(() => {
    slot.current.appendChild(host);
    activate(true);
    if (typeof setSlotActive === 'function') setSlotActive(true);
    return () => {
      if (typeof setSlotActive === 'function') setSlotActive(false);
      host.remove();
    };
  }, [host, activate, setSlotActive]);

  return <div ref={slot} />;
}
