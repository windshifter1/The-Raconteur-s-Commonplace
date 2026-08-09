import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env at the repo root.',
  );
}

export const supabase = createClient(url || '', anonKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const MEDIA_BUCKET = 'library-media';
