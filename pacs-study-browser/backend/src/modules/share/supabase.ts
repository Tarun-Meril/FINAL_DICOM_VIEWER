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

const supabaseUrl = ENV.SUPABASE.URL || 'https://placeholder-url.supabase.co';
// Use SERVICE_ROLE_KEY for server-side operations that bypass standard row-level policies
const supabaseKey = ENV.SUPABASE.SERVICE_ROLE_KEY || ENV.SUPABASE.ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Server environment, no session persistence needed
  }
});

