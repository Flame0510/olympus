'use client';

import { useEffect } from 'react';

export default function PWARegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }, { once: true });
  }, []);

  return null;
}
