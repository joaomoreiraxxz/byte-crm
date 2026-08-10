-- ═══════════════════════════════════════════════════════════════
-- CRM BYTE — Script de Inicialização (executar APÓS as migrations)
-- ═══════════════════════════════════════════════════════════════

-- 1. Criar o tenant (empresa) principal
INSERT INTO tenants (id, name, slug, plan, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Byte CRM',
  'byte-crm',
  'premium',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Criar o usuário admin
-- Senha: ByteCRM@2026!
-- Hash bcrypt (12 rounds): $2b$10$B/hSLiksj3lfKbmRuuypsefA/UjlPGoLqGja9YrSbCH/WZyPNQzvm
INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE slug = 'byte-crm' LIMIT 1),
  'admin@bytecrm.online',
  '$2b$10$B/hSLiksj3lfKbmRuuypsefA/UjlPGoLqGja9YrSbCH/WZyPNQzvm',
  'Administrador',
  'owner',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- 3. Criar o workspace padrão
INSERT INTO workspaces (id, tenant_id, name, slug, description, created_by, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE slug = 'byte-crm' LIMIT 1),
  'Principal',
  'principal',
  'Workspace padrão do sistema',
  (SELECT id FROM users WHERE email = 'admin@bytecrm.online' LIMIT 1),
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- 4. Associar o admin ao workspace
INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM workspaces WHERE slug = 'principal' LIMIT 1),
  (SELECT id FROM users WHERE email = 'admin@bytecrm.online' LIMIT 1),
  'owner',
  NOW()
)
ON CONFLICT DO NOTHING;

-- 5. Criar pipeline padrão
INSERT INTO pipelines (id, workspace_id, name, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM workspaces WHERE slug = 'principal' LIMIT 1),
  'Vendas',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Verificação
SELECT '✅ Tenant criado:' AS status, name, slug FROM tenants WHERE slug = 'byte-crm';
SELECT '✅ Admin criado:' AS status, name, email, role FROM users WHERE email = 'admin@bytecrm.online';
SELECT '✅ Workspace criado:' AS status, name, slug FROM workspaces WHERE slug = 'principal';
