# Memória do Projeto: Anorak - OASIS Project Hub

## 📌 Status Atual do Desenvolvimento

1. **Separação de Camadas (Home Pública vs. Área Privada):**
   - **Landing Page Pública ([index.html](file:///g:/Meu%20Drive/Dev's/Anorak/index.html)):** Apresentação imersiva do ecossistema Anorak contendo:
     - **Pilares:** Frentes de Homologação Ágil, Incubadora de Ideias por Voz & IA, e Persistência Híbrida Sync.
     - **Seção Especializada da Matriz Halliday:** Demonstração visual dos 4 Quadrantes (Q1: Homologação Crítica, Q2: Inovação & Chave de Cristal, Q3: Refinamento Rápido, Q4: Incubadora & Backlog) e Conselheiro do Mago com fórmula heurística $(Impacto \times Urgência) \div Esforço$.
     - **As 3 Chaves de Halliday:** Estágios de maturidade (Cobre ➔ Jade ➔ Cristal).
     - **Seção Comercial de Planos SaaS:** *Avatar Explorer* (Grátis), *OASIS Creator* (R$ 49/mês) e *Halliday Master* (R$ 119/mês).
   - **Área Privada Protegida ([app.html](file:///g:/Meu%20Drive/Dev's/Anorak/app.html)):** Painel completo de gestão com guarda de rota obrigatória (redireciona para `login.html` se não autenticado) e botão de Logout.
   - **Tela de Login / Autenticação ([login.html](file:///g:/Meu%20Drive/Dev's/Anorak/login.html)):** Interface de identificação com feedback visual, bloqueio de submissão dupla e redirecionamento dinâmico.

2. **Backend de Autenticação, Planos e Banco de Dados (PHP + MySQL):**
   - **Campos de Assinatura:** Tabela `users` atualizada com suporte a `plan` (enum: explorer, creator, master), `plan_status` e `plan_expires_at`.
   - **`api/auth/login.php`:** Validação de credenciais via `password_verify`, suporte a e-mail ou username, e persistência de sessão PHP com cookies seguros (HTTPOnly, SameSite).
   - **`api/auth/check_auth.php`:** Endpoint leve para verificação em tempo real da sessão do usuário ativo.
   - **`api/auth/logout.php`:** Encerramento seguro de sessão e destruição de cookies.
   - **Instalador ([db_installer.php](file:///g:/Meu%20Drive/Dev's/Anorak/db_installer.php)):** Criação e migração das tabelas (`items`, `users`, `activity_logs`) com seeding automático do usuário administrador padrão (`mariozinhocs` / Plano Master / senha padrão `anorak2026`).

3. **Arquitetura e M.O. de Deploy:**
   - **Ambiente de Homologação (`/hml`):** Todo o desenvolvimento e validações sobem para a subpasta `hml/` (`http://anorak.hubdigital360.com/hml/`).
   - **Ambiente de Produção (`root`):** Publicação direta na raiz do domínio via `deploy-prod.ps1`.
   - **Repositório Git:** Sincronizado em [Mariozinhocs/Anorak](https://github.com/Mariozinhocs/Anorak.git) com `.gitignore` protegendo credenciais.

---

## 📂 Estrutura de Arquivos Criados/Modificados

* **Frontend:**
  * [index.html](file:///g:/Meu%20Drive/Dev's/Anorak/index.html) (Landing page pública de apresentação)
  * [login.html](file:///g:/Meu%20Drive/Dev's/Anorak/login.html) (Tela de autenticação)
  * [app.html](file:///g:/Meu%20Drive/Dev's/Anorak/app.html) (Painel restrito de homologação e gestão)
  * [css/home.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/home.css) (Estilos da Home de apresentação)
  * [css/login.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/login.css) (Estilos da tela de login)
  * [css/variables.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/variables.css), [css/base.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/base.css), [css/components.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/components.css), [css/animations.css](file:///g:/Meu%20Drive/Dev's/Anorak/css/animations.css)
  * [js/app.js](file:///g:/Meu%20Drive/Dev's/Anorak/js/app.js) (Controlador principal com verificação de auth e logout)
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

* **Infraestrutura e Deploys:**
  * [deploy-hml.ps1](file:///g:/Meu%20Drive/Dev's/Anorak/deploy-hml.ps1) (Deploy para `/hml`)
  * [deploy-prod.ps1](file:///g:/Meu%20Drive/Dev's/Anorak/deploy-prod.ps1) (Deploy para raiz)
  * [.gitignore](file:///g:/Meu%20Drive/Dev's/Anorak/.gitignore) (Proteção de arquivos sensíveis)

---

## 🎯 Credenciais Padrão do Ambiente

- **Usuário:** `mariozinhocs` (ou `mario@hubdigital360.com`)
- **Senha Padrão Inicial:** `anorak2026`
