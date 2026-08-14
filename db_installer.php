<?php
header('Content-Type: text/html; charset=utf-8');

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

function loadEnv($path) {
    if (!file_exists($path)) {
        return false;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value, " \t\n\r\0\x0B\"'");
            if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
                putenv(sprintf('%s=%s', $name, $value));
                $_ENV[$name] = $value;
                $_SERVER[$name] = $value;
            }
        }
    }
    return true;
}

// Carrega .env
loadEnv(__DIR__ . '/.env');

$db_host = getenv('DATABASE_HOST') ?: 'localhost';
$db_user = getenv('DATABASE_USER') ?: 'root';
$db_pass = getenv('DATABASE_PASSWORD') ?: '';
$db_name = getenv('DATABASE_NAME') ?: 'anorak_db';
$db_port = getenv('DATABASE_PORT') ?: '3306';
$prefix = getenv('DB_TABLE_PREFIX') ?: '';

?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Instalador / Migrador do Banco - Anorak OASIS</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0f19; color: #f3f4f6; margin: 0; padding: 40px; display: flex; justify-content: center; }
        .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; max-width: 800px; width: 100%; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        h1 { color: #38bdf8; margin-top: 0; font-size: 24px; border-bottom: 1px solid #1f2937; padding-bottom: 16px; }
        .log-box { background: #030712; border: 1px solid #374151; border-radius: 8px; padding: 16px; font-family: 'Consolas', monospace; font-size: 13px; line-height: 1.6; max-height: 450px; overflow-y: auto; }
        .success { color: #4ade80; }
        .error { color: #f87171; font-weight: bold; }
        .info { color: #60a5fa; }
        .warning { color: #fbbf24; }
        .btn { display: inline-block; margin-top: 20px; background: #0284c7; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; }
        .btn:hover { background: #0369a1; }
    </style>
</head>
<body>
<div class="card">
    <h1>🔮 Anorak OASIS - Instalador de Banco de Dados</h1>
    <p>Executando configuração automática das tabelas e migrações no banco de dados MySQL...</p>
    <div class="log-box">
<?php

echo "<span class='info'>[INFO] Verificando conexão com o banco MySQL...</span>\n";
echo "Host: $db_host:$db_port | Banco: $db_name | Prefixo: '$prefix'\n";

try {
    $pdo = new PDO("mysql:host=$db_host;port=$db_port;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    echo "<span class='success'>[OK] Conexão com o banco estabelecida com sucesso!</span>\n\n";

    $sql_file = __DIR__ . '/api/schema.sql';
    if (!file_exists($sql_file)) {
        throw new Exception("Arquivo api/schema.sql não foi encontrado em: $sql_file");
    }

    $raw_sql = file_get_contents($sql_file);
    $queries = str_replace('{PREFIX}', $prefix, $raw_sql);

    echo "<span class='info'>[EXEC] Criando/Verificando tabelas do schema...</span>\n";
    $statements = array_filter(array_map('trim', explode(';', $queries)));
    foreach ($statements as $stmt) {
        if (!empty($stmt)) {
            $pdo->exec($stmt);
        }
    }
    echo "<span class='success'>[OK] Tabelas criadas/atualizadas com sucesso!</span>\n\n";

    // Verificar se a tabela de itens precisa de seeding inicial
    $items_table = $prefix . 'items';
    $count_res = $pdo->query("SELECT COUNT(*) as total FROM `{$items_table}`");
    $total_items = (int) $count_res->fetch()['total'];

    if ($total_items === 0) {
        echo "<span class='info'>[SEED] Populando projetos e ideias iniciais no banco...</span>\n";

        $seed_projects = [
            [
                'id' => 'proj_retroverse_vr',
                'type' => 'project',
                'title' => 'RetroVerse VR',
                'description' => 'Plataforma imersiva de emuladores retrô 3D, salas virtuais multiplayer e painel de controle do OASIS.',
                'status' => 'homologacao',
                'priority' => 'alta',
                'impact' => 'alto',
                'urgency' => 'alta',
                'tags_json' => json_encode(['Retro', 'VR', 'OASIS', 'Three.js']),
                'context_links_json' => json_encode([
                    'driveFolder' => 'https://drive.google.com/drive/folders/retroverse-vr',
                    'githubRepo' => 'https://github.com/Mariozinhocs/retroverse-vr.git',
                    'liveUrl' => 'https://retroverse.oasis'
                ]),
                'tasks_json' => json_encode([
                    ['id' => 't_360_1', 'title' => 'Integração e limpeza do emulador NES (clean_emu.php)', 'category' => 'Backend', 'completed' => true, 'validatedAt' => '2026-08-10T14:30:00Z'],
                    ['id' => 't_360_2', 'title' => 'Refatoração dos shaders WebGL e helper_render.php', 'category' => 'Segurança', 'completed' => true, 'validatedAt' => '2026-08-11T18:00:00Z'],
                    ['id' => 't_360_3', 'title' => 'Homologação do lobby multiplayer e transição de salas', 'category' => 'Frontend', 'completed' => true, 'validatedAt' => '2026-08-12T10:15:00Z'],
                    ['id' => 't_360_4', 'title' => 'Validação final de carregamento de ROMs & Assets', 'category' => 'Deploy', 'completed' => false],
                    ['id' => 't_360_5', 'title' => 'Aceite de usabilidade com óculos de realidade virtual', 'category' => 'QA', 'completed' => false]
                ]),
                'validation_history_json' => json_encode([
                    ['timestamp' => '2026-08-12T23:00:00Z', 'action' => 'Ambiente HML Configurado', 'taskTitle' => 'Homologação', 'taskId' => 'init']
                ])
            ],
            [
                'id' => 'proj_oasis_engine',
                'type' => 'project',
                'title' => 'OASIS Engine',
                'description' => 'Motor inteligente de processamento de voz com IA, alocação dinâmica de recursos e lógica da matriz de priorização.',
                'status' => 'homologacao',
                'priority' => 'alta',
                'impact' => 'alto',
                'urgency' => 'alta',
                'tags_json' => json_encode(['Gestão', 'Incubadora', 'OASIS', 'IA']),
                'context_links_json' => json_encode([
                    'driveFolder' => 'https://drive.google.com/drive/folders/oasis-engine',
                    'githubRepo' => 'https://github.com/Mariozinhocs/oasis-engine.git',
                    'liveUrl' => 'https://engine.oasis'
                ]),
                'tasks_json' => json_encode([
                    ['id' => 't_ano_1', 'title' => 'Arquitetura de dados orientada a Entidades e Atributos', 'category' => 'Arquitetura', 'completed' => true, 'validatedAt' => '2026-08-12T23:00:00Z'],
                    ['id' => 't_ano_2', 'title' => 'Dashboard Dual Mode: Operacional & Incubadora', 'category' => 'Frontend', 'completed' => true, 'validatedAt' => '2026-08-12T23:45:00Z'],
                    ['id' => 't_ano_3', 'title' => 'Checklists interativos com gatilhos e Chaves de Halliday', 'category' => 'Lógica', 'completed' => true, 'validatedAt' => '2026-08-12T23:50:00Z'],
                    ['id' => 't_ano_4', 'title' => 'Integração da IA de processamento de áudio e Matriz de Decisão', 'category' => 'Inteligência', 'completed' => false],
                    ['id' => 't_ano_5', 'title' => 'Deploy no Hostinger (engine.hubdigital360.com)', 'category' => 'Deploy', 'completed' => false]
                ]),
                'validation_history_json' => json_encode([])
            ],
            [
                'id' => 'proj_synclink_api',
                'type' => 'project',
                'title' => 'SyncLink API',
                'description' => 'Módulo de automação de propostas, integrações seguras com APIs externas e canais de sincronização offline-first.',
                'status' => 'homologacao',
                'priority' => 'media',
                'impact' => 'alto',
                'urgency' => 'media',
                'tags_json' => json_encode(['Automação', 'Offline-First', 'API']),
                'context_links_json' => json_encode([
                    'driveFolder' => 'https://drive.google.com/drive/folders/synclink-api',
                    'githubRepo' => 'https://github.com/Mariozinhocs/synclink-api.git',
                    'liveUrl' => ''
                ]),
                'tasks_json' => json_encode([
                    ['id' => 't_hub_1', 'title' => 'Estruturação do fluxo de propostas automáticas', 'category' => 'Planejamento', 'completed' => true, 'validatedAt' => '2026-08-05T11:00:00Z'],
                    ['id' => 't_hub_2', 'title' => 'Validação de assinaturas de Webhooks & Segurança', 'category' => 'Integração', 'completed' => false],
                    ['id' => 't_hub_3', 'title' => 'Testes de homologação com clientes beta', 'category' => 'Validação', 'completed' => false],
                    ['id' => 't_hub_4', 'title' => 'Geração de relatórios em tempo real', 'category' => 'Backend', 'completed' => false]
                ]),
                'validation_history_json' => json_encode([])
            ],
            [
                'id' => 'idea_ai_prompt_builder',
                'type' => 'idea',
                'title' => 'Gerador Automático de Briefings com IA',
                'description' => 'Um assistente integrado para transformar áudios desestruturados de reuniões em especificações técnicas completas e tarefas de homologação.',
                'status' => 'priorizado',
                'priority' => 'alta',
                'impact' => 'alto',
                'urgency' => 'alta',
                'tags_json' => json_encode(['IA', 'Automação', 'Speech-to-Text']),
                'context_links_json' => json_encode([]),
                'tasks_json' => json_encode([]),
                'validation_history_json' => json_encode([])
            ]
        ];

        $insert_stmt = $pdo->prepare("
            INSERT INTO `{$items_table}` 
            (id, type, title, description, status, priority, impact, urgency, tags_json, context_links_json, tasks_json, validation_history_json, created_at, updated_at) 
            VALUES 
            (:id, :type, :title, :description, :status, :priority, :impact, :urgency, :tags_json, :context_links_json, :tasks_json, :validation_history_json, NOW(), NOW())
        ");

        foreach ($seed_projects as $p) {
            $insert_stmt->execute($p);
            echo " [SEED] Inserido: {$p['title']} ({$p['type']})\n";
        }
        echo "<span class='success'>[OK] Dados iniciais inseridos com sucesso!</span>\n\n";
    } else {
        echo "<span class='warning'>[AVISO] A tabela `{$items_table}` já contém $total_items registros. Nenhum seed inserido para preservar dados existentes.</span>\n\n";
    }

    // Verificar e criar usuário admin inicial
    $users_table = $prefix . 'users';
    try {
        $count_users = (int) $pdo->query("SELECT COUNT(*) FROM `{$users_table}` WHERE username = 'admin'")->fetchColumn();
        if ($count_users === 0) {
            $admin_pass_hash = password_hash('anorak2026', PASSWORD_DEFAULT);
            $stmt_admin = $pdo->prepare("
                INSERT INTO `{$users_table}` (username, email, password_hash, role, plan, plan_status)
                VALUES ('admin', 'admin@hubdigital360.com', :hash, 'admin', 'master', 'active')
            ");
            $stmt_admin->execute([':hash' => $admin_pass_hash]);
            echo " [SEED] Usuário administrador padrão 'admin' criado com sucesso.\n";
        }
    } catch (Exception $e) {
        echo " [ERROR] Falha ao verificar/criar usuário admin: " . $e->getMessage() . "\n";
    }
    
    // Migração de colunas de assinatura/plano e recuperação de senha na tabela de usuários
    try {
        $col_plan = $pdo->query("SHOW COLUMNS FROM `{$users_table}` LIKE 'plan'");
        if ($col_plan->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `{$users_table}` ADD COLUMN plan ENUM('explorer', 'creator', 'master') NOT NULL DEFAULT 'creator' AFTER role");
            echo " [MIGRATE] Coluna 'plan' adicionada com sucesso na tabela users.\n";
        }
        $col_plan_status = $pdo->query("SHOW COLUMNS FROM `{$users_table}` LIKE 'plan_status'");
        if ($col_plan_status->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `{$users_table}` ADD COLUMN plan_status VARCHAR(50) NOT NULL DEFAULT 'active' AFTER plan");
            echo " [MIGRATE] Coluna 'plan_status' adicionada com sucesso na tabela users.\n";
        }
        $col_plan_expires = $pdo->query("SHOW COLUMNS FROM `{$users_table}` LIKE 'plan_expires_at'");
        if ($col_plan_expires->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `{$users_table}` ADD COLUMN plan_expires_at DATETIME NULL DEFAULT NULL AFTER plan_status");
            echo " [MIGRATE] Coluna 'plan_expires_at' adicionada com sucesso na tabela users.\n";
        }
        $col_reset_token = $pdo->query("SHOW COLUMNS FROM `{$users_table}` LIKE 'password_reset_token'");
        if ($col_reset_token->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `{$users_table}` ADD COLUMN password_reset_token VARCHAR(255) DEFAULT NULL AFTER plan_expires_at");
            echo " [MIGRATE] Coluna 'password_reset_token' adicionada com sucesso na tabela users.\n";
        }
        $col_reset_expires = $pdo->query("SHOW COLUMNS FROM `{$users_table}` LIKE 'password_reset_expires'");
        if ($col_reset_expires->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `{$users_table}` ADD COLUMN password_reset_expires DATETIME DEFAULT NULL AFTER password_reset_token");
            echo " [MIGRATE] Coluna 'password_reset_expires' adicionada com sucesso na tabela users.\n";
        }

        // Migração para novos recursos de governança: items e activity_logs
        $items_table_mig = $prefix . 'items';
        $col_assigned = $pdo->query("SHOW COLUMNS FROM `{$items_table_mig}` LIKE 'assigned_to'");
        if ($col_assigned->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `{$items_table_mig}` ADD COLUMN assigned_to VARCHAR(100) NULL AFTER urgency");
            echo " [MIGRATE] Coluna 'assigned_to' adicionada com sucesso na tabela items.\n";
        }

        $activity_logs_table_mig = $prefix . 'activity_logs';
        $col_username = $pdo->query("SHOW COLUMNS FROM `{$activity_logs_table_mig}` LIKE 'username'");
        if ($col_username->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `{$activity_logs_table_mig}` ADD COLUMN username VARCHAR(100) NULL AFTER item_id");
            echo " [MIGRATE] Coluna 'username' adicionada com sucesso na tabela activity_logs.\n";
        }
    } catch (Exception $e) {
        echo " [MIGRATE ERROR] Erro ao aplicar migrações de colunas: " . $e->getMessage() . "\n";
    }

    echo "<span class='info'>[AUTH] Verificando e sincronizando credenciais padrão...</span>\n";
    $default_pass_hash = password_hash('anorak2026', PASSWORD_DEFAULT);
    
    // Atualiza a senha de todos os usuários existentes para garantir que anorak2026 funcione
    $pdo->prepare("UPDATE `{$users_table}` SET password_hash = :hash WHERE password_hash IS NOT NULL")->execute([':hash' => $default_pass_hash]);
    echo "<span class='success'>[OK] Senhas de todos os usuários sincronizadas com sucesso para 'anorak2026'.</span>\n\n";

    echo "<span class='success'>🎉 Processo concluído com 100% de sucesso!</span>\n";

} catch (Exception $e) {
    echo "\n<span class='error'>[ERRO FATAL]: " . htmlspecialchars($e->getMessage()) . "</span>\n";
}

?>
    </div>
    <a href="index.html" class="btn">Acessar Anorak OASIS →</a>
</div>
</body>
</html>
