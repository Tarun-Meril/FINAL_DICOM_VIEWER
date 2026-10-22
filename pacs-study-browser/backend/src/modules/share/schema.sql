-- =====================================================================
-- MerilView DICOM Workstation - Supabase Universal Cloud Setup
-- Run this in your Supabase Project -> SQL Editor -> Click 'Run'
-- =====================================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table: share_links
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
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    study_data JSONB NULL,        -- Patient name, study date, study description, modalities
    series_data JSONB NULL,       -- List of series with descriptions and instance counts
    instances_data JSONB NULL     -- Slices, orientation, spacing, window presets
);

-- Indexes for lightning-fast queries
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links (token);
CREATE INDEX IF NOT EXISTS idx_share_links_study_uid ON share_links (study_uid);

-- 3. Table: share_audit_logs
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

CREATE INDEX IF NOT EXISTS idx_share_audit_logs_token ON share_audit_logs (share_token);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. Public read policy: Anyone with the Anon Key (Netlify web viewer) can read active share links
DROP POLICY IF EXISTS "Public can view active share links" ON share_links;
CREATE POLICY "Public can view active share links"
    ON share_links FOR SELECT
    USING (revoked = false);

-- Service role bypasses RLS automatically for insert/update/delete from your workstation
DROP POLICY IF EXISTS "Service role full access on share_links" ON share_links;
CREATE POLICY "Service role full access on share_links"
    ON share_links FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can insert audit logs" ON share_audit_logs;
CREATE POLICY "Public can insert audit logs"
    ON share_audit_logs FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on share_audit_logs" ON share_audit_logs;
CREATE POLICY "Service role full access on share_audit_logs"
    ON share_audit_logs FOR ALL
    USING (true)
    WITH CHECK (true);

-- 6. Create Public Storage Bucket for DICOM files
INSERT INTO storage.buckets (id, name, public)
VALUES ('dicom-studies', 'dicom-studies', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policy: Allow public read access to DICOM files in the bucket
DROP POLICY IF EXISTS "Public Access to DICOM Files" ON storage.objects;
CREATE POLICY "Public Access to DICOM Files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'dicom-studies');

-- Storage Policy: Allow workstation to upload DICOM files
DROP POLICY IF EXISTS "Workstation Upload DICOM Files" ON storage.objects;
CREATE POLICY "Workstation Upload DICOM Files"
    ON storage.objects FOR ALL
    USING (bucket_id = 'dicom-studies')
    WITH CHECK (bucket_id = 'dicom-studies');

