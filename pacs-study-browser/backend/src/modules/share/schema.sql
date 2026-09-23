-- Schema definitions for MedView Pro - Share Study Supabase tables.
-- Run this in your Supabase SQL Editor.

-- Enable UUID generation extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: share_links
CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(255) NOT NULL UNIQUE,
    study_uid TEXT NOT NULL,
    sharing_scope TEXT NOT NULL DEFAULT 'STUDY',
    permissions JSONB NOT NULL DEFAULT '{"view": true, "measure": true, "annotation": false, "download": false}'::jsonb,
    password_hash TEXT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NULL,
    created_by TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);

-- Index on token for high-performance lookup
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links (token);
-- Index on study_uid for querying active links of a study
CREATE INDEX IF NOT EXISTS idx_share_links_study_uid ON share_links (study_uid);

-- Table: share_audit_logs
CREATE TABLE IF NOT EXISTS share_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token VARCHAR(255) NOT NULL,
    study_uid TEXT NOT NULL,
    action TEXT NOT NULL,
    ip_address TEXT NULL,
    device TEXT NULL,
    browser TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_audit_action CHECK (action IN ('CREATE', 'OPEN', 'REVOKE', 'EXPIRE', 'DELETE', 'UPDATE_PERMISSIONS', 'UPDATE_PASSWORD', 'UPDATE_EXPIRATION'))
);

-- Index on share_token to quickly query audit history for a specific share link
CREATE INDEX IF NOT EXISTS idx_share_audit_logs_token ON share_audit_logs (share_token);
