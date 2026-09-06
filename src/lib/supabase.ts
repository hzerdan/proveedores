import { createClient } from '@supabase/supabase-js';

// Safe environment variable retrieval compatible with Vite and Node runtimes
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : ((globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env || {});
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://hdkfeonbmhxkagdrbdio.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Ya4b2jOFaJlQU7EoCxj6Yw_Q5MEizoI';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan variables de entorno de Supabase. Verifique .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
