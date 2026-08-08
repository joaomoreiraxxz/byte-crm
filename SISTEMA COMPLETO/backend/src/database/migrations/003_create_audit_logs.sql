-- ═══════════════════════════════════════════════════════════════
-- Migration 003: Audit Logs & Security Alerts (Módulo Sentinela)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    endpoint VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    request_body_encrypted TEXT,
    response_status INT,
    metadata JSONB DEFAULT '{}',
    encryption_iv VARCHAR(64),
    encryption_tag VARCHAR(64),
    duration_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial indexes for common queries
CREATE INDEX idx_audit_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_user_date ON audit_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_failed_logins ON audit_logs(ip_address, created_at DESC)
    WHERE action = 'FAILED_LOGIN';

-- ─── Security Alerts ─────────────────────────────────────────
CREATE TABLE security_alerts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID REFERENCES users(id),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    ip_address INET,
    resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_tenant_unresolved ON security_alerts(tenant_id, created_at DESC)
    WHERE resolved = false;
CREATE INDEX idx_alerts_severity ON security_alerts(severity, created_at DESC)
    WHERE resolved = false;
