<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// Verifica privilégios de Admin
if (!isset($_SESSION['anorak_user_id']) || $_SESSION['anorak_role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Acesso negado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $prefix . 'users';
    $payments_table = $prefix . 'payments';
    $items_table = $prefix . 'items';

    // 1. Contagem de usuários por plano (apenas não excluídos logicamente)
    $plan_counts = $pdo->query("
        SELECT plan, COUNT(*) as count 
        FROM `{$users_table}` 
        WHERE deleted_at IS NULL 
        GROUP BY plan
    ")->fetchAll();

    $plans = ['explorer' => 0, 'creator' => 0, 'master' => 0, 'legend' => 0];
    foreach ($plan_counts as $row) {
        if (isset($row['plan'])) {
            $plans[$row['plan']] = (int) $row['count'];
        }
    }

    // 2. Contagem de usuários por status de plano
    $status_counts = $pdo->query("
        SELECT plan_status, COUNT(*) as count 
        FROM `{$users_table}` 
        WHERE deleted_at IS NULL 
        GROUP BY plan_status
    ")->fetchAll();

    $statuses = ['active' => 0, 'suspended' => 0, 'expired' => 0];
    foreach ($status_counts as $row) {
        $statusKey = $row['plan_status'];
        if (array_key_exists($statusKey, $statuses)) {
            $statuses[$statusKey] = (int) $row['count'];
        }
    }

    // 3. Contagem total de usuários ativos
    $total_users = (int) $pdo->query("SELECT COUNT(*) FROM `{$users_table}` WHERE deleted_at IS NULL")->fetchColumn();

    // 4. Calcular MRR Estimado (Mensal Recorrente)
    // Creator = R$ 49.00/mês
    // Master = R$ 119.00/mês
    // Legend = R$ 199.00/mês
    // Apenas contas ativas e sem expiração pendente ou cuja expiração é futura
    $mrr_stmt = $pdo->query("
        SELECT plan, COUNT(*) as count
        FROM `{$users_table}`
        WHERE deleted_at IS NULL
          AND plan_status = 'active'
          AND (plan_expires_at IS NULL OR plan_expires_at > UTC_TIMESTAMP())
        GROUP BY plan
    ");
    $mrr_rows = $mrr_stmt->fetchAll();
    
    $mrr = 0.0;
    foreach ($mrr_rows as $row) {
        if ($row['plan'] === 'creator') {
            $mrr += $row['count'] * 49.00;
        } elseif ($row['plan'] === 'master') {
            $mrr += $row['count'] * 119.00;
        } elseif ($row['plan'] === 'legend') {
            $mrr += $row['count'] * 199.00;
        }
    }

    // 5. Volume Total de Vendas (Pagamentos Completados)
    $sales_volume = 0.0;
    try {
        $sales_volume = (float) $pdo->query("
            SELECT SUM(amount) 
            FROM `{$payments_table}` 
            WHERE status = 'completed'
        ")->fetchColumn();
    } catch (Exception $e) {
        // Ignora se tabela payments não estiver 100% pronta
    }

    // 6. Contagem de Tours (Projetos) e Cenas (Tarefas) globais
    $total_projects = (int) $pdo->query("SELECT COUNT(*) FROM `{$items_table}` WHERE type = 'project'")->fetchColumn();
    $total_ideas = (int) $pdo->query("SELECT COUNT(*) FROM `{$items_table}` WHERE type = 'idea'")->fetchColumn();

    echo json_encode([
        'status' => 'success',
        'data' => [
            'total_users' => $total_users,
            'plans' => $plans,
            'statuses' => $statuses,
            'mrr' => $mrr,
            'sales_volume' => $sales_volume,
            'assets' => [
                'projects' => $total_projects,
                'ideas' => $total_ideas
            ]
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao obter estatísticas: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
