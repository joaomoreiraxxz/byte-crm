-- ═══════════════════════════════════════════════════════════════
-- CRM BYTE — TUDO EM UM (Migrations + Seed)
-- Cole TUDO de uma vez no terminal do psql
-- ═══════════════════════════════════════════════════════════════

-- === MIGRATION 001: Tenants ===
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
    settings JSONB DEFAULT '{"whatsapp_enabled": false, "vault_enabled": false, "biometric_enabled": false, "timezone": "America/Sao_Paulo", "currency": "BRL", "date_format": "DD/MM/YYYY"}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = true;

-- === MIGRATION 002: Users ===
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'manager', 'agent', 'viewer');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'agent',
    avatar_url TEXT,
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    face_enrolled BOOLEAN DEFAULT false,
    mfa_enabled BOOLEAN DEFAULT false,
    refresh_token_hash VARCHAR(255),
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    preferences JSONB DEFAULT '{"theme": "light", "language": "pt-BR", "notifications": true, "sidebar_collapsed": false}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_email UNIQUE(tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_users_active ON users(tenant_id, is_active) WHERE is_active = true;

CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- === MIGRATION 003: Audit Logs ===
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), user_id UUID REFERENCES users(id), action VARCHAR(50) NOT NULL, resource VARCHAR(100) NOT NULL, resource_id VARCHAR(255), endpoint VARCHAR(500) NOT NULL, method VARCHAR(10) NOT NULL, ip_address INET NOT NULL, user_agent TEXT, request_body_encrypted TEXT, response_status INT, metadata JSONB DEFAULT '{}', encryption_iv VARCHAR(64), encryption_tag VARCHAR(64), duration_ms INT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_user_date ON audit_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_failed_logins ON audit_logs(ip_address, created_at DESC) WHERE action = 'FAILED_LOGIN';

