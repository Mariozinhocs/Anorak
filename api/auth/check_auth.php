<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

if (!isset($_SESSION['anorak_user_id'])) {
    http_response_code(401);
    echo json_encode([
        'status' => 'unauthenticated',
        'authenticated' => false,
        'message' => 'Nenhuma sessão ativa encontrada.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $db_prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $db_prefix . 'users';

    $stmt = $pdo->prepare("SELECT id, username, email, role, plan, plan_status, plan_expires_at, billing_cycle, timezone, deleted_at FROM `{$users_table}` WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $_SESSION['anorak_user_id']]);
    $user = $stmt->fetch();

    if (!$user || !empty($user['deleted_at'])) {
        // Invalida sessão se usuário foi excluído
        session_destroy();
        http_response_code(401);
        echo json_encode(['status' => 'unauthenticated', 'authenticated' => false, 'message' => 'Usuário inválido ou inativo.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'status' => 'success',
        'authenticated' => true,
        'user' => [
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'role' => $user['role'],
            'plan' => $user['plan'] ?? 'creator',
            'plan_status' => $user['plan_status'] ?? 'active',
            'plan_expires_at' => $user['plan_expires_at'] ?? null,
            'billing_cycle' => $user['billing_cycle'] ?? 'monthly',
            'timezone' => $user['timezone'] ?? 'America/Sao_Paulo'
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao verificar autenticação: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
