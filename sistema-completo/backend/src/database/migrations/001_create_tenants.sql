-- ═══════════════════════════════════════════════════════════════
-- Migration 001: Tenants (Multi-tenancy base)
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'enterprise')),
    is_active BOOLEAN DEFAULT true,
    max_users INT DEFAULT 5,
    settings JSONB DEFAULT '{
        "whatsapp_enabled": false,
        "vault_enabled": false,
        "biometric_enabled": false,
        "timezone": "America/Sao_Paulo",
        "currency": "BRL",
        "date_format": "DD/MM/YYYY"
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = true;
