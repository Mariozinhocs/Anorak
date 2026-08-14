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
if (!$input || !isset($input['id']) || !isset($input['password'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'ID do usuário e nova senha são obrigatórios.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userId = (int) $input['id'];
$password = trim($input['password']);

if (strlen($password) < 4) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A senha deve conter pelo menos 4 caracteres.'], JSON_UNESCAPED_UNICODE);
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

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt_update = $pdo->prepare("UPDATE `{$users_table}` SET password_hash = :hash, updated_at = NOW() WHERE id = :id");
    $stmt_update->execute([':hash' => $hash, ':id' => $userId]);

    // Grava log de atividade
    try {
        $logs_table = $prefix . 'activity_logs';
        $admin_username = $_SESSION['anorak_username'] ?? 'admin';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $details = json_encode([
            'target_user_id' => $userId,
            'target_username' => $targetUsername
        ], JSON_UNESCAPED_UNICODE);
        
        $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (username, action, details, ip_address, created_at) VALUES (:admin, 'user_password_reset', :details, :ip, NOW())");
        $log_stmt->execute([':admin' => $admin_username, ':details' => $details, ':ip' => $ip]);
    } catch (Exception $logEx) {}

    echo json_encode(['status' => 'success', 'message' => 'Senha redefinida com sucesso!'], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao redefinir a senha: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
