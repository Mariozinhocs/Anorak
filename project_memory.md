# Memória do Projeto: Anorak - OASIS Project Hub

## 📌 Status Atual do Desenvolvimento

1. **Separação de Camadas (Home Pública vs. Área Privada):**
   - **Landing Page Pública ([index.html](file:///g:/Meu%20Drive/Dev's/Anorak/index.html)):** Apresentação imersiva do ecossistema Anorak contendo:
     - **Pilares:** Frentes de Homologação Ágil, Incubadora de Ideias por Voz & IA, e Persistência Híbrida Sync.
     - **Seção Especializada da Matriz Halliday:** Demonstração visual dos 4 Quadrantes (Q1: Homologação Crítica, Q2: Inovação & Chave de Cristal, Q3: Refinamento Rápido, Q4: Incubadora & Backlog) e Conselheiro do Mago com fórmula heurística $(Impacto \times Urgência) \div Esforço$.
     - **As 3 Chaves de Halliday:** Estágios de maturidade (Cobre ➔ Jade ➔ Cristal).
     - **Seção Comercial de Planos SaaS:** Carrossel infinito dos 4 Planos com ativação sequencial dos 4 dots indicadores (*Avatar Explorer* Grátis, *OASIS Creator* R$ 49/mês, *Halliday Master* R$ 119/mês e *Anorak Legend* R$ 199/mês).
   - **Área Privada Protegida ([app.html](file:///g:/Meu%20Drive/Dev's/Anorak/app.html)):** Painel completo de gestão com guarda de rota obrigatória (redireciona para `login.html` se não autenticado) e botão de Logout.
     - **Visualização Dual (Grade vs Lista estilo Google Drive):** Alternância instantânea no topo das Frentes de Homologação entre Modo Grade (Cards) e Modo Lista (Tabela horizontal compacta estilo Google Drive), com salvamento de preferência no `localStorage`.
     - **Edição Completa & Links de Acesso:** Botão **`✏️ Editar Painel`** e Mini Gauge de evolução (SVG) para edição de Nome, Descrição, Status, Prioridade e Links externos desmembrados em **Homologação (HML)** (🧪) e **Ambiente Live / Produção** (🚀).
     - **Gestão de Colaboradores & Convites (`🤝 Colaboradores`):** Modal dedicado `#modalShareProject` para convidar usuários registrados como colaboradores, remoção de membros, exibição de avatares/badges nos Cards e Modo Lista e geração de link direto.
   - **Tela de Login / Autenticação ([login.html](file:///g:/Meu%20Drive/Dev's/Anorak/login.html)):** Interface de identificação com feedback visual, bloqueio de submissão dupla e redirecionamento dinâmico.

2. **Backend de Autenticação, Pagamentos Mercado Pago e Banco (PHP + MySQL):**
   - **Módulo de Integração Mercado Pago (`api/payments/`):**
     - `create_pix.php`: Geração de cobranças Pix (QR Code + Copia e Cola) via API v1 do Mercado Pago `/v1/payments`.
     - `webhook.php`: Handler de notificações IPN/Webhooks para ativação e renovação automática de planos no MySQL (`users`).
     - `check_status.php`: Endpoint de polling para consulta em tempo real da liquidação de pagamentos.
   - **Campos de Assinatura:** Tabela `users` atualizada com suporte a `plan` (enum: explorer, creator, master, legend), `plan_status` e `plan_expires_at`.
   - **Tabela de Faturamento (`payments`):** Nova tabela criada para gerenciar logs de transações financeiras, métodos de pagamento e tempo de expiração do acesso.
   - **`api/auth/login.php`:** Validação de credenciais via `password_verify`, suporte a e-mail ou username, e persistência de sessão PHP com cookies seguros (HTTPOnly, SameSite).
   - **`api/auth/check_auth.php`:** Endpoint leve para verificação em tempo real da sessão do usuário ativo.
   - **`api/auth/logout.php`:** Encerramento seguro de sessão e destruição de cookies.
   - **Instalador ([db_installer.php](file:///g:/Meu%20Drive/Dev's/Anorak/db_installer.php)):** Criação e migração das tabelas (`items`, `users`, `activity_logs`, `payments`) com seeding automático do usuário administrador padrão (`admin` / Plano Master / senha padrão `anorak2026`).

3. **Branding & Padronização Visual:**
   - **Favicon & Logo Oficial (`assets/favicon.svg`):** Ativo vetorial oficial com a estampa do Mago Anorak (`🧙‍♂️`) aplicado via `<link rel="icon" type="image/svg+xml" href="assets/favicon.svg?v=1.5">` em todas as telas e no cabeçalho da Home.

4. **Painel de Gestão Administrativa ([admin.html](file:///g:/Meu%20Drive/Dev's/Anorak/admin.html)):**
   - **Controle de Usuários & Assinaturas:** Listagem, filtros por plano/status, redefinição de senhas e lixeira lógica (soft delete).
   - **Alterações em Lote (Batch Actions):** Edições simultâneas de status, planos ou expiração e exclusão definitiva em lote.
   - **Histórico Financeiro:** Listagem de transações e capacidade de inserção de pagamentos manuais.
   - **Console de Deploy & Banco:** Interface com terminal simulado para execução de migrações (`db_installer.php`) e deploy PowerShell FTP (`deploy-hml.ps1`) com feedback em tempo real.

5. **Arquitetura e M.O. de Deploy:**
   - **Ambiente de Homologação (`/hml`):** Todo o desenvolvimento e validações sobem para a subpasta `hml/` (`http://anorak.hubdigital360.com/hml/`).
   - **Ambiente de Produção (`root`):** Publicação direta na raiz do domínio via `deploy-prod.ps1`.
   - **Repositório Git:** Sincronizado no GitHub com `.gitignore` protegendo credenciais e commits estáveis etiquetados (v1.4.1).

---

## 📂 Estrutura de Arquivos Criados/Modificados

* **Frontend:**
  * [index.html](file:///g:/Meu%20Drive/Dev's/Anorak/index.html) (Landing page pública com carrossel dos 4 planos em loop contínuo e 4 dots ativos [CONCLUÍDO])
  * [aplicacoes.html](file:///g:/Meu%20Drive/Dev's/Anorak/aplicacoes.html) (Página de Casos de Uso/Aplicações multissegmentos com ilustrações cyberpunk [CONCLUÍDO])
  * [assets/](file:///g:/Meu%20Drive/Dev's/Anorak/assets) (Diretório com ilustrações, vídeo de fundo `bg-video.mp4` e marca vetorial `favicon.svg` [CONCLUÍDO])
  * [login.html](file:///g:/Meu%20Drive/Dev's/Anorak/login.html) (Tela de autenticação com suporte a sessão persistente)
  * [app.html](file:///g:/Meu%20Drive/Dev's/Anorak/app.html) (Painel restrito com alternância de exibição Grade vs Lista estilo Google Drive e modal de edição)
  * [admin.html](file:///g:/Meu%20Drive/Dev's/Anorak/admin.html) (Painel administrativo de controle de faturamento, deploy e contas)
  * [css/home.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/home.css) (Estilos da Home e carrossel responsivo)
  * [css/components.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/components.css) (Estilos dos componentes, modais e linhas de projetos em modo lista estilo Google Drive)
  * [css/login.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/login.css), [css/admin.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/admin.css), [css/help.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/help.css)
  * [css/variables.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/variables.css), [css/base.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/base.css), [css/animations.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/animations.css)
  * [js/app.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/app.js) (Controlador com suporte a visualização em lista estilo Google Drive, mini gauges e edição)
  * [js/admin.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/admin.js) (Controlador de UI do Painel Administrativo)
  * [js/db.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/db.js) (Camada de persistência híbrida Offline-First + MySQL)
  * [js/models.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/models.js), [js/voice.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/voice.js), [js/matrix.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/matrix.js), [js/sync.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/sync.js)

* **Backend e APIs:**
  * [api/config.php](file:///g:/Meu%20Drive/Dev's/Anorak/api/config.php) (Configurações PDO, UTC e sessões)
  * [api/schema.sql](file:///g:/Meu%20Drive/Dev's/Anorak/api/schema.sql) (DDL das tabelas MySQL com `{PREFIX}`)
  * [api/items.php](file:///g:/Meu%20Drive/Dev's/Anorak/api/items.php) (CRUD de projetos e ideias)
  * [api/auth/login.php](file:///g:/Meu%20Drive/Dev's/Anorak/api/auth/login.php) (Endpoint de login)
  * [api/auth/check_auth.php](file:///g:/Meu%20Drive/Dev's/Anorak/api/auth/check_auth.php) (Endpoint de verificação de sessão)
  * [api/auth/logout.php](file:///g:/Meu%20Drive/Dev's/Anorak/api/auth/logout.php) (Endpoint de logout)
  * [db_installer.php](file:///g:/Meu%20Drive/Dev's/Anorak/db_installer.php) (Instalador/migrador web com admin seeding)
  * **Diretório `api/admin/`:** APIs administrativas para usuários, faturamento e deploy.
  * **Diretório `api/payments/`:** Módulo de integração Mercado Pago (Pix QR Code `create_pix.php`, Webhook `webhook.php`, Checagem de status `check_status.php`).

* **Infraestrutura e Deploys:**
  * [deploy-hml.ps1](file:///g:/Meu%20Drive/Dev's/Anorak/deploy-hml.ps1) (Deploy para `/hml` contendo suporte a assets, admin e pagamentos)
  * [deploy-prod.ps1](file:///g:/Meu%20Drive/Dev's/Anorak/deploy-prod.ps1) (Deploy para raiz contendo suporte a assets, admin e pagamentos)
  * [.gitignore](file:///g:/Meu%20Drive/Dev's/Anorak/.gitignore) e [.env.example](file:///g:/Meu%20Drive/Dev's/Anorak/.env.example) (Configuração de chaves do Mercado Pago)

---

## 🎯 Credenciais Padrão do Ambiente

- **Usuário:** `admin` (ou `admin@hubdigital360.com`)
- **Senha Padrão Inicial:** `anorak2026`

