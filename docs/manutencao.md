# Histórico de Manutenção

Este documento registra as alterações e implementações feitas no projeto, conforme regra obrigatória.

## Atualização - Melhorias de SEO e Design (Concluído)
- **O que foi feito:**
  - Criação da pasta `/docs` e documentação inicial para alinhar com as regras do projeto.
  - **Landing Page:** Adição de Meta Tags SEO (OpenGraph) e uma seção interativa de FAQ para aumentar conversão. Foi implementado o scroll suave via CSS.
  - **Frontend (CRM):** Transição do tema base de 'Warm Neutral' (Light Mode) para 'Deep Night Premium' (Dark Mode + Glassmorphism) através da atualização das variáveis globais, alinhando com a proposta estética da Landing Page.
- **Arquivos mudados:**
  - `docs/README.md`
  - `docs/manutencao.md`
  - `SISTEMA COMPLETO/landing/index.html`
  - `SISTEMA COMPLETO/landing/styles.css`
  - `SISTEMA COMPLETO/frontend/src/styles/design-tokens.css`
- **Código novo:** Seção completa de `<section class="faq">` adicionada à landing page e CSS customizado (acordeão/details). Variáveis de Glassmorphism reformuladas no frontend.

## Correção - Deploy EasyPanel
- **O que foi feito:**
  - Criação do `Dockerfile` na pasta `/landing` para permitir o deploy correto via EasyPanel.
- **Arquivos mudados:**
- `SISTEMA COMPLETO/landing/Dockerfile`
  - `docs/manutencao.md`
- **Código novo:** Configuração do Dockerfile utilizando a imagem `nginx:alpine` para servir os ativos estáticos e expor a porta 80.

## Atualização - Arquitetura Multi-Workspace & Evolution API
- **O que foi feito:**
  - Criação da tabela `workspaces` e injeção do conceito Multi-Workspace.
  - Tabelas de CRM (`pipelines`, `leads`) migradas para pertencerem a um Workspace.
  - Implementação das tabelas de Produtividade (`tasks`, `notes`, `calendar_events`).
  - Terminal SSH (root) corrigido (Erros no escape e conexões socket sem host caíam silenciosamente, adicionado logs robustos).
  - Rotas de Evolution API preparadas via Webhook em `whatsapp.routes.ts`.
  - Frontend remodelado: Telas de Workspace, Novo Lead, Tarefas, Notas e Calendário integradas com a API.
  - Nova Logo Criativa ("Ondas / Waves") desenhada em SVG avançado, substituindo o antigo favicon.
- **Arquivos mudados:**
  - Diversos no backend (`server.ts`, `api.js`, `crm/leads.controller.ts`, etc).
  - Novas tabelas na DB (`008_create_workspaces.sql`).
  - Módulos UI: `workspaces.js`, `productivity.js`, `layout.js`, `main.js`.
- **Código novo:** Integração total do frontend com o Backend consumindo a API com suporte a multiplos Workspaces via Header (`X-Workspace-Id`).

## Correção - Bugs Críticos e Nova Logo
- O que foi feito:
  - Criação de uma nova logo mais moderna em SVG (Dark e Light theme) para substituir a antiga.
  - Correção de erro fatal no frontend (importação incorreta do `showToast` no `workspaces.js` que quebrava o app).
  - Correção de rota duplicada no `main.js` que sobrescrevia a rota do calendário de produtividade.
- Arquivos mudados:
  - `frontend/public/favicon.svg`
  - `frontend/public/logo-light.svg`
  - `frontend/src/modules/workspaces.js`
  - `frontend/src/main.js`
- Código novo: 
  - Nova estrutura SVG moderna e brilhante para as logos.
  - Ajuste na importação do websocket e limpeza de rotas duplicadas.

## Atualização - Logo Refinada (Ondas Fluidas)
- O que foi feito:
  - Redesenho da logo em SVG (Dark e Light) para imitar perfeitamente o modelo de ondas azuis, cianos e púrpuras com fundo arredondado fornecido pelo usuário.
- Arquivos mudados:
  - `frontend/public/favicon.svg`
  - `frontend/public/logo-light.svg`
- Código novo: Estrutura SVG com paths de ondas sobrepostas e gradientes complexos.

## Correção - Validação do Workspace no CRM e Logo Customizada
- O que foi feito:
  - Correção dos erros no painel de CRM. O problema ocorria porque o painel tentava puxar os Leads da API antes de um Workspace ser selecionado (gerando erro 400 da API). Agora a tela intercepta e avisa o usuário amigavelmente.
  - Modificação do layout principal para carregar o arquivo `logo.png` ao invés de SVG, permitindo que a imagem enviada pelo usuário seja usada perfeitamente como a logo oficial do sistema.
- Arquivos mudados:
  - `frontend/src/modules/crm.js`
  - `frontend/src/modules/layout.js`
- Código novo: Lógica de validação `if (!active)` nos controllers de pipeline e contatos do frontend. Atualização da tag `<img>` no layout.

