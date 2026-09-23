import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from './supabase';
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
  private supabase: SupabaseClient;
  private useLocalFallback: boolean;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = supabaseClient ?? defaultSupabase;
    this.useLocalFallback = !ENV.SUPABASE.URL || ENV.SUPABASE.URL.includes('placeholder-url');
  }

  /**
   * Creates a new share link entry.
   */
  async createShareLink(link: ShareLinkDb): Promise<ShareLinkDb> {
    if (this.useLocalFallback) {
      const newLink = { ...link, id: Date.now().toString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const links = db.getShareLinks();
      links.push(newLink);
      db.setShareLinks(links);
      return newLink;
    }

    const { data, error } = await this.supabase
      .from('share_links')
      .insert(link)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error creating share link: ${error.message}`);
    }
    return data;
  }

  /**
   * Retrieves a share link entry by its token.
   */
  async getShareLinkByToken(token: string): Promise<ShareLinkDb | null> {
    if (this.useLocalFallback) {
      const links = db.getShareLinks();
      return links.find(l => l.token === token) || null;
    }

    const { data, error } = await this.supabase
      .from('share_links')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      throw new Error(`Database error fetching share link: ${error.message}`);
    }
    return data;
  }

  /**
   * Retrieves all active (unrevoked and unexpired) share links.
   */
  async listActiveShareLinks(): Promise<ShareLinkDb[]> {
    if (this.useLocalFallback) {
      const now = new Date().getTime();
      return db.getShareLinks().filter(l => !l.revoked && (!l.expires_at || new Date(l.expires_at).getTime() > now));
    }

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('share_links')
      .select('*')
      .eq('revoked', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    if (error) {
      throw new Error(`Database error listing active share links: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Updates an existing share link matched by token.
   */
  async updateShareLink(token: string, updates: Partial<ShareLinkDb>): Promise<ShareLinkDb> {
    if (this.useLocalFallback) {
      const links = db.getShareLinks();
      const idx = links.findIndex(l => l.token === token);
      if (idx === -1) throw new Error(`Database error updating share link: not found`);
      links[idx] = { ...links[idx], ...updates, updated_at: new Date().toISOString() };
      db.setShareLinks(links);
      return links[idx];
    }

    const { data, error } = await this.supabase
      .from('share_links')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('token', token)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error updating share link: ${error.message}`);
    }
    return data;
  }

  /**
   * Hard deletes a share link entry matched by token from the database.
   */
  async deleteShareLink(token: string): Promise<void> {
    if (this.useLocalFallback) {
      const links = db.getShareLinks().filter(l => l.token !== token);
      db.setShareLinks(links);
      return;
    }

    const { error } = await this.supabase
      .from('share_links')
      .delete()
      .eq('token', token);

    if (error) {
      throw new Error(`Database error deleting share link: ${error.message}`);
    }
  }

  /**
   * Creates a new access audit log entry.
   */
  async createAuditLog(log: AuditLogDb): Promise<AuditLogDb> {
    if (this.useLocalFallback) {
      const newLog = { ...log, id: Date.now().toString(), created_at: new Date().toISOString() };
      db.addShareAuditLog(newLog);
      return newLog;
    }

    const { data, error } = await this.supabase
      .from('share_audit_logs')
      .insert(log)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error creating audit log: ${error.message}`);
    }
    return data;
  }

  /**
   * Retrieves all share links (including active, expired, and revoked links).
   */
  async listAllShareLinks(): Promise<ShareLinkDb[]> {
    if (this.useLocalFallback) {
      const links = db.getShareLinks();
      return [...links].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }

    const { data, error } = await this.supabase
      .from('share_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database error listing all share links: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Retrieves all audit logs for a specific share token.
   */
  async getAuditLogsByToken(token: string): Promise<AuditLogDb[]> {
    if (this.useLocalFallback) {
      const logs = db.getShareAuditLogs().filter(l => l.share_token === token);
      return [...logs].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }

    const { data, error } = await this.supabase
      .from('share_audit_logs')
      .select('*')
      .eq('share_token', token)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database error fetching audit logs: ${error.message}`);
    }
    return data || [];
  }
}
