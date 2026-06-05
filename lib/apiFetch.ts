'use client';

const TOKEN = process.env.NEXT_PUBLIC_OLYMPUS_TOKEN ?? 'olympus2026';

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3720');
  url.searchParams.set('token', TOKEN);
  return fetch(url.toString(), { cache: 'no-store', credentials: 'same-origin', ...init });
}
