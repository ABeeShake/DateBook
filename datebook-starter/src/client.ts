import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const configured = Boolean(url && key);
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-publishable-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

export function canonicalize(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    // Keep meaningful event/article queries but discard common share trackers.
    // Short redirect URLs are not expanded; some duplicates remain possible.
    const params = Array.from(u.searchParams.entries())
      .filter(([k]) => !/^utm_/i.test(k) && !['igsh','igshid','fbclid','gclid','_t','_r','share_id'].includes(k.toLowerCase()))
      .sort(([a],[b]) => a.localeCompare(b));
    const query = new URLSearchParams(params).toString();
    return `https://${host}${path}${query ? '?' + query : ''}`;
  } catch {
    return null;
  }
}

export function dateAtLocalTime(day: string, clock: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) return null;
  const d = new Date(`${day}T${clock}:00`);
  if (Number.isNaN(d.valueOf())) return null;
  // Detect coerced invalid days, e.g. February 31.
  const check = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const actualClock = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return check === day && actualClock === clock ? d : null;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime()
    && new Date(bStart).getTime() < new Date(aEnd).getTime();
}
