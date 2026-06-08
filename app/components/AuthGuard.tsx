'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (pathname === '/login') {
      setChecking(false);
      return;
    }

    fetch('/api/auth/check')
      .then((r) => {
        if (!r.ok) router.push('/login');
        setChecking(false);
      })
      .catch(() => {
        router.push('/login');
        setChecking(false);
      });
  }, [pathname, router]);

  if (checking && pathname !== '/login') return null;

  return <>{children}</>;
}
