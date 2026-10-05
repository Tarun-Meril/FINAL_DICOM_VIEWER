import { createClient } from '@supabase/supabase-js';
import { ENV } from '../../config/env';

// Polyfill minimal WebSocket stub if running in Node < 22 without native WebSocket.
// The PACS server backend uses REST APIs exclusively, but @supabase/supabase-js initializes
// RealtimeClient by default which requires a WebSocket constructor.
if (typeof globalThis.WebSocket === 'undefined') {
  class WebSocketStub {
    static CLOSED = 3;
    static CLOSING = 2;
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = 3;
    constructor() {}
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  }
  (globalThis as any).WebSocket = WebSocketStub;
}

const DEFAULT_SUPABASE_URL = 'https://gjtvxsuorghxqqazlszj.supabase.co';
const DEFAULT_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHZ4c3VvcmdoeHFxYXpsc3pqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTE3MjYzMiwiZXhwIjoyMTA2NzQ4NjMyfQ.Ly6sHtBM4WhnglXkdKFeXKe6gLzNFC3b0JCpVyurk2k';

const supabaseUrl = (ENV.SUPABASE.URL && !ENV.SUPABASE.URL.includes('placeholder')) ? ENV.SUPABASE.URL : DEFAULT_SUPABASE_URL;
// Use SERVICE_ROLE_KEY for server-side operations that bypass standard row-level policies
const supabaseKey = (ENV.SUPABASE.SERVICE_ROLE_KEY && !ENV.SUPABASE.SERVICE_ROLE_KEY.includes('placeholder')) ? ENV.SUPABASE.SERVICE_ROLE_KEY : (ENV.SUPABASE.ANON_KEY || DEFAULT_SERVICE_ROLE_KEY);

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Server environment, no session persistence needed
  }
});

