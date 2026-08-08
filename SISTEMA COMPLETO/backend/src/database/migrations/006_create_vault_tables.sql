-- ═══════════════════════════════════════════════════════════════
-- Migration 006: Vault (Cofre Biométrico Zero-Knowledge)
-- ═══════════════════════════════════════════════════════════════

-- ─── Vault Entries (credenciais criptografadas AES-256-GCM) ──
CREATE TABLE vault_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'generic'
        CHECK (category IN ('server', 'database', 'api_key', 'ssh', 'vpn', 'email', 'website', 'certificate', 'generic')),
    encrypted_data TEXT NOT NULL,
    encryption_iv VARCHAR(64) NOT NULL,
    encryption_tag VARCHAR(64) NOT NULL,
    encryption_salt VARCHAR(64) NOT NULL,
    notes_encrypted TEXT,
    notes_iv VARCHAR(64),
    notes_tag VARCHAR(64),
    url VARCHAR(500),
    favorite BOOLEAN DEFAULT false,
    last_accessed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    strength_score INT CHECK (strength_score >= 0 AND strength_score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vault_user ON vault_entries(user_id);
CREATE INDEX idx_vault_tenant ON vault_entries(tenant_id);
CREATE INDEX idx_vault_category ON vault_entries(user_id, category);
CREATE INDEX idx_vault_expiring ON vault_entries(expires_at)
    WHERE expires_at IS NOT NULL;

CREATE TRIGGER trg_vault_updated
    BEFORE UPDATE ON vault_entries
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Face Enrollments ────────────────────────────────────────
CREATE TABLE face_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    embedding_encrypted TEXT NOT NULL,
    embedding_iv VARCHAR(64) NOT NULL,
    embedding_tag VARCHAR(64) NOT NULL,
    embedding_salt VARCHAR(64) NOT NULL,
    model_name VARCHAR(50) DEFAULT 'Facenet512',
    detector_backend VARCHAR(50) DEFAULT 'retinaface',
    embedding_version INT DEFAULT 1,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- One active enrollment per user
CREATE UNIQUE INDEX idx_face_active ON face_enrollments(user_id) WHERE is_active = true;

-- ─── Master Password Verification Hash ──────────────────────
-- Stores a bcrypt hash of the master password for server-side verification
-- The actual encryption key is NEVER stored — derived client-side via PBKDF2
CREATE TABLE vault_master_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    master_password_hash VARCHAR(255) NOT NULL,
    password_hint TEXT,
    recovery_key_hash VARCHAR(255),
    last_changed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_vault_master_user UNIQUE(user_id)
);
