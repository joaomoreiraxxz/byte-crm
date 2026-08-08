-- ═══════════════════════════════════════════════════════════════
-- Migration 007: WhatsApp Integration (Evolution API)
-- ═══════════════════════════════════════════════════════════════

-- ─── WhatsApp Instances ──────────────────────────────────────
CREATE TABLE whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_name VARCHAR(255) NOT NULL,
    instance_id VARCHAR(255),
    api_url VARCHAR(500) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    api_key_iv VARCHAR(64) NOT NULL,
    api_key_tag VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'disconnected'
        CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_pending')),
    phone_number VARCHAR(50),
    webhook_url VARCHAR(500),
    webhook_events TEXT[] DEFAULT '{"messages-upsert", "messages-update", "connection-update"}',
    auto_reply_enabled BOOLEAN DEFAULT false,
    auto_reply_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wa_instances_tenant ON whatsapp_instances(tenant_id);

CREATE TRIGGER trg_wa_instances_updated
    BEFORE UPDATE ON whatsapp_instances
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── WhatsApp Messages ───────────────────────────────────────
CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    remote_jid VARCHAR(100) NOT NULL,
    message_id VARCHAR(255),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    type VARCHAR(30) DEFAULT 'text'
        CHECK (type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'reaction')),
    content TEXT,
    media_url TEXT,
    media_mimetype VARCHAR(100),
    media_filename VARCHAR(255),
    media_size_bytes BIGINT,
    status VARCHAR(20) DEFAULT 'sent'
        CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'deleted')),
    quoted_message_id VARCHAR(255),
    is_from_me BOOLEAN DEFAULT false,
    sender_name VARCHAR(255),
    sender_phone VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wamsg_lead ON whatsapp_messages(lead_id, created_at DESC)
    WHERE lead_id IS NOT NULL;
CREATE INDEX idx_wamsg_jid ON whatsapp_messages(remote_jid, created_at DESC);
CREATE INDEX idx_wamsg_tenant ON whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX idx_wamsg_instance ON whatsapp_messages(instance_id, created_at DESC);
CREATE INDEX idx_wamsg_message_id ON whatsapp_messages(message_id)
    WHERE message_id IS NOT NULL;

-- ─── WhatsApp Contacts (cache de contatos) ───────────────────
CREATE TABLE whatsapp_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
    jid VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    push_name VARCHAR(255),
    phone VARCHAR(50),
    profile_picture_url TEXT,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ,
    unread_count INT DEFAULT 0,
    is_group BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_wa_contact UNIQUE(tenant_id, instance_id, jid)
);

CREATE INDEX idx_wa_contacts_tenant ON whatsapp_contacts(tenant_id);
CREATE INDEX idx_wa_contacts_lead ON whatsapp_contacts(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_wa_contacts_unread ON whatsapp_contacts(tenant_id, unread_count DESC)
    WHERE unread_count > 0;

CREATE TRIGGER trg_wa_contacts_updated
    BEFORE UPDATE ON whatsapp_contacts
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
