// ═══════════════════════════════════════════════════════════════
// Olympus Design System — Responsive Breakpoints & Tokens
// ═══════════════════════════════════════════════════════════════
// Source of truth for all responsive values.
// Change here → propagates everywhere.
// ═══════════════════════════════════════════════════════════════

/** Bootstrap v5 breakpoint categories, used as responsive values */
export const Breakpoint = {
  /** 576px */
  sm: 576,
  /** 768px — general mobile layout boundary */
  md: 768,
  /** 992px — used by dense pages (Agents, Plugins, etc.) */
  lg: 992,
  /** 1200px */
  xl: 1200,
  /** 1400px */
  xxl: 1400,
} as const satisfies Record<string, number>;

export type BreakpointKey = keyof typeof Breakpoint;

/**
 * Reactive hook that returns `true` when the viewport is at or below
 * the given breakpoint key.
 *
 * Uses `matchMedia` instead of `resize` listener for zero-CPU passive monitoring.
 *
 * @example
 *   const isMobile = useResponsive('md'); // true at ≤ 768px
 *   const isMobileExtended = useResponsive('lg'); // true at ≤ 992px
 */
export function useResponsive(bp: BreakpointKey): boolean {
  const getInitial = (): boolean => {
    if (typeof window === 'undefined') return false;
    const key = ((window as any)?.__OLYMPUS_BREAKPOINT_OVERRIDE?.[bp] ?? Breakpoint[bp]) as number;
    return window.matchMedia(`(max-width: ${key - 1}px)`).matches;
  };

  const [matches, setMatches] = useState(getInitial);
  const mqlRef = useRef<MediaQueryList | null>(null);
  const key = (typeof window !== 'undefined' ? (window as any)?.__OLYMPUS_BREAKPOINT_OVERRIDE?.[bp] : undefined) ?? Breakpoint[bp];

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${key - 1}px)`);
    mqlRef.current = mq;
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [bp, key]);

  return matches;
}

import { useState, useEffect, useRef } from 'react';
