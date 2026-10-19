import { db } from '../../database/connection';
import { ENV } from '../../config/env';

export interface ShareLinkDb {
  id?: string;
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
  expires_at: string | null; // ISO Date String
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
  last_accessed?: string | null;
  revoked: boolean;
}

export interface AuditLogDb {
  id?: string;
  share_token: string;
  study_uid: string;
  action: 'CREATE' | 'OPEN' | 'REVOKE' | 'EXPIRE' | 'DELETE' | 'UPDATE_PERMISSIONS' | 'UPDATE_PASSWORD' | 'UPDATE_EXPIRATION';
  ip_address: string | null;
  device: string | null;
  browser: string | null;
  created_at?: string;
}

export class ShareRepository {
  private supabaseClient?: any;
  private useLocalOnly: boolean;

  constructor(supabaseClient?: any) {
    this.supabaseClient = supabaseClient;
    // Pure local drive mode by default
    this.useLocalOnly = !ENV.USE_SUPABASE && !supabaseClient;
  }

  /**
   * Creates a new share link entry stored locally on the drive.
   */
  async createShareLink(link: ShareLinkDb): Promise<ShareLinkDb> {
    const newLink = {
      ...link,
      id: link.id || Date.now().toString(),
      created_at: link.created_at || new Date().toISOString(),
      updated_at: link.updated_at || new Date().toISOString()
    };
    
    const links = db.getShareLinks();
    const existingIdx = links.findIndex(l => l.token === link.token);
    if (existingIdx >= 0) {
      links[existingIdx] = newLink;
    } else {
      links.push(newLink);
    }
    db.setShareLinks(links);

    if (this.useLocalOnly || !this.supabaseClient) {
      return newLink;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from('share_links')
        .insert(link)
        .select()
        .single();

      if (error) {
        return newLink;
      }
      return data || newLink;
    } catch {
      return newLink;
    }
  }

  /**
   * Retrieves a share link entry by its token from the local database.
   */
  async getShareLinkByToken(token: string): Promise<ShareLinkDb | null> {
    const links = db.getShareLinks();
    const localMatch = links.find(l => l.token === token) || null;
    if (this.useLocalOnly || !this.supabaseClient) {
      return localMatch;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from('share_links')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (error || !data) {
        return localMatch;
      }
      return data;
    } catch {
      return localMatch;
    }
  }

  /**
   * Retrieves all active (unrevoked and unexpired) share links from the local drive.
   */
  async listActiveShareLinks(): Promise<ShareLinkDb[]> {
    const now = new Date().getTime();
    const active = db.getShareLinks().filter(l => !l.revoked && (!l.expires_at || new Date(l.expires_at).getTime() > now));

    if (this.useLocalOnly || !this.supabaseClient) {
      return active;
    }

    try {
      const isoNow = new Date().toISOString();
      const { data, error } = await this.supabaseClient
        .from('share_links')
        .select('*')
        .eq('revoked', false)
        .or(`expires_at.is.null,expires_at.gt.${isoNow}`);

      if (error) return active;
      return data || active;
    } catch {
      return active;
    }
  }

  /**
   * Updates an existing share link matched by token in local storage.
   */
  async updateShareLink(token: string, updates: Partial<ShareLinkDb>): Promise<ShareLinkDb> {
    const links = db.getShareLinks();
    const idx = links.findIndex(l => l.token === token);
    if (idx === -1) {
      throw new Error(`Database error updating share link: token ${token} not found`);
    }
    
    links[idx] = { ...links[idx], ...updates, updated_at: new Date().toISOString() };
    db.setShareLinks(links);
    const updated = links[idx];

    if (this.useLocalOnly || !this.supabaseClient) {
      return updated;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from('share_links')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('token', token)
        .select()
        .single();

      if (error) return updated;
      return data || updated;
    } catch {
      return updated;
    }
  }

  /**
   * Hard deletes a share link entry matched by token from local storage.
   */
  async deleteShareLink(token: string): Promise<void> {
    const links = db.getShareLinks().filter(l => l.token !== token);
    db.setShareLinks(links);

    if (this.useLocalOnly || !this.supabaseClient) {
      return;
    }

    try {
      await this.supabaseClient
        .from('share_links')
        .delete()
        .eq('token', token);
    } catch (_) {}
  }

  /**
   * Creates a new access audit log entry in the local drive database.
   */
  async createAuditLog(log: AuditLogDb): Promise<AuditLogDb> {
    const newLog: AuditLogDb = {
      ...log,
      id: log.id || Date.now().toString(),
      created_at: log.created_at || new Date().toISOString()
    };
    db.addShareAuditLog(newLog);

    if (this.useLocalOnly || !this.supabaseClient) {
      return newLog;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from('share_audit_logs')
        .insert(log)
        .select()
        .single();

      if (error) return newLog;
      return data || newLog;
    } catch {
      return newLog;
    }
  }

  /**
   * Retrieves all share links from the local drive (active, expired, and revoked).
   */
  async listAllShareLinks(): Promise<ShareLinkDb[]> {
    const links = db.getShareLinks();
    const sorted = [...links].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    if (this.useLocalOnly || !this.supabaseClient) {
      return sorted;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from('share_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return sorted;
      return data || sorted;
    } catch {
      return sorted;
    }
  }

  /**
   * Retrieves all audit logs for a specific share token from the local drive.
   */
  async getAuditLogsByToken(token: string): Promise<AuditLogDb[]> {
    const logs = db.getShareAuditLogs().filter(l => l.share_token === token);
    const sorted = [...logs].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    if (this.useLocalOnly || !this.supabaseClient) {
      return sorted;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from('share_audit_logs')
        .select('*')
        .eq('share_token', token)
        .order('created_at', { ascending: false });

      if (error) return sorted;
      return data || sorted;
    } catch {
      return sorted;
    }
  }
}
