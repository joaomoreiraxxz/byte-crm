-- ═══════════════════════════════════════════════════════════════
-- Migration 008: Workspaces & Productivity (Tasks, Notes, Calendar)
-- ═══════════════════════════════════════════════════════════════

-- ─── Workspaces ────────────────────────────────────────────────
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workspaces_tenant ON workspaces(tenant_id);

CREATE TRIGGER trg_workspaces_updated
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Alter CRM Tables to depend on Workspaces ────────────────
-- We add workspace_id to pipelines, leads, etc.
ALTER TABLE pipelines ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- If we wanted to migrate existing data, we would do it here. For a fresh setup, this is fine.

-- ─── Tasks ───────────────────────────────────────────────────
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);

CREATE TRIGGER trg_tasks_updated
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Notes ───────────────────────────────────────────────────
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    tags TEXT[] DEFAULT '{}',
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notes_workspace ON notes(workspace_id);
CREATE INDEX idx_notes_author ON notes(author_id);

CREATE TRIGGER trg_notes_updated
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── Calendar Events ─────────────────────────────────────────
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    organizer_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    location VARCHAR(255),
    event_type VARCHAR(50) DEFAULT 'meeting',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calendar_events_workspace ON calendar_events(workspace_id);
CREATE INDEX idx_calendar_events_time ON calendar_events(start_time, end_time);

CREATE TRIGGER trg_calendar_events_updated
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
