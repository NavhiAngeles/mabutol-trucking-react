import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';

// Keep the loader and table list stable. Reconnect, focus and polling recover missed events.
let sequence = 0;
export function useLiveData(loader, tables) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const refreshRef = useRef(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    let disposed = false, running = false, again = false, timer;
    async function load() {
      if (disposed) return;
      if (running) { again = true; return; }
      running = true;
      try {
        const data = await loader();
        if (!disposed) setState({ data, loading: false, error: null });
      } catch (error) {
        if (!disposed) setState(previous => ({ ...previous, loading: false, error }));
      } finally {
        running = false;
        if (again && !disposed) { again = false; schedule(); }
      }
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(load, 250); }
    refreshRef.current = load;
    let channel = supabase.channel('live-data-' + ++sequence);
    for (const table of tables) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    channel.subscribe(status => { if (status === 'SUBSCRIBED') schedule(); });
    schedule();
    const poll = setInterval(load, 15000);
    window.addEventListener('focus', schedule);
    return () => { disposed = true; clearTimeout(timer); clearInterval(poll); window.removeEventListener('focus', schedule); supabase.removeChannel(channel); refreshRef.current = () => {}; };
  }, [loader, tables]);
  return { ...state, refresh };
}
