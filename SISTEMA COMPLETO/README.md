# CRM BYTE & SENTINELA SECOPS 2.0
> **A Plataforma Definitiva de CRM, Gestão Financeira, Atendimento WhatsApp e Segurança Biométrica**

---

## 📖 Visão Geral do Sistema
O **CRM BYTE** é um sistema completo e escalável projetado para empresas que precisam centralizar suas vendas, finanças e atendimento. O diferencial do sistema é o módulo **Sentinela SecOps 2.0**, que implementa autenticação biométrica facial e controle de acesso estilo militar (Zero-Knowledge) para transações financeiras e visualização de dados sensíveis.

O sistema é dividido em três microsserviços principais:
1. **Frontend (SPA - Single Page Application):** Interface de usuário ultrarrápida, design Premium (Dark Mode/Glassmorphism).
2. **Backend (API Principal):** Regras de negócio do CRM, ERP financeiro e integração Webhook/WhatsApp.
3. **Biometric Service (SecOps):** Serviço isolado em Python que utiliza Machine Learning (`FaceNet512` e `MTCNN`) para validar identidades através da webcam.
4. **Landing Page:** Site estático focado em alta conversão e apresentação comercial do produto.

---

## 🏗️ Arquitetura e Tecnologias

### 1. Frontend (`/frontend`)
- **Core:** JavaScript Vanilla + Padrão SPA Moderno (sem framework pesado).
- **Tooling:** Vite (Build tool ultrarrápido).
- **Estilização:** CSS puro com variáveis dinâmicas (Design Tokens), Glassmorphism, UI fluída e componentes premium.
- **Gráficos:** Chart.js para dashboards interativos.
- **Estrutura:** 
  - `src/main.js` gerencia o ciclo de vida da SPA, router e renderização de views (Pipeline, Dashboard, Login, etc).
  - `src/lib/` contém Store global, Router e camada de API.

### 2. Backend Principal (`/backend`)* 
*(Nota: Parte do escopo do design de arquitetura para a API RESTful)*
- **Core:** Node.js + Express (ou Fastify).
- **Database:** PostgreSQL (dados relacionais, clientes, transações) + Redis (cache e sessão rápida).
- **Funcionalidades:** CRUD de Leads (Kanban), emissão de relatórios, gestão de contas a pagar/receber e mensageria.

### 3. Biometric Service (`/biometric_service`)
- **Core:** Python + FastAPI.
- **Machine Learning:** `DeepFace` (com o modelo `Facenet512`) e `MTCNN` para extração de rostos em alta precisão.
- **Segurança:** Compara a foto do banco de dados (cadastrada) com a captura da webcam em tempo real. Tolerância configurada rigorosamente para evitar falsos positivos (Spoofing leve).
- **Consumo:** Exige ~2GB de RAM por instância durante a inicialização do modelo.

### 4. Landing Page (`/landing`)
- **Core:** HTML/CSS/JS estático.
- **Estética:** Dark Mode Vibrante, animações nativas por scroll (`IntersectionObserver`), totalmente otimizada para SEO.

---

## 🚀 Como Rodar o Sistema Localmente (Passo a Passo)

### Passo 1: Pré-requisitos
- Instale o [Node.js](https://nodejs.org/en/) (Versão 18+).
- Instale o [Python 3.10+](https://www.python.org/downloads/).
- Tenha o [Git](https://git-scm.com/) instalado.

### Passo 2: Subindo o Frontend e Landing Page
1. Abra um terminal.
2. Navegue até a pasta do Frontend:
   ```bash
   cd "SISTEMA COMPLETO/frontend"
   ```
3. Instale as dependências:
   ```bash
   npm install
   ```
4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
5. O terminal exibirá um link (geralmente `http://localhost:5173`). Abra no navegador. Você verá o login e a aplicação CRM.

> **Visualizando a Landing Page:**
> A Landing Page é puramente estática. Basta dar duplo clique no arquivo `SISTEMA COMPLETO/landing/index.html` para abri-la no navegador ou rodar através de extensões como *Live Server* no VSCode.

### Passo 3: Subindo o Serviço Biométrico (Opcional - SecOps)
*(Execute isso caso deseje testar a validação facial localmente)*
1. Abra um novo terminal.
2. Navegue até a pasta do serviço:
   ```bash
   cd "SISTEMA COMPLETO/biometric_service"
   ```
3. Crie e ative um ambiente virtual:
   - **Windows:** `python -m venv venv` e depois `.\venv\Scripts\activate`
   - **Linux/Mac:** `python3 -m venv venv` e depois `source venv/bin/activate`
4. Instale as dependências (pode demorar devido aos pacotes pesados de IA):
   ```bash
   pip install -r requirements.txt
   ```
5. Inicie a API de IA:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
A API ficará disponível em `http://localhost:8000/docs`.

---

## ☁️ Deploy de Produção no EasyPanel (Infraestrutura)

Para colocar o sistema online no ar com SSL (https), utilizamos o **EasyPanel** (um painel Docker gerenciado incrível).

### A Arquitetura de Domínios
- **Landing Page (Marketing):** `bytecrm.online` (ou www.bytecrm.online)
- **CRM App (Sistema):** `app.bytecrm.online`
- **APIs internas:** Os containers se comunicam via rede Docker interna, não expostos diretamente.

### Passo a Passo no EasyPanel

#### 1. Hospedar a Landing Page
1. No EasyPanel, crie um novo projeto e clique em **App**.
2. Selecione a fonte como seu repositório **GitHub**.
3. **Build Path:** Digite `landing` (para o EasyPanel olhar apenas para esta pasta).
4. **Domains:** Adicione `bytecrm.online` e marque a opção para gerar o certificado SSL grátis (Let's Encrypt).
5. O EasyPanel reconhecerá automaticamente que é um site estático e subirá com o servidor web dele de alta performance. Clique em **Deploy**.

#### 2. Hospedar o CRM Frontend (O App)
1. Crie outro **App** no mesmo projeto do EasyPanel.
2. Fonte: Seu **GitHub**.
3. **Build Path:** Digite `frontend`.
4. **Domains:** Adicione `app.bytecrm.online` e marque SSL.
5. Em **Advanced / Build**, o EasyPanel usará **Nixpacks** nativamente. Como existe um `package.json` com Vite, ele instalará os módulos e rodará o build de produção sozinho.
6. Clique em **Deploy**.

#### 3. Hospedar o Serviço Biométrico
1. Crie um **App** novo.
2. **Build Path:** `biometric_service`.
3. **Deploy Type:** Dockerfile (certifique-se de que o Dockerfile existe no diretório).
4. **Recursos (IMPORTANTE):** Vá na aba *Resources* do EasyPanel e garanta no mínimo **2GB de RAM** para este container, caso contrário ele irá *crashear* ao tentar carregar o modelo de IA na memória.
5. Clique em **Deploy**.

---

## 🎨 Design System e Customizações

Se você deseja alterar a estética global (ex: mudar o azul principal para roxo, ou verde):
1. Abra `frontend/src/styles/design-tokens.css`
2. Modifique as variáveis `--color-accent` e `--color-primary`. Todo o CRM respeita esses tokens.
3. Para a Landing Page, os estilos base estão em `landing/styles.css`.

> **Temas:** A aplicação utiliza o padrão `Glassmorphism` (vidro escuro translúcido com desfoque). Para editar a intensidade do vidro, procure no CSS pela regra `backdrop-filter: blur(20px)`.

---
*Documentação oficial mantida pela Equipe CRM BYTE. Projetado para escalabilidade máxima e segurança biométrica implacável.*
