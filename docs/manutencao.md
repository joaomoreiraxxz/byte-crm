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
