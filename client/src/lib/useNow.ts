// OWNER: Andrew. The current time, refreshed every minute, so countdowns on an open screen move
// without reading the clock during render.
import { useEffect, useState } from 'react';

export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
