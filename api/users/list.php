<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// Verifica se o usuário está autenticado
if (!isset($_SESSION['anorak_user_id'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Não autorizado. Por favor, conecte-se.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $db_prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $db_prefix . 'users';

    // Seleciona todos os usuários ativos
    $stmt = $pdo->query("SELECT id, username, email, role FROM `{$users_table}` WHERE deleted_at IS NULL ORDER BY username ASC");
    $users = $stmt->fetchAll();

    echo json_encode([
        'status' => 'success',
        'data' => $users
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao listar usuários: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
