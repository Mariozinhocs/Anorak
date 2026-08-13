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
                'id' => 'proj_360_studio',
                'type' => 'project',
                'title' => '360 Studio',
                'description' => 'Plataforma imersiva de passeios virtuais 360°, gerenciamento de hotspots, plantas baixas e painel administrativo.',
                'status' => 'homologacao',
                'priority' => 'alta',
                'impact' => 'alto',
                'urgency' => 'alta',
                'tags_json' => json_encode(['Passeio Virtual', '360', 'Hostinger', 'PHP/JS']),
                'context_links_json' => json_encode([
                    'driveFolder' => 'https://drive.google.com/drive/folders/360-studio',
                    'githubRepo' => 'https://github.com/Mariozinhocs/360-studio.git',
                    'liveUrl' => 'https://hubdigital360.com'
                ]),
                'tasks_json' => json_encode([
                    ['id' => 't_360_1', 'title' => 'Integração e limpeza de arquivos órfãos (clean_orphans.php)', 'category' => 'Backend', 'completed' => true, 'validatedAt' => '2026-08-10T14:30:00Z'],
                    ['id' => 't_360_2', 'title' => 'Refatoração da autenticação e admin_helper.php', 'category' => 'Segurança', 'completed' => true, 'validatedAt' => '2026-08-11T18:00:00Z'],
                    ['id' => 't_360_3', 'title' => 'Homologação do visualizador 360 e transição de cenas', 'category' => 'Frontend', 'completed' => true, 'validatedAt' => '2026-08-12T10:15:00Z'],
                    ['id' => 't_360_4', 'title' => 'Validação final de upload no Hostinger & Teste de Carga', 'category' => 'Deploy', 'completed' => false],
                    ['id' => 't_360_5', 'title' => 'Aceite de usabilidade em dispositivos móveis', 'category' => 'QA', 'completed' => false]
                ]),
                'validation_history_json' => json_encode([
                    ['timestamp' => '2026-08-12T23:00:00Z', 'action' => 'Ambiente HML Configurado', 'taskTitle' => 'Homologação', 'taskId' => 'init']
                ])
            ],
            [
                'id' => 'proj_anorak_core',
                'type' => 'project',
                'title' => 'Anorak - OASIS Project Hub',
                'description' => 'Sistema inteligente de gestão modular de projetos em homologação, repositório de ideias e matriz de decisão.',
                'status' => 'homologacao',
                'priority' => 'alta',
                'impact' => 'alto',
                'urgency' => 'alta',
                'tags_json' => json_encode(['Gestão', 'Incubadora', 'OASIS', 'Ready Player One']),
                'context_links_json' => json_encode([
                    'driveFolder' => 'https://drive.google.com/drive/folders/anorak',
                    'githubRepo' => 'https://github.com/Mariozinhocs/Anorak.git',
                    'liveUrl' => 'https://anorak.hubdigital360.com'
                ]),
                'tasks_json' => json_encode([
                    ['id' => 't_ano_1', 'title' => 'Arquitetura de dados orientada a Entidades e Atributos', 'category' => 'Arquitetura', 'completed' => true, 'validatedAt' => '2026-08-12T23:00:00Z'],
                    ['id' => 't_ano_2', 'title' => 'Dashboard Dual Mode: Operacional & Incubadora', 'category' => 'Frontend', 'completed' => true, 'validatedAt' => '2026-08-12T23:45:00Z'],
                    ['id' => 't_ano_3', 'title' => 'Checklists interativos com gatilhos e Chaves de Halliday', 'category' => 'Lógica', 'completed' => true, 'validatedAt' => '2026-08-12T23:50:00Z'],
                    ['id' => 't_ano_4', 'title' => 'Captura de ideias por voz (Web Speech) e Matriz de Decisão', 'category' => 'Inteligência', 'completed' => false],
                    ['id' => 't_ano_5', 'title' => 'Deploy no Hostinger (anorak.hubdigital360.com)', 'category' => 'Deploy', 'completed' => false]
                ]),
                'validation_history_json' => json_encode([])
            ],
            [
                'id' => 'proj_hub_connect',
                'type' => 'project',
                'title' => 'Hub Digital Connect',
                'description' => 'Módulo de automação de propostas, integrações com WhatsApp API e portal do cliente para serviços digitais.',
                'status' => 'homologacao',
                'priority' => 'media',
                'impact' => 'alto',
                'urgency' => 'media',
                'tags_json' => json_encode(['Automação', 'CRM', 'API']),
                'context_links_json' => json_encode([
                    'driveFolder' => 'https://drive.google.com/drive/folders/hub-connect',
                    'githubRepo' => 'https://github.com/Mariozinhocs/hub-connect.git',
                    'liveUrl' => ''
                ]),
                'tasks_json' => json_encode([
                    ['id' => 't_hub_1', 'title' => 'Estruturação do fluxo de propostas automáticas', 'category' => 'Planejamento', 'completed' => true, 'validatedAt' => '2026-08-05T11:00:00Z'],
                    ['id' => 't_hub_2', 'title' => 'Validação de webhooks de pagamento', 'category' => 'Integração', 'completed' => false],
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

    // Verificar e criar usuário admin inicial (mariozinhocs)
    $users_table = $prefix . 'users';
    echo "<span class='info'>[AUTH] Verificando usuário administrador padrão...</span>\n";
    $user_check = $pdo->prepare("SELECT id, username FROM `{$users_table}` WHERE username = :u LIMIT 1");
    $user_check->execute([':u' => 'mariozinhocs']);
    $existing_user = $user_check->fetch();

    if (!$existing_user) {
        $default_pass_hash = password_hash('anorak2026', PASSWORD_DEFAULT);
        $user_insert = $pdo->prepare("
            INSERT INTO `{$users_table}` 
            (username, email, password_hash, role, timezone, created_at, updated_at) 
            VALUES 
            (:u, :e, :p, 'admin', 'America/Sao_Paulo', NOW(), NOW())
        ");
        $user_insert->execute([
            ':u' => 'mariozinhocs',
            ':e' => 'mario@hubdigital360.com',
            ':p' => $default_pass_hash
        ]);
        echo "<span class='success'>[OK] Usuário Admin criado com sucesso: 'mariozinhocs' (Senha inicial: 'anorak2026')</span>\n\n";
    } else {
        echo "<span class='info'>[INFO] Usuário Admin 'mariozinhocs' já existe.</span>\n\n";
    }

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
