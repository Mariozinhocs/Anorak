<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Método não permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$token = trim($data['token'] ?? '');
$newPassword = trim($data['password'] ?? '');

if (empty($token) || empty($newPassword)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Token e nova senha são obrigatórios.'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (strlen($newPassword) < 4) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A senha deve ter no mínimo 4 caracteres.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $users_table = $db_prefix . 'users';

    // Buscar usuário por token e validar expiração UTC
    $stmt = $pdo->prepare("
        SELECT id, username, email 
        FROM `{$users_table}` 
        WHERE password_reset_token = :token 
          AND password_reset_expires >= UTC_TIMESTAMP() 
          AND deleted_at IS NULL 
        LIMIT 1
    ");
    $stmt->execute([':token' => $token]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Token de recuperação inválido ou expirado. Solicite uma nova redefinição.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Atualizar senha e invalidar token
    $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
    $stmtUpdate = $pdo->prepare("
        UPDATE `{$users_table}` 
        SET password_hash = :hash, 
            password_reset_token = NULL, 
            password_reset_expires = NULL, 
            updated_at = NOW() 
        WHERE id = :id
    ");
    $stmtUpdate->execute([
        ':hash' => $newHash,
        ':id' => $user['id']
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Senha alterada com sucesso! Você já pode entrar com sua nova senha.'
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao redefinir senha: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
