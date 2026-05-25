import { useState, useEffect, useCallback } from 'react';

export function useConnection() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = () => {
      setConnected(
        typeof window.toolboxAPI !== 'undefined' &&
        typeof window.dataverseAPI !== 'undefined'
      );
    };
    check();
    window.addEventListener('toolbox:connected', check);
    return () => window.removeEventListener('toolbox:connected', check);
  }, []);

  return connected;
}

export function useToolboxEvents() {
  const [events, setEvents] = useState<Array<{ type: string; data: unknown; ts: number }>>([]);

  const log = useCallback((type: string, data: unknown) => {
    setEvents((prev) => [...prev.slice(-99), { type, data, ts: Date.now() }]);
  }, []);

  return { events, log };
}
