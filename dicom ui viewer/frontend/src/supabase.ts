/**
 * Supabase Universal Cloud Integration for Netlify & Web Viewers
 * Provides 24/7 autonomous share link validation and DICOM storage streaming
 */

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tlksvspvgicifyeifrll.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsa3N2c3B2Z2ljaWZ5ZWlmcmxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2Mzg4MjMsImV4cCI6MjEwODIxNDgyM30.BcqxYPlQSruTkzvCzt0ATwe0U2Puls9Oy944XTEqkKo';

export const SUPABASE_STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/dicom-studies`;

export interface SupabaseShareRecord {
  id: string;
  token: string;
  study_uid: string;
  sharing_scope: string;
  permissions: {
    view: boolean;
    measure: boolean;
    annotation: boolean;
    download: boolean;
  };
  password_hash: string | null;
  expires_at: string | null;
  created_at: string;
  revoked: boolean;
  study_data?: any;
  series_data?: any[];
  instances_data?: any[];
}

/**
 * Fetches a share link record directly from Supabase via REST API
 * Works globally from any browser (Netlify, mobile, tablet) without a local backend.
 */
export async function getSupabaseShareLink(token: string): Promise<SupabaseShareRecord | null> {
  if (!token) return null;
  try {
    const cleanToken = encodeURIComponent(token.trim());
    const res = await fetch(`${SUPABASE_URL}/rest/v1/share_links?token=eq.${cleanToken}&select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn('[Supabase] Share fetch failed:', res.status, res.statusText);
      return null;
    }

    const rows: SupabaseShareRecord[] = await res.json();
    return rows && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.warn('[Supabase] Network error fetching share token:', err);
    return null;
  }
}

/**
 * Logs an access event to Supabase share_audit_logs table
 */
export async function logSupabaseAccess(token: string, studyUid: string, action: string = 'OPEN'): Promise<void> {
  try {
    const payload = {
      share_token: token,
      study_uid: studyUid,
      action: action,
      ip_address: null,
      device: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      browser: typeof navigator !== 'undefined' ? navigator.appName : null,
    };

    await fetch(`${SUPABASE_URL}/rest/v1/share_audit_logs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // Non-blocking telemetry
  }
}

/**
 * Generates the full public streaming URL for a DICOM file in Supabase Storage
 */
export function getSupabaseDicomUrl(studyUid: string, sopInstanceUid: string): string {
  return `${SUPABASE_STORAGE_URL}/${studyUid}/${sopInstanceUid}.dcm`;
}
