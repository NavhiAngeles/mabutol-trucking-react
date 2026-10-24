import { useEffect, useState } from 'react';
import { reportRange } from '../services/reportOverview.js';

// Refresh calendar presets across midnight, including when a suspended tab returns.
export function useReportRange(key, custom) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  return key === 'custom' ? custom : reportRange(key, undefined, undefined, now);
}
