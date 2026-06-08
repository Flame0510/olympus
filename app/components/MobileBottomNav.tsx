'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'Dashboard', path: '/', icon: '📊' },
  { label: 'Lineage', path: '/lineage', icon: '🔗' },
  { label: 'Agents', path: '/agents', icon: '🤖' },
  { label: 'Providers', path: '/providers', icon: '🔧' },
  { label: 'Tools', path: '/tools', icon: '🛠️' },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav">
      {navItems.map((item) => {
        const isActive = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`mobile-bottom-nav__item ${isActive ? 'mobile-bottom-nav__item--active' : ''}`}
          >
            <span className="mobile-bottom-nav__icon">{item.icon}</span>
            <span className="mobile-bottom-nav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
