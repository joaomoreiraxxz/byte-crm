# 📖 Manual Completo — Deploy CRM BYTE no EasyPanel

> **Dados do seu projeto:**
> - Repositório: `github.com/joaomoreiraxxz/byte-crm`
> - Branch: `main`
> - Domínio app: `app.bytecrm.online`
> - Domínio API: `api.bytecrm.online`

---

## FASE 0 — Deletar Projeto Antigo

1. Abra o EasyPanel no navegador: `http://SEU_IP:3000`
2. Na **sidebar esquerda**, localize o projeto antigo
3. Clique no **nome do projeto** para abrir
4. No canto superior direito, clique no ícone de **engrenagem ⚙️** (Settings)
5. Role até o final da página
6. Clique no botão vermelho **"Destroy Project"**
7. Digite o nome do projeto para confirmar
8. Clique **"Destroy"**

> [!WARNING]
> Isto apaga TUDO (containers, volumes, dados). Se tinha dados importantes no banco, faça backup antes.

---

## FASE 1 — Criar Projeto Novo

1. Na **sidebar esquerda** do EasyPanel, clique no botão **"+ New"**
2. No campo **"Project Name"**, digite: `bytecrm`
3. Clique **"Create"**
4. Você será redirecionado para a página do projeto (vazia, sem serviços)

---

## FASE 2 — Criar PostgreSQL

1. Dentro do projeto `bytecrm`, clique em **"+ Service"**
2. Na lista de tipos, clique em **"Postgres"**
3. Preencha:
   - **Service Name**: `db`
4. Clique **"Create"**
5. Aguarde o serviço iniciar (status fica verde "Running")

### Copiar credenciais
6. Clique no serviço **`db`** que acabou de criar
7. Clique na aba **"Credentials"** (ou "Info")
8. Você verá algo como:
   ```
   Host: db
   Port: 5432
   Username: postgres
   Password: xxxxxxxxxxxxx
   Database: postgres
   Internal URL: postgres://postgres:xxxxxxxxxxxxx@db:5432/postgres
   ```
9. **Copie a "Internal URL"** inteira — você vai precisar dela depois

> [!TIP]
> Anote a senha e a URL num bloco de notas temporário. Você vai usar várias vezes.

---

## FASE 3 — Criar Redis

1. Volte para a página do projeto (clique em `bytecrm` na sidebar)
2. Clique em **"+ Service"**
3. Na lista de tipos, clique em **"Redis"**
4. Preencha:
   - **Service Name**: `redis`
5. Clique **"Create"**
6. Aguarde ficar "Running"

### Copiar credenciais
7. Clique no serviço **`redis`**
8. Aba **"Credentials"**
9. Copie a **"Internal URL"** (algo como `redis://:senha@redis:6379`)

---

## FASE 4 — Criar Backend API

1. Volte para a página do projeto
2. Clique em **"+ Service"**
3. Selecione **"App"**
4. Preencha:
   - **Service Name**: `api`
5. Clique **"Create"**

### 4.1 — Configurar Source (GitHub)
6. Clique no serviço **`api`** para abrir
7. Na aba **"Source"** (ou "General"):
   - **Source Type**: Selecione **"GitHub"**
   - **Repository**: `joaomoreiraxxz/byte-crm`
   - **Branch**: `main`
   - **Build Path**: `/backend`
8. No campo **"Build"** (ou "Builder"):
   - **Builder**: Selecione **"Dockerfile"**
   - O EasyPanel vai detectar automaticamente o `Dockerfile` na pasta `/backend`

### 4.2 — Configurar Porta
9. Na seção **"Ports"** ou **"Network"**:
   - **Target Port**: `3000`

### 4.3 — Configurar Variáveis de Ambiente
10. Clique na aba **"Environment"**
11. Clique em **"Add Variable"** ou no editor de bulk. Cole TUDO de uma vez:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=COLE_A_INTERNAL_URL_DO_POSTGRES_AQUI
REDIS_URL=COLE_A_INTERNAL_URL_DO_REDIS_AQUI
JWT_SECRET=c55381fe2227b09507c162f0ad004c6361d8a63126093bfc3b013ae27e6b0a12
JWT_REFRESH_SECRET=e49ea0c5c841768b722a0dcbddda70f4adb2896bd30e079e7addd093714133e7
AUDIT_ENCRYPTION_KEY=bd804232437121f3d264b1c801b0ef6a17dd5141211163138e24be7277d2ab1a
VAULT_MASTER_SALT=f4aeefb7213cfa40d78e2f80be5d692a
CSRF_SECRET=7a7f78a8000f2094f2d8d386787c8cb3
BIOMETRIC_SERVICE_URL=http://biometric:8000
BIOMETRIC_API_KEY=99ca7d7d8f1a499ebbd4023a70eaaa8d26b571cf8e1b25a8
CORS_ORIGIN=https://app.bytecrm.online
```

> [!IMPORTANT]
> Substitua `COLE_A_INTERNAL_URL_DO_POSTGRES_AQUI` e `COLE_A_INTERNAL_URL_DO_REDIS_AQUI` pelas URLs que você copiou nas Fases 2 e 3. Exemplo:
> - `DATABASE_URL=postgres://postgres:abc123@db:5432/postgres`
> - `REDIS_URL=redis://:xyz789@redis:6379`

