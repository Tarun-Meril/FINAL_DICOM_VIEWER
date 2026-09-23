import { createClient } from '@supabase/supabase-js';
import { ENV } from '../../config/env';

const supabaseUrl = ENV.SUPABASE.URL || 'https://placeholder-url.supabase.co';
// Use SERVICE_ROLE_KEY for server-side operations that bypass standard row-level policies
const supabaseKey = ENV.SUPABASE.SERVICE_ROLE_KEY || ENV.SUPABASE.ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Server environment, no session persistence needed
  }
});
