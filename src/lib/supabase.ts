import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hdkfeonbmhxkagdrbdio.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Ya4b2jOFaJlQU7EoCxj6Yw_Q5MEizoI';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan variables de entorno de Supabase. Verifique .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
