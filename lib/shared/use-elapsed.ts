'use client';

import { useEffect, useState } from 'react';

/** Live-updating "Xm ago" label, recomputed from a real timestamp every 30s. */
export function useElapsed(since: string): string {
  const [label, setLabel] = useState('');

  useEffect(() => {
    function update() {
      const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60_000);
      setLabel(mins <= 0 ? 'just now' : `${mins}m ago`);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [since]);

  return label;
}
