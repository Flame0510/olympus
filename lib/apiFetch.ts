'use client';

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = typeof window !== 'undefined' ? new URL(path, window.location.origin) : new URL(path, 'http://localhost:3720');
  // Auth via JWT cookie (set by /api/auth/login) — no query param needed
  return fetch(url.toString(), { cache: 'no-store', credentials: 'same-origin', ...init });
}