12. Clique **"Save"**

### 4.4 — Configurar Domínio
13. Clique na aba **"Domains"**
14. Clique **"Add Domain"**
15. Preencha:
    - **Domain**: `api.bytecrm.online`
    - **HTTPS**: ✅ Ativado (Let's Encrypt automático)
    - **Port**: `3000`
16. Clique **"Save"**

### 4.5 — Deploy
17. Clique no botão **"Deploy"** (canto superior direito, botão azul/verde)
18. Acompanhe o build na aba **"Deployments"** ou **"Logs"**
19. Aguarde até aparecer **"Running"** ✅

> [!WARNING]
> Se o build falhar, clique na aba **"Logs"** para ver o erro. Os erros mais comuns são:
> - `DATABASE_URL` incorreta → verifique se copiou a URL completa do Postgres
> - Dockerfile não encontrado → verifique se o Build Path está `/backend`

---

## FASE 5 — Criar Frontend

1. Volte para a página do projeto
2. Clique em **"+ Service"** → **"App"**
3. Preencha:
   - **Service Name**: `frontend`
4. Clique **"Create"**

### 5.1 — Configurar Source
5. Clique no serviço **`frontend`**
6. Na aba **"Source"**:
   - **Source Type**: **"GitHub"**
   - **Repository**: `joaomoreiraxxz/byte-crm`
   - **Branch**: `main`
   - **Build Path**: `/frontend`
7. **Builder**: Selecione **"Dockerfile"**

### 5.2 — Configurar Porta
8. **Target Port**: `80`

### 5.3 — Configurar Domínio
9. Aba **"Domains"** → **"Add Domain"**
10. Preencha:
    - **Domain**: `app.bytecrm.online`
    - **HTTPS**: ✅ Ativado
    - **Port**: `80`
11. Clique **"Save"**

### 5.4 — Deploy
12. Clique **"Deploy"**
13. Aguarde até **"Running"** ✅

---

## FASE 6 — Configurar DNS na Hostinger

1. Acesse **hpanel.hostinger.com**
2. No menu lateral, clique em **"Domínios"**
3. Selecione **`bytecrm.online`**
4. Clique em **"DNS / Nameservers"** (ou "Zona DNS")
5. Adicione os seguintes registros tipo **A**:

| Tipo | Nome | Aponta para | TTL |
|---|---|---|---|
| A | `app` | `IP_DA_SUA_VPS` | 3600 |
| A | `api` | `IP_DA_SUA_VPS` | 3600 |

> [!TIP]
> O IP da VPS é o mesmo que você usa para acessar o EasyPanel. Se não sabe, veja no painel da Hostinger em **"VPS" → seu servidor → "IP Address"**

6. Clique **"Salvar"** ou **"Add Record"** para cada registro
7. Aguarde propagação DNS (pode levar até 30 minutos, geralmente é instantâneo)

---

## FASE 7 — Rodar Migrations (Criar Tabelas)

1. No EasyPanel, clique no serviço **`db`** (PostgreSQL)
2. Clique na aba **"Terminal"** (ou "Console")
3. No terminal que abrir, execute:

```bash
psql -U postgres -d postgres
```

4. Agora você está dentro do PostgreSQL. Cole e execute **cada bloco SQL abaixo**, um por vez:

### Migration 1 — Tenants
```sql
-- Cole o conteúdo do arquivo 001_create_tenants.sql aqui
-- (copie do seu repositório: backend/src/database/migrations/001_create_tenants.sql)
```

### Migration 2 — Users
```sql
-- Cole o conteúdo de 002_create_users.sql
```

### Migration 3 — Audit Logs
```sql
-- Cole 003_create_audit_logs.sql
```

### Migration 4 — CRM
```sql
-- Cole 004_create_crm_tables.sql
```

### Migration 5 — ERP
```sql
-- Cole 005_create_erp_tables.sql
```

### Migration 6 — Vault
```sql
-- Cole 006_create_vault_tables.sql
```

### Migration 7 — WhatsApp
```sql
-- Cole 007_create_whatsapp_tables.sql
```

### Migration 8 — Workspaces
```sql
-- Cole 008_create_workspaces.sql
```

> [!TIP]
> Os arquivos de migration estão na pasta `backend/src/database/migrations/` do seu repositório GitHub. Abra cada um, copie o conteúdo SQL, e cole no terminal.

---

## FASE 8 — Criar Usuário Admin (Seed)

Ainda no terminal do PostgreSQL (Fase 7), cole e execute:

```sql
-- 1. Criar tenant
INSERT INTO tenants (id, name, slug, plan, status, created_at, updated_at)
VALUES (gen_random_uuid(), 'Byte CRM', 'byte-crm', 'premium', 'active', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- 2. Criar admin (Senha: ByteCRM@2026!)
INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE slug = 'byte-crm' LIMIT 1),
  'admin@bytecrm.online',
  '$2b$10$B/hSLiksj3lfKbmRuuypsefA/UjlPGoLqGja9YrSbCH/WZyPNQzvm',
  'Administrador', 'owner', 'active', NOW(), NOW()
) ON CONFLICT (email) DO NOTHING;

-- 3. Criar workspace
INSERT INTO workspaces (id, tenant_id, name, slug, description, created_by, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE slug = 'byte-crm' LIMIT 1),
  'Principal', 'principal', 'Workspace padrão',
  (SELECT id FROM users WHERE email = 'admin@bytecrm.online' LIMIT 1),
  NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- 4. Associar admin ao workspace
INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM workspaces WHERE slug = 'principal' LIMIT 1),
  (SELECT id FROM users WHERE email = 'admin@bytecrm.online' LIMIT 1),
  'owner', NOW()
) ON CONFLICT DO NOTHING;

-- 5. Criar pipeline
INSERT INTO pipelines (id, workspace_id, name, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM workspaces WHERE slug = 'principal' LIMIT 1),
  'Vendas', NOW(), NOW()
) ON CONFLICT DO NOTHING;
```

Para verificar se deu certo:
```sql
SELECT '✅' AS ok, email, role FROM users WHERE email = 'admin@bytecrm.online';
```

5. Digite `\q` para sair do psql

---

## FASE 9 — Verificação Final

### ✅ Checklist

Abra no seu navegador:

| Teste | URL | Esperado |
|---|---|---|
| Backend health | `https://api.bytecrm.online/health` | `{"status":"ok"}` ou similar |
| Frontend | `https://app.bytecrm.online` | Tela de login do CRM BYTE |
| Login | Tela de login | Email: `admin@bytecrm.online` / Senha: `ByteCRM@2026!` |

### Se algo não funcionar:

| Problema | Solução |
|---|---|
| Site não abre | DNS não propagou ainda — espere 30 min |
| `502 Bad Gateway` | Container não está rodando — veja **Logs** no EasyPanel |
| Login falha | Migrations ou seed não foram executados — volte à Fase 7 |
| Erro de CORS | Verifique se `CORS_ORIGIN` está exatamente `https://app.bytecrm.online` |
| WebSocket não conecta | O EasyPanel/Traefik suporta WebSocket nativamente — verifique os logs do backend |

---

## 📌 Credenciais de Acesso

| Item | Valor |
|---|---|
| **URL do App** | `https://app.bytecrm.online` |
| **Email admin** | `admin@bytecrm.online` |
| **Senha admin** | `ByteCRM@2026!` |

> [!CAUTION]
> **Troque a senha** após o primeiro login! Vá em **Configurações → Perfil → Alterar Senha** dentro do CRM.

---

## 🔮 Opcional — Biometric Service

Se sua VPS tiver **4GB+ de RAM livre**, você pode adicionar o serviço biométrico:

1. **"+ Service"** → **"App"** → Nome: `biometric`
2. Source: GitHub → `joaomoreiraxxz/byte-crm` → Branch: `main` → Build Path: `/biometric-service`
3. Builder: **Dockerfile**
4. Port: `8000`
5. Environment:
```
DATABASE_URL=COLE_A_INTERNAL_URL_DO_POSTGRES
API_KEY=99ca7d7d8f1a499ebbd4023a70eaaa8d26b571cf8e1b25a8
EMBEDDING_ENCRYPTION_KEY=023b6cf95b71468e67fb812c94a4813313eb46d4521a4aa3d3a1842251b5aa2a
MODEL_NAME=Facenet512
DETECTION_BACKEND=retinaface
FACE_MATCH_THRESHOLD=0.40
WORKERS=2
```
6. Deploy