CREATE TABLE security_alerts (
    id BIGSERIAL PRIMARY KEY, tenant_id UUID REFERENCES tenants(id), user_id UUID REFERENCES users(id), alert_type VARCHAR(50) NOT NULL, severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')), title VARCHAR(255) NOT NULL, description TEXT NOT NULL, ip_address INET, resolved BOOLEAN DEFAULT false, resolved_by UUID REFERENCES users(id), resolved_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alerts_tenant_unresolved ON security_alerts(tenant_id, created_at DESC) WHERE resolved = false;
CREATE INDEX idx_alerts_severity ON security_alerts(severity, created_at DESC) WHERE resolved = false;

-- === MIGRATION 004: CRM Tables ===
CREATE TABLE pipelines (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, is_default BOOLEAN DEFAULT false, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_pipelines_tenant ON pipelines(tenant_id);
CREATE TRIGGER trg_pipelines_updated BEFORE UPDATE ON pipelines FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE pipeline_stages (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, color VARCHAR(7) DEFAULT '#708090', position INT NOT NULL, is_won BOOLEAN DEFAULT false, is_lost BOOLEAN DEFAULT false, auto_assignment UUID REFERENCES users(id), sla_hours INT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_stages_pipeline ON pipeline_stages(pipeline_id, position);
CREATE UNIQUE INDEX idx_stages_won ON pipeline_stages(pipeline_id) WHERE is_won = true;
CREATE UNIQUE INDEX idx_stages_lost ON pipeline_stages(pipeline_id) WHERE is_lost = true;

CREATE TABLE leads (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, pipeline_id UUID NOT NULL REFERENCES pipelines(id), stage_id UUID NOT NULL REFERENCES pipeline_stages(id), assigned_to UUID REFERENCES users(id), name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(50), whatsapp_jid VARCHAR(100), company VARCHAR(255), position_title VARCHAR(255), value DECIMAL(15,2) DEFAULT 0, probability INT DEFAULT 50 CHECK (probability >= 0 AND probability <= 100), expected_close_date DATE, position INT DEFAULT 0, source VARCHAR(100) DEFAULT 'manual', tags TEXT[] DEFAULT '{}', custom_fields JSONB DEFAULT '{}', notes TEXT, won_at TIMESTAMPTZ, lost_at TIMESTAMPTZ, lost_reason TEXT, last_activity_at TIMESTAMPTZ DEFAULT NOW(), last_contact_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_leads_pipeline ON leads(pipeline_id);
CREATE INDEX idx_leads_stage ON leads(stage_id, position);
CREATE INDEX idx_leads_assigned ON leads(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_leads_whatsapp ON leads(whatsapp_jid) WHERE whatsapp_jid IS NOT NULL;
CREATE INDEX idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_leads_source ON leads(tenant_id, source);
CREATE INDEX idx_leads_value ON leads(tenant_id, value DESC);
CREATE INDEX idx_leads_tags ON leads USING GIN(tags);
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE lead_activities (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE, user_id UUID REFERENCES users(id), type VARCHAR(50) NOT NULL CHECK (type IN ('note', 'call', 'email', 'meeting', 'task', 'stage_change', 'whatsapp', 'system')), title VARCHAR(255), description TEXT, metadata JSONB DEFAULT '{}', scheduled_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, is_completed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_activities_lead ON lead_activities(lead_id, created_at DESC);
CREATE INDEX idx_activities_user ON lead_activities(user_id, created_at DESC);
CREATE INDEX idx_activities_scheduled ON lead_activities(scheduled_at) WHERE scheduled_at IS NOT NULL AND is_completed = false;

CREATE OR REPLACE FUNCTION fn_log_stage_change() RETURNS TRIGGER AS $$ BEGIN IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN INSERT INTO lead_activities (lead_id, type, title, metadata) VALUES (NEW.id, 'stage_change', 'Stage changed', jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id)); NEW.last_activity_at = NOW(); END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_lead_stage_change BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION fn_log_stage_change();

-- === MIGRATION 005: ERP Tables ===
CREATE TABLE categorias (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, parent_id UUID REFERENCES categorias(id) ON DELETE SET NULL, name VARCHAR(255) NOT NULL, type VARCHAR(20) NOT NULL CHECK (type IN ('receita', 'despesa', 'ambos')), color VARCHAR(7) DEFAULT '#708090', icon VARCHAR(50), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_categorias_tenant ON categorias(tenant_id);
CREATE INDEX idx_categorias_type ON categorias(tenant_id, type);
CREATE INDEX idx_categorias_parent ON categorias(parent_id) WHERE parent_id IS NOT NULL;
CREATE TRIGGER trg_categorias_updated BEFORE UPDATE ON categorias FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE contas_bancarias (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, bank_name VARCHAR(255), bank_code VARCHAR(10), agency VARCHAR(20), account_number VARCHAR(30), account_type VARCHAR(20) DEFAULT 'corrente' CHECK (account_type IN ('corrente', 'poupanca', 'investimento', 'caixa')), initial_balance DECIMAL(15,2) DEFAULT 0, current_balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, color VARCHAR(7) DEFAULT '#4A6FA5', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_contas_bancarias_tenant ON contas_bancarias(tenant_id);
CREATE TRIGGER trg_contas_bancarias_updated BEFORE UPDATE ON contas_bancarias FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE contas_pagar (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL, conta_bancaria_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL, description VARCHAR(500) NOT NULL, supplier VARCHAR(255), amount DECIMAL(15,2) NOT NULL CHECK (amount > 0), amount_paid DECIMAL(15,2) DEFAULT 0 CHECK (amount_paid >= 0), discount DECIMAL(15,2) DEFAULT 0 CHECK (discount >= 0), interest DECIMAL(15,2) DEFAULT 0 CHECK (interest >= 0), due_date DATE NOT NULL, payment_date DATE, competence_date DATE, status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado', 'parcial')), recurrence VARCHAR(20) DEFAULT 'unica' CHECK (recurrence IN ('unica', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual')), recurrence_end_date DATE, parent_id UUID REFERENCES contas_pagar(id), installment_number INT, total_installments INT, document_number VARCHAR(100), barcode VARCHAR(100), pix_key VARCHAR(255), notes TEXT, attachments JSONB DEFAULT '[]', created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_cp_tenant_status ON contas_pagar(tenant_id, status);
CREATE INDEX idx_cp_due_date ON contas_pagar(tenant_id, due_date);
CREATE INDEX idx_cp_supplier ON contas_pagar(tenant_id, supplier);
CREATE INDEX idx_cp_categoria ON contas_pagar(categoria_id);
CREATE INDEX idx_cp_vencidas ON contas_pagar(tenant_id, due_date) WHERE status = 'pendente';
CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON contas_pagar FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE OR REPLACE FUNCTION fn_check_overdue_contas_pagar() RETURNS void AS $$ BEGIN UPDATE contas_pagar SET status = 'vencido', updated_at = NOW() WHERE status = 'pendente' AND due_date < CURRENT_DATE; END; $$ LANGUAGE plpgsql;

CREATE TABLE contas_receber (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL, conta_bancaria_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL, lead_id UUID REFERENCES leads(id) ON DELETE SET NULL, description VARCHAR(500) NOT NULL, client_name VARCHAR(255), amount DECIMAL(15,2) NOT NULL CHECK (amount > 0), amount_received DECIMAL(15,2) DEFAULT 0 CHECK (amount_received >= 0), discount DECIMAL(15,2) DEFAULT 0 CHECK (discount >= 0), interest DECIMAL(15,2) DEFAULT 0 CHECK (interest >= 0), due_date DATE NOT NULL, receipt_date DATE, competence_date DATE, status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'recebido', 'vencido', 'cancelado', 'parcial')), recurrence VARCHAR(20) DEFAULT 'unica' CHECK (recurrence IN ('unica', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual')), recurrence_end_date DATE, parent_id UUID REFERENCES contas_receber(id), installment_number INT, total_installments INT, invoice_number VARCHAR(100), nf_number VARCHAR(100), notes TEXT, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_cr_tenant_status ON contas_receber(tenant_id, status);
CREATE INDEX idx_cr_due_date ON contas_receber(tenant_id, due_date);
CREATE INDEX idx_cr_client ON contas_receber(tenant_id, client_name);
CREATE INDEX idx_cr_lead ON contas_receber(lead_id) WHERE lead_id IS NOT NULL;
CREATE TRIGGER trg_cr_updated BEFORE UPDATE ON contas_receber FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE transacoes (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, conta_bancaria_id UUID NOT NULL REFERENCES contas_bancarias(id), categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL, conta_pagar_id UUID REFERENCES contas_pagar(id) ON DELETE SET NULL, conta_receber_id UUID REFERENCES contas_receber(id) ON DELETE SET NULL, transfer_to_account_id UUID REFERENCES contas_bancarias(id), type VARCHAR(15) NOT NULL CHECK (type IN ('entrada', 'saida', 'transferencia')), amount DECIMAL(15,2) NOT NULL CHECK (amount > 0), balance_after DECIMAL(15,2), description VARCHAR(500) NOT NULL, transaction_date DATE NOT NULL, competence_date DATE, reference_number VARCHAR(100), is_conciliated BOOLEAN DEFAULT false, conciliated_at TIMESTAMPTZ, conciliated_by UUID REFERENCES users(id), notes TEXT, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_tx_conta ON transacoes(conta_bancaria_id, transaction_date DESC);
CREATE INDEX idx_tx_conciliacao ON transacoes(conta_bancaria_id, is_conciliated) WHERE is_conciliated = false;
CREATE INDEX idx_tx_tenant_date ON transacoes(tenant_id, transaction_date DESC);
CREATE INDEX idx_tx_categoria ON transacoes(categoria_id);
CREATE INDEX idx_tx_cp ON transacoes(conta_pagar_id) WHERE conta_pagar_id IS NOT NULL;
CREATE INDEX idx_tx_cr ON transacoes(conta_receber_id) WHERE conta_receber_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_update_account_balance() RETURNS TRIGGER AS $$ DECLARE v_new_balance DECIMAL(15,2); BEGIN PERFORM 1 FROM contas_bancarias WHERE id = NEW.conta_bancaria_id FOR UPDATE; IF NEW.type = 'entrada' THEN UPDATE contas_bancarias SET current_balance = current_balance + NEW.amount, updated_at = NOW() WHERE id = NEW.conta_bancaria_id RETURNING current_balance INTO v_new_balance; ELSIF NEW.type = 'saida' THEN UPDATE contas_bancarias SET current_balance = current_balance - NEW.amount, updated_at = NOW() WHERE id = NEW.conta_bancaria_id RETURNING current_balance INTO v_new_balance; ELSIF NEW.type = 'transferencia' THEN UPDATE contas_bancarias SET current_balance = current_balance - NEW.amount, updated_at = NOW() WHERE id = NEW.conta_bancaria_id RETURNING current_balance INTO v_new_balance; IF NEW.transfer_to_account_id IS NOT NULL THEN UPDATE contas_bancarias SET current_balance = current_balance + NEW.amount, updated_at = NOW() WHERE id = NEW.transfer_to_account_id; END IF; END IF; NEW.balance_after := v_new_balance; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_update_balance BEFORE INSERT ON transacoes FOR EACH ROW EXECUTE FUNCTION fn_update_account_balance();

CREATE OR REPLACE VIEW vw_resumo_financeiro AS SELECT t.tenant_id, DATE_TRUNC('month', t.transaction_date)::DATE AS mes, SUM(CASE WHEN t.type = 'entrada' THEN t.amount ELSE 0 END) AS receitas, SUM(CASE WHEN t.type = 'saida' THEN t.amount ELSE 0 END) AS despesas, SUM(CASE WHEN t.type = 'entrada' THEN t.amount ELSE 0 END) - SUM(CASE WHEN t.type = 'saida' THEN t.amount ELSE 0 END) AS lucro_liquido, COUNT(*) AS total_transacoes FROM transacoes t GROUP BY t.tenant_id, DATE_TRUNC('month', t.transaction_date);

-- === MIGRATION 006: Vault ===
CREATE TABLE vault_entries (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, title VARCHAR(255) NOT NULL, category VARCHAR(50) DEFAULT 'generic' CHECK (category IN ('server', 'database', 'api_key', 'ssh', 'vpn', 'email', 'website', 'certificate', 'generic')), encrypted_data TEXT NOT NULL, encryption_iv VARCHAR(64) NOT NULL, encryption_tag VARCHAR(64) NOT NULL, encryption_salt VARCHAR(64) NOT NULL, notes_encrypted TEXT, notes_iv VARCHAR(64), notes_tag VARCHAR(64), url VARCHAR(500), favorite BOOLEAN DEFAULT false, last_accessed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, strength_score INT CHECK (strength_score >= 0 AND strength_score <= 100), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_vault_user ON vault_entries(user_id);
CREATE INDEX idx_vault_tenant ON vault_entries(tenant_id);
CREATE INDEX idx_vault_category ON vault_entries(user_id, category);
CREATE INDEX idx_vault_expiring ON vault_entries(expires_at) WHERE expires_at IS NOT NULL;
CREATE TRIGGER trg_vault_updated BEFORE UPDATE ON vault_entries FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE face_enrollments (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, embedding_encrypted TEXT NOT NULL, embedding_iv VARCHAR(64) NOT NULL, embedding_tag VARCHAR(64) NOT NULL, embedding_salt VARCHAR(64) NOT NULL, model_name VARCHAR(50) DEFAULT 'Facenet512', detector_backend VARCHAR(50) DEFAULT 'retinaface', embedding_version INT DEFAULT 1, enrolled_at TIMESTAMPTZ DEFAULT NOW(), is_active BOOLEAN DEFAULT true);
CREATE UNIQUE INDEX idx_face_active ON face_enrollments(user_id) WHERE is_active = true;

CREATE TABLE vault_master_keys (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, master_password_hash VARCHAR(255) NOT NULL, password_hint TEXT, recovery_key_hash VARCHAR(255), last_changed_at TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW(), CONSTRAINT uq_vault_master_user UNIQUE(user_id));

-- === MIGRATION 007: WhatsApp ===
CREATE TABLE whatsapp_instances (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, instance_name VARCHAR(255) NOT NULL, instance_id VARCHAR(255), api_url VARCHAR(500) NOT NULL, api_key_encrypted TEXT NOT NULL, api_key_iv VARCHAR(64) NOT NULL, api_key_tag VARCHAR(64) NOT NULL, status VARCHAR(20) DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_pending')), phone_number VARCHAR(50), webhook_url VARCHAR(500), webhook_events TEXT[] DEFAULT ARRAY['messages-upsert', 'messages-update', 'connection-update'], auto_reply_enabled BOOLEAN DEFAULT false, auto_reply_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_wa_instances_tenant ON whatsapp_instances(tenant_id);
CREATE TRIGGER trg_wa_instances_updated BEFORE UPDATE ON whatsapp_instances FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE whatsapp_messages (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL, lead_id UUID REFERENCES leads(id) ON DELETE SET NULL, remote_jid VARCHAR(100) NOT NULL, message_id VARCHAR(255), direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')), type VARCHAR(30) DEFAULT 'text' CHECK (type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'reaction')), content TEXT, media_url TEXT, media_mimetype VARCHAR(100), media_filename VARCHAR(255), media_size_bytes BIGINT, status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'deleted')), quoted_message_id VARCHAR(255), is_from_me BOOLEAN DEFAULT false, sender_name VARCHAR(255), sender_phone VARCHAR(50), metadata JSONB DEFAULT '{}', error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_wamsg_lead ON whatsapp_messages(lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_wamsg_jid ON whatsapp_messages(remote_jid, created_at DESC);
CREATE INDEX idx_wamsg_tenant ON whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX idx_wamsg_instance ON whatsapp_messages(instance_id, created_at DESC);
CREATE INDEX idx_wamsg_message_id ON whatsapp_messages(message_id) WHERE message_id IS NOT NULL;

CREATE TABLE whatsapp_contacts (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE, jid VARCHAR(100) NOT NULL, name VARCHAR(255), push_name VARCHAR(255), phone VARCHAR(50), profile_picture_url TEXT, lead_id UUID REFERENCES leads(id) ON DELETE SET NULL, last_message_at TIMESTAMPTZ, unread_count INT DEFAULT 0, is_group BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), CONSTRAINT uq_wa_contact UNIQUE(tenant_id, instance_id, jid));
CREATE INDEX idx_wa_contacts_tenant ON whatsapp_contacts(tenant_id);
CREATE INDEX idx_wa_contacts_lead ON whatsapp_contacts(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_wa_contacts_unread ON whatsapp_contacts(tenant_id, unread_count DESC) WHERE unread_count > 0;
CREATE TRIGGER trg_wa_contacts_updated BEFORE UPDATE ON whatsapp_contacts FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- === MIGRATION 008: Workspaces ===
CREATE TABLE workspaces (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_workspaces_tenant ON workspaces(tenant_id);
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

ALTER TABLE pipelines ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE TABLE tasks (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, assigned_to UUID REFERENCES users(id), title VARCHAR(255) NOT NULL, description TEXT, status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')), priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')), due_date TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE notes (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, author_id UUID REFERENCES users(id), title VARCHAR(255) NOT NULL, content TEXT, tags TEXT[] DEFAULT '{}', is_pinned BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_notes_workspace ON notes(workspace_id);
CREATE INDEX idx_notes_author ON notes(author_id);
CREATE TRIGGER trg_notes_updated BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE calendar_events (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, organizer_id UUID REFERENCES users(id), title VARCHAR(255) NOT NULL, description TEXT, start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL, location VARCHAR(255), event_type VARCHAR(50) DEFAULT 'meeting', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX idx_calendar_events_workspace ON calendar_events(workspace_id);
CREATE INDEX idx_calendar_events_time ON calendar_events(start_time, end_time);
CREATE TRIGGER trg_calendar_events_updated BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TABLE IF NOT EXISTS workspace_members (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(50) DEFAULT 'member', created_at TIMESTAMPTZ DEFAULT NOW(), CONSTRAINT uq_workspace_member UNIQUE(workspace_id, user_id));

-- ═══════════════════════════════════════════════════════════════
-- SEED: Criar Admin + Workspace + Pipeline
-- ═══════════════════════════════════════════════════════════════
INSERT INTO tenants (id, name, slug, plan, is_active, max_users) VALUES (gen_random_uuid(), 'Byte CRM', 'byte-crm', 'enterprise', true, 100) ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active) VALUES (gen_random_uuid(), (SELECT id FROM tenants WHERE slug = 'byte-crm'), 'admin@bytecrm.online', '$2b$10$B/hSLiksj3lfKbmRuuypsefA/UjlPGoLqGja9YrSbCH/WZyPNQzvm', 'Administrador', 'owner', true) ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id, tenant_id, name, description) VALUES (gen_random_uuid(), (SELECT id FROM tenants WHERE slug = 'byte-crm'), 'Principal', 'Workspace padrao');

INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (gen_random_uuid(), (SELECT id FROM workspaces WHERE name = 'Principal' LIMIT 1), (SELECT id FROM users WHERE email = 'admin@bytecrm.online' LIMIT 1), 'owner');

INSERT INTO pipelines (id, tenant_id, workspace_id, name, is_default) VALUES (gen_random_uuid(), (SELECT id FROM tenants WHERE slug = 'byte-crm'), (SELECT id FROM workspaces WHERE name = 'Principal' LIMIT 1), 'Vendas', true);

SELECT '✅ TUDO CRIADO COM SUCESSO!' AS resultado;
SELECT full_name, email, role FROM users;
