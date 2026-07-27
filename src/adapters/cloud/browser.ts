'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

let browserClient: SupabaseClient<Database> | null | undefined;

export function getBrowserSupabase(): SupabaseClient<Database> | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('your-project-ref') || key.includes('your-browser-safe')) {
    browserClient = null;
    return browserClient;
  }
  browserClient = createBrowserClient<Database>(url, key);
  return browserClient;
}
