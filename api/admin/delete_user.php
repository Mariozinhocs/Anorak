<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// Verifica privilégios de Admin
if (!isset($_SESSION['anorak_user_id']) || $_SESSION['anorak_role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Acesso negado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$action = isset($_GET['action']) ? trim($_GET['action']) : 'delete'; // delete, restore, hard_delete

if ($userId <= 0) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'ID do usuário é obrigatório.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Impede autodeleção
if ($userId === (int) $_SESSION['anorak_user_id']) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Você não pode excluir sua própria conta administrativa.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $prefix . 'users';

    // Recupera o nome de usuário do alvo para fins de log
    $stmt_get = $pdo->prepare("SELECT username FROM `{$users_table}` WHERE id = :id LIMIT 1");
    $stmt_get->execute([':id' => $userId]);
    $targetUser = $stmt_get->fetch();
    $targetUsername = $targetUser ? $targetUser['username'] : 'desconhecido';

    $message = '';
    if ($action === 'restore') {
        $stmt = $pdo->prepare("UPDATE `{$users_table}` SET deleted_at = NULL WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $message = 'Conta do usuário restaurada com sucesso!';
    } elseif ($action === 'hard_delete') {
        $stmt = $pdo->prepare("DELETE FROM `{$users_table}` WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $message = 'Conta do usuário excluída definitivamente do sistema!';
    } else { // soft delete
        $stmt = $pdo->prepare("UPDATE `{$users_table}` SET deleted_at = NOW() WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $message = 'Conta do usuário enviada para a lixeira!';
    }

    // Grava log de atividade
    try {
        $logs_table = $prefix . 'activity_logs';
        $admin_username = $_SESSION['anorak_username'] ?? 'admin';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $details = json_encode([
            'target_user_id' => $userId,
            'target_username' => $targetUsername,
            'action' => $action
        ], JSON_UNESCAPED_UNICODE);
        
        $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (username, action, details, ip_address, created_at) VALUES (:admin, :action_log, :details, :ip, NOW())");
        $log_stmt->execute([':admin' => $admin_username, ':action_log' => 'user_deleted_' . $action, ':details' => $details, ':ip' => $ip]);
    } catch (Exception $logEx) {}

    echo json_encode(['status' => 'success', 'message' => $message], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao processar exclusão/restauração: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
