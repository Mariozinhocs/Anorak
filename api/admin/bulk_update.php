<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// Verifica privilégios de Admin
if (!isset($_SESSION['anorak_user_id']) || $_SESSION['anorak_role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Acesso negado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || !isset($input['ids']) || !is_array($input['ids']) || empty($input['ids'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'IDs dos usuários selecionados são obrigatórios.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Higieniza os IDs
$userIds = array_map('intval', $input['ids']);
$currentUserId = (int) $_SESSION['anorak_user_id'];

// Remove o próprio ID logado para evitar auto-bloqueio, auto-suspensão ou auto-deleção
$userIds = array_filter($userIds, function($id) use ($currentUserId) {
    return $id !== $currentUserId;
});

if (empty($userIds)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A operação em lote não pôde ser concluída porque continha apenas a sua própria conta ativa.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$plan = isset($input['plan']) ? trim($input['plan']) : '';
$planStatus = isset($input['plan_status']) ? trim($input['plan_status']) : '';
$role = isset($input['role']) ? trim($input['role']) : '';
$expiresOption = isset($input['expires_option']) ? trim($input['expires_option']) : 'keep'; // keep, permanent, set
$expiresAt = !empty($input['plan_expires_at']) ? $input['plan_expires_at'] : null;
$action = isset($input['action']) ? trim($input['action']) : ''; // delete, restore, hard_delete

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $prefix . 'users';

    $inQuery = implode(',', array_fill(0, count($userIds), '?'));

    if ($action !== '') {
        // Exclusão, Restauração ou Exclusão definitiva em lote
        if ($action === 'delete') {
            $stmt = $pdo->prepare("UPDATE `{$users_table}` SET deleted_at = NOW() WHERE id IN ({$inQuery})");
            $stmt->execute($userIds);
            $msg = "Usuários enviados para a lixeira com sucesso!";
        } elseif ($action === 'restore') {
            $stmt = $pdo->prepare("UPDATE `{$users_table}` SET deleted_at = NULL WHERE id IN ({$inQuery})");
            $stmt->execute($userIds);
            $msg = "Usuários restaurados com sucesso!";
        } elseif ($action === 'hard_delete') {
            $stmt = $pdo->prepare("DELETE FROM `{$users_table}` WHERE id IN ({$inQuery})");
            $stmt->execute($userIds);
            $msg = "Usuários excluídos permanentemente do sistema!";
        } else {
            throw new Exception("Ação em lote inválida.");
        }
    } else {
        // Atualização de campos (Plano, Status, Role, Expiração)
        $setClauses = [];
        $params = [];

        if ($plan !== '') {
            $setClauses[] = "plan = ?";
            $params[] = $plan;
        }

        if ($planStatus !== '') {
            $setClauses[] = "plan_status = ?";
            $params[] = $planStatus;
        }

        if ($role !== '') {
            $setClauses[] = "role = ?";
            $params[] = $role;
        }

        if ($expiresOption === 'permanent') {
            $setClauses[] = "plan_expires_at = NULL";
        } elseif ($expiresOption === 'set' && $expiresAt) {
            $setClauses[] = "plan_expires_at = ?";
            $params[] = date('Y-m-d H:i:s', strtotime($expiresAt));
        }

        if (empty($setClauses)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Nenhuma alteração foi especificada para a operação em lote.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $setClauses[] = "updated_at = NOW()";
        $setSql = implode(', ', $setClauses);

        // Junta os parâmetros da cláusula SET com os IDs do IN
        $finalParams = array_merge($params, $userIds);

        $sql = "UPDATE `{$users_table}` SET {$setSql} WHERE id IN ({$inQuery})";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($finalParams);
        $msg = "Alterações salvas com sucesso em lote para os usuários selecionados!";
    }

    // Grava log de atividade
    try {
        $logs_table = $prefix . 'activity_logs';
        $admin_username = $_SESSION['anorak_username'] ?? 'admin';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $details = json_encode([
            'count' => count($userIds),
            'target_ids' => array_values($userIds),
            'action' => $action ?: 'update',
            'plan' => $plan,
            'status' => $planStatus
        ], JSON_UNESCAPED_UNICODE);
        
        $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (username, action, details, ip_address, created_at) VALUES (:admin, 'bulk_user_action', :details, :ip, NOW())");
        $log_stmt->execute([':admin' => $admin_username, ':details' => $details, ':ip' => $ip]);
    } catch (Exception $logEx) {}

    echo json_encode(['status' => 'success', 'message' => $msg], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro na operação em lote: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
