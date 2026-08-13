# Memória do Projeto: Anorak - OASIS Project Hub

## 📌 Status Atual do Desenvolvimento

1. **Arquitetura e M.O. de Deploy:**
   - **Ambiente de Homologação (`/hml`):** Todo o ciclo de desenvolvimento, novos módulos e testes é isolado no subdiretório `/hml` (`http://anorak.hubdigital360.com/hml/`).
   - **Ambiente de Produção (`root`):** Apenas releases validadas são publicadas na raiz via `deploy-prod.ps1`.
   - **Controle de Versão:** Repositório Git configurado em [Mariozinhocs/Anorak](https://github.com/Mariozinhocs/Anorak.git) com `.gitignore` protegendo credenciais (`.env*`, `ftp_config*.json`, etc.).

2. **Camada de Banco de Dados e Backend (MySQL + PHP REST API):**
   - **Schema DDL (`api/schema.sql`):** Suporta prefixos dinâmicos (`{PREFIX}`) para isolamento de tabelas (`items`, `users`, `activity_logs`).
   - **Instalador Automático (`db_installer.php`):** Interface visual que verifica conectividade PDO MySQL, executa o schema, aplica migrações e realiza o seeding inicial dos projetos e ideias.
   - **API RESTful (`api/items.php`):** Endpoints com suporte completo a GET, POST, PUT e DELETE com campos JSON estruturados.
   - **Configurações Globais (`api/config.php`):** Gerenciador de `.env`, conexão PDO segura (`utf8mb4`), timezone UTC forçado e headers CORS/JSON.

3. **Frontend Reativo e Offline-First (Vanilla JS + CSS Custom):**
   - **Armazenamento Híbrido (`js/db.js`):** Funciona 100% offline via LocalStorage / IndexedDB com sincronização automática e transparente em segundo plano via `api/items.php` quando online.
   - **Modelo de Dados Flexível (`js/models.js`):** Suporte a Projetos, Tarefas, Ideias, Níveis de Prioridade, Matriz de Decisão (Impacto x Urgência) e Chaves de Halliday (Cobre, Jade, Cristal).
   - **Módulos Adicionais:** Captura de ideias por voz (`voice.js`), Matriz de Eisenhower/Impacto (`matrix.js`) e Monitoramento passivo de repositórios GitHub (`sync.js`).

---

## 📂 Estrutura de Arquivos Criados/Modificados

* **Infraestrutura e Deploys:**
  * [.gitignore](file:///g:/Meu%20Drive/Dev's/Anorak/.gitignore) (Proteção de arquivos `.env`, `.bak` e senhas)
  * [.env.example](file:///g:/Meu%20Drive/Dev's/Anorak/.env.example) (Modelo de configuração)
  * [.env.hml](file:///g:/Meu%20Drive/Dev's/Anorak/.env.hml) (Configuração de homologação)
  * [deploy-hml.ps1](file:///g:/Meu%20Drive/Dev's/Anorak/deploy-hml.ps1) (Deploy automatizado para `/hml` via FTP)
  * [deploy-prod.ps1](file:///g:/Meu%20Drive/Dev's/Anorak/deploy-prod.ps1) (Deploy automatizado para a raiz `prod` via FTP)
  * [project_memory.md](file:///g:/Meu%20Drive/Dev's/Anorak/project_memory.md) (Documento vivo de memória do projeto)

* **Backend e Banco de Dados:**
  * [db_installer.php](file:///g:/Meu%20Drive/Dev's/Anorak/db_installer.php) (Script instalador e migrador de banco)
  * [api/schema.sql](file:///g:/Meu%20Drive/Dev's/Anorak/api/schema.sql) (Definição DDL das tabelas MySQL)
  * [api/config.php](file:///g:/Meu%20Drive/Dev's/Anorak/api/config.php) (Configurações PDO e UTC)
  * [api/items.php](file:///g:/Meu%20Drive/Dev's/Anorak/api/items.php) (API RESTful de sincronização de itens)

* **Frontend:**
  * [index.html](file:///g:/Meu%20Drive/Dev's/Anorak/index.html) (Estrutura da aplicação)
  * [css/](file:///g:/Meu%20Drive/Dev's/Anorak/css/) (`variables.css`, `base.css`, `components.css`, `animations.css`)
  * [js/](file:///g:/Meu%20Drive/Dev's/Anorak/js/) (`db.js`, `models.js`, `app.js`, `voice.js`, `matrix.js`, `sync.js`)

---

## 🎯 Próximos Passos
1. Executar o instalador do banco em Homologação (`http://anorak.hubdigital360.com/hml/db_installer.php`).
2. Validar a persistência remota dos projetos e ideias no MySQL.
3. Testar a matriz de decisão e a captura por voz em dispositivos móveis no ambiente HML.
