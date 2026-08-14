# Memória do Projeto: Anorak - OASIS Project Hub

## 📌 Status Atual do Desenvolvimento

1. **Separação de Camadas (Home Pública vs. Área Privada):**
   - **Landing Page Pública ([index.html](file:///g:/Meu%20Drive/Dev's/Anorak/index.html)):** Apresentação imersiva do ecossistema Anorak contendo:
     - **Pilares:** Frentes de Homologação Ágil, Incubadora de Ideias por Voz & IA, e Persistência Híbrida Sync.
     - **Seção Especializada da Matriz Halliday:** Demonstração visual dos 4 Quadrantes (Q1: Homologação Crítica, Q2: Inovação & Chave de Cristal, Q3: Refinamento Rápido, Q4: Incubadora & Backlog) e Conselheiro do Mago com fórmula heurística $(Impacto \times Urgência) \div Esforço$.
     - **As 3 Chaves de Halliday:** Estágios de maturidade (Cobre ➔ Jade ➔ Cristal).
     - **Seção Comercial de Planos SaaS:** *Avatar Explorer* (Grátis), *OASIS Creator* (R$ 49/mês), *Halliday Master* (R$ 119/mês) e *Anorak Legend* (R$ 199/mês).
   - **Área Privada Protegida ([app.html](file:///g:/Meu%20Drive/Dev's/Anorak/app.html)):** Painel completo de gestão com guarda de rota obrigatória (redireciona para `login.html` se não autenticado) e botão de Logout. Exibe o link do painel de administração (`🛡️`) se o usuário ativo for um administrador. Inclui funcionalidade de edição de projetos (com atualização de links do drive, git e live).
   - **Tela de Login / Autenticação ([login.html](file:///g:/Meu%20Drive/Dev's/Anorak/login.html)):** Interface de identificação com feedback visual, bloqueio de submissão dupla e redirecionamento dinâmico.

2. **Backend de Autenticação, Planos e Banco de Dados (PHP + MySQL):**
   - **Campos de Assinatura:** Tabela `users` atualizada com suporte a `plan` (enum: explorer, creator, master, legend), `plan_status` e `plan_expires_at`.
   - **Tabela de Faturamento (`payments`):** Nova tabela criada para gerenciar logs de transações financeiras, métodos de pagamento e tempo de expiração do acesso.
   - **`api/auth/login.php`:** Validação de credenciais via `password_verify`, suporte a e-mail ou username, e persistência de sessão PHP com cookies seguros (HTTPOnly, SameSite).
   - **`api/auth/check_auth.php`:** Endpoint leve para verificação em tempo real da sessão do usuário ativo.
   - **`api/auth/logout.php`:** Encerramento seguro de sessão e destruição de cookies.
   - **Instalador ([db_installer.php](file:///g:/Meu%20Drive/Dev's/Anorak/db_installer.php)):** Criação e migração das tabelas (`items`, `users`, `activity_logs`, `payments`) com seeding automático do usuário administrador padrão (`admin` / Plano Master / senha padrão `anorak2026`).

3. **Painel de Gestão Administrativa ([admin.html](file:///g:/Meu%20Drive/Dev's/Anorak/admin.html)):**
   - **Controle de Usuários & Assinaturas:** Listagem, filtros por plano/status, redefinição de senhas e lixeira lógica (soft delete).
   - **Alterações em Lote (Batch Actions):** Edições simultâneas de status, planos ou expiração e exclusão definitiva em lote.
   - **Histórico Financeiro:** Listagem de transações e capacidade de inserção de pagamentos manuais.
   - **Console de Deploy & Banco:** Interface com terminal simulado para execução de migrações (`db_installer.php`) e deploy PowerShell FTP (`deploy-hml.ps1`) com feedback em tempo real.

4. **Arquitetura e M.O. de Deploy:**
   - **Ambiente de Homologação (`/hml`):** Todo o desenvolvimento e validações sobem para a subpasta `hml/` (`http://anorak.hubdigital360.com/hml/`).
   - **Ambiente de Produção (`root`):** Publicação direta na raiz do domínio via `deploy-prod.ps1`.
   - **Repositório Git:** Sincronizado no GitHub com `.gitignore` protegendo credenciais.

---

## 📂 Estrutura de Arquivos Criados/Modificados

* **Frontend:**
  * [index.html](file:///g:/Meu%20Drive/Dev's/Anorak/index.html) (Landing page pública com link de navegação e vídeo de fundo reativo em loop [CONCLUÍDO])
  * [aplicacoes.html](file:///g:/Meu%20Drive/Dev's/Anorak/aplicacoes.html) (Página de Casos de Uso/Aplicações multissegmentos com ilustrações cyberpunk [CONCLUÍDO])
  * [assets/](file:///g:/Meu%20Drive/Dev's/Anorak/assets) (Diretório contendo as ilustrações personalizadas e o vídeo de fundo `bg-video.mp4` [CONCLUÍDO])
  * [login.html](file:///g:/Meu%20Drive/Dev's/Anorak/login.html) (Tela de autenticação com placeholders genéricos)
  * [app.html](file:///g:/Meu%20Drive/Dev's/Anorak/app.html) (Painel restrito de homologação e gestão - com modal de edição de projetos)
  * [admin.html](file:///g:/Meu%20Drive/Dev's/Anorak/admin.html) (Painel administrativo de controle de faturamento, deploy e contas)
  * [css/home.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/home.css) (Estilos da Home de apresentação)
  * [css/login.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/login.css) (Estilos da tela de login)
  * [css/admin.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/admin.css) (Estilos do Painel Admin)
  * [css/variables.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/variables.css), [css/base.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/base.css), [css/components.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/components.css), [css/animations.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/animations.css)
  * [js/app.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/app.js) (Controlador principal com verificação de auth, logout e edição de projetos)
  * [js/admin.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/admin.js) (Controlador de UI do Painel Administrativo e chamadas AJAX)
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
  * [deploy-hml.ps1](file:///g:/Meu%20Drive/Dev's/Anorak/deploy-hml.ps1) (Deploy para `/hml` atualizado para conter arquivos admin e de pagamentos)
  * [deploy-prod.ps1](file:///g:/Meu%20Drive/Dev's/Anorak/deploy-prod.ps1) (Deploy para raiz atualizado para conter arquivos admin e de pagamentos)
  * [.gitignore](file:///g:/Meu%20Drive/Dev's/Anorak/.gitignore) e [.env.example](file:///g:/Meu%20Drive/Dev's/Anorak/.env.example) (Configuração de chaves do Mercado Pago)

---

## 🎯 Credenciais Padrão do Ambiente

- **Usuário:** `admin` (ou `admin@hubdigital360.com`)
- **Senha Padrão Inicial:** `anorak2026`