## Correção Completa — 5 Problemas Críticos (2026-08-09)
- O que foi feito:
  1. **CORS + DB Logic**: Adicionado `X-Workspace-Id` no allowedHeaders do CORS (server.ts). Sem isso, o browser bloqueava silenciosamente todas as requests do CRM.
  2. **Auto-criação de Pipeline**: Ao criar um Workspace, agora o backend cria automaticamente 1 Pipeline com 6 Stages (Novo Lead, Qualificado, Proposta, Negociação, Fechado, Perdido) usando transação SQL.
  3. **Perfil de Usuário**: Criadas rotas PUT /auth/me (updateProfile) e PUT /auth/me/password (changePassword). Frontend reescrito com formulários de perfil e troca de senha funcionais.
  4. **CRM Kanban Completo**: Frontend reescrito com Drag & Drop HTML5 nativo, CRUD de leads via modais estilizados, modal de detalhe com timeline de atividades/notas. Backend ganhou rotas POST /:id/notes e GET /:id/activities.
  5. **Sidebar Accordion**: Removidas seções duplicadas (Produtividade era cópia de Workspace Atual). Adicionado toggle animado nos labels de seção com persistência de estado.
  6. **Productivity sem prompt()**: Módulo `productivity.js` reescrito para usar modais estilizados em vez de prompt()/alert(). Corrigidas chamadas api.request() inexistentes para api.post()/api.get().

- Arquivos mudados:
  - `backend/src/server.ts` (CORS allowedHeaders)
  - `backend/src/modules/auth/auth.controller.ts` (+updateProfile, +changePassword)
  - `backend/src/modules/auth/auth.routes.ts` (+PUT /me, +PUT /me/password)
  - `backend/src/modules/workspaces/workspaces.controller.ts` (auto-pipeline + getPipelines)
  - `backend/src/modules/workspaces/workspaces.routes.ts` (+GET /:id/pipelines)
  - `backend/src/modules/crm/leads/leads.controller.ts` (+addLeadNote, +getLeadActivities)
  - `backend/src/modules/crm/leads/leads.routes.ts` (+POST /:id/notes, +GET /:id/activities)
  - `frontend/src/lib/api.js` (novos métodos auth/crm/workspaces)
  - `frontend/src/lib/store.js` (+activeWorkspace, +sidebarSections no state)
  - `frontend/src/modules/crm.js` (reescrito: Kanban D&D + CRUD + Notas)
  - `frontend/src/modules/system.js` (reescrito: Perfil + Senha)
  - `frontend/src/modules/productivity.js` (reescrito: modais estilizados)
  - `frontend/src/modules/layout.js` (reescrito: accordion sidebar)
  - `frontend/src/styles/components.css` (+CSS accordion)

- Código novo: Controllers backend para profile/password/notes/activities. Frontend inteiro dos módulos CRM, Settings, Productivity e Layout reescritos. CSS de accordion na sidebar.

## Correção Completa — Bugs + Melhorias Visuais (2026-08-09)
- O que foi feito:
  1. **ERP Crash Fix**: `erp.js` chamava `api.erp.getTransactions()` que não existia. Corrigido para `api.erp.getContasPagar()`. Módulo reescrito com UI completa (modais, tabelas, badges).
  2. **State Leak no Logout**: `resetState()` não limpava `activeWorkspace`, `activePipelineId`, `sidebarSections`. Corrigido.
  3. **Logout Silencioso**: Erro na API de logout bloqueava o fluxo. Agora ignora erros e sempre limpa estado local.
  4. **Tabs Presas**: `openedTabs` e `activeTabId` não eram resetados no logout. Corrigido.
  5. **Toast Sem Ícones**: `showToast()` usava Material Icons (não carregado). Substituído por SVGs inline coloridos.
  6. **Import Morto**: Removido `showToast` import não utilizado em `auth.js`.
  7. **Topbar Desalinhada**: Topbar não sincronizava com sidebar collapse. CSS e JS corrigidos.
  8. **Busca Branca no Dark Mode**: Input de busca ficava `background: white` no focus. Corrigido para `var(--color-bg-tertiary)`.
  9. **Login Premium**: Background com orbs animados, card com fadeInUp, hover com elevação.
  10. **Micro-Animações**: Workspace/contact cards com hover glow, tab panes com fadeInUp, kanban ghost rotacionado, botão primário com glow ring.
  11. **Toast Types CSS**: Cada tipo de toast (success/error/warning/info) tem cor de borda distinta.

- Arquivos mudados:
  - `frontend/src/modules/erp.js` (reescrito: API correta + UI completa)
  - `frontend/src/lib/store.js` (resetState completo)
  - `frontend/src/lib/websocket.js` (toast SVG icons)
  - `frontend/src/modules/layout.js` (logout fix + topbar sync + tab cleanup)
  - `frontend/src/modules/auth.js` (import morto removido)
  - `frontend/src/main.js` (tabs duplicados fix)
  - `frontend/src/styles/global.css` (toast type colors)
  - `frontend/src/styles/components.css` (topbar sync + micro-animations + search fix)
  - `frontend/src/styles/pages.css` (login animated + card hovers)

- Código novo: ERP module completo com modais e tabelas. Toast system com SVG icons inline. Login page com animated gradient orbs. Hover effects premium nos cards.
