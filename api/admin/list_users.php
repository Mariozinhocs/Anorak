<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// 1. Verifica autenticação e privilégios de Admin
if (!isset($_SESSION['anorak_user_id']) || $_SESSION['anorak_role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Acesso negado. Privilégios de administrador requeridos.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $prefix . 'users';
    $items_table = $prefix . 'items';

    // Parâmetros de Filtros e Busca
    $search = trim($_GET['search'] ?? '');
    $plan = trim($_GET['plan'] ?? '');
    $status = trim($_GET['status'] ?? '');

    $whereClauses = [];
    $params = [];

    // Por padrão, esconde usuários excluídos logicamente, a menos que o filtro status seja 'deleted'
    if ($status === 'deleted') {
        $whereClauses[] = "deleted_at IS NOT NULL";
    } else {
        $whereClauses[] = "deleted_at IS NULL";
        if ($status !== '') {
            $whereClauses[] = "plan_status = :status";
            $params[':status'] = $status;
        }
    }

    if ($plan !== '') {
        $whereClauses[] = "plan = :plan";
        $params[':plan'] = $plan;
    }

    if ($search !== '') {
        $whereClauses[] = "(username LIKE :search OR email LIKE :search)";
        $params[':search'] = '%' . $search . '%';
    }

    $whereSql = "";
    if (count($whereClauses) > 0) {
        $whereSql = "WHERE " . implode(" AND ", $whereClauses);
    }

    // Consulta para listar usuários com contagem de projetos atribuídos
    $sql = "
        SELECT u.id, u.username, u.email, u.role, u.plan, u.plan_status, u.plan_expires_at, u.billing_cycle, u.created_at, u.deleted_at,
               (SELECT COUNT(*) FROM `{$items_table}` WHERE assigned_to = u.username AND type = 'project') as projects_count,
               (SELECT COUNT(*) FROM `{$items_table}` WHERE assigned_to = u.username AND type = 'idea') as ideas_count
        FROM `{$users_table}` u
        {$whereSql}
        ORDER BY u.created_at DESC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $users = $stmt->fetchAll();

    // Formata datas para ISO 8601
    foreach ($users as &$user) {
        if ($user['plan_expires_at']) {
            $user['plan_expires_at'] = date('c', strtotime($user['plan_expires_at']));
        }
        $user['created_at'] = date('c', strtotime($user['created_at']));
        if ($user['deleted_at']) {
            $user['deleted_at'] = date('c', strtotime($user['deleted_at']));
        }
        $user['projects_count'] = (int) $user['projects_count'];
        $user['ideas_count'] = (int) $user['ideas_count'];
    }

    echo json_encode([
        'status' => 'success',
        'data' => $users
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao listar usuários: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
