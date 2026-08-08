-- ═══════════════════════════════════════════════════════════════
-- Migration 004: CRM Tables (Pipeline, Leads, Activities)
-- ═══════════════════════════════════════════════════════════════

-- ─── Pipelines ────────────────────────────────────────────────
CREATE TABLE pipelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pipelines_tenant ON pipelines(tenant_id);

CREATE TRIGGER trg_pipelines_updated
    BEFORE UPDATE ON pipelines
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Pipeline Stages ─────────────────────────────────────────
CREATE TABLE pipeline_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) DEFAULT '#708090',
    position INT NOT NULL,
    is_won BOOLEAN DEFAULT false,
    is_lost BOOLEAN DEFAULT false,
    auto_assignment UUID REFERENCES users(id),
    sla_hours INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stages_pipeline ON pipeline_stages(pipeline_id, position);

-- Ensure only one won and one lost stage per pipeline
CREATE UNIQUE INDEX idx_stages_won ON pipeline_stages(pipeline_id) WHERE is_won = true;
CREATE UNIQUE INDEX idx_stages_lost ON pipeline_stages(pipeline_id) WHERE is_lost = true;

-- ─── Leads ────────────────────────────────────────────────────
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id),
    stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
    assigned_to UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp_jid VARCHAR(100),
    company VARCHAR(255),
    position_title VARCHAR(255),
    value DECIMAL(15,2) DEFAULT 0,
    probability INT DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
    expected_close_date DATE,
    position INT DEFAULT 0,
    source VARCHAR(100) DEFAULT 'manual',
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',
    notes TEXT,
    won_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    lost_reason TEXT,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    last_contact_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_leads_pipeline ON leads(pipeline_id);
CREATE INDEX idx_leads_stage ON leads(stage_id, position);
CREATE INDEX idx_leads_assigned ON leads(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_leads_whatsapp ON leads(whatsapp_jid) WHERE whatsapp_jid IS NOT NULL;
CREATE INDEX idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_leads_source ON leads(tenant_id, source);
CREATE INDEX idx_leads_value ON leads(tenant_id, value DESC);

-- GIN index for tag-based filtering
CREATE INDEX idx_leads_tags ON leads USING GIN(tags);

CREATE TRIGGER trg_leads_updated
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Lead Activities ─────────────────────────────────────────
CREATE TABLE lead_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    type VARCHAR(50) NOT NULL CHECK (
        type IN ('note', 'call', 'email', 'meeting', 'task', 'stage_change', 'whatsapp', 'system')
    ),
    title VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_lead ON lead_activities(lead_id, created_at DESC);
CREATE INDEX idx_activities_user ON lead_activities(user_id, created_at DESC);
CREATE INDEX idx_activities_scheduled ON lead_activities(scheduled_at)
    WHERE scheduled_at IS NOT NULL AND is_completed = false;

-- ─── Auto-log stage changes ──────────────────────────────────
CREATE OR REPLACE FUNCTION fn_log_stage_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
        INSERT INTO lead_activities (lead_id, type, title, metadata)
        VALUES (
            NEW.id,
            'stage_change',
            'Stage changed',
            jsonb_build_object(
                'from_stage_id', OLD.stage_id,
                'to_stage_id', NEW.stage_id
            )
        );
        NEW.last_activity_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_stage_change
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION fn_log_stage_change();
