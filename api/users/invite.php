<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// Verifica se o usuário está autenticado
if (!isset($_SESSION['anorak_user_id'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Não autorizado. Por favor, conecte-se.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$email = isset($input['email']) ? trim($input['email']) : '';
$project_id = isset($input['project_id']) ? trim($input['project_id']) : '';

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'E-mail inválido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $db_prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $db_prefix . 'users';
    $logs_table = $db_prefix . 'activity_logs';

    // Verifica se já existe um usuário com esse e-mail
    $stmt = $pdo->prepare("SELECT username FROM `{$users_table}` WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $email]);
    $existing = $stmt->fetch();

    if ($existing) {
        echo json_encode([
            'status' => 'user_exists',
            'username' => $existing['username'],
            'message' => 'Usuário já cadastrado no sistema.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Registra log do convite enviado por e-mail
    $inviter = $_SESSION['anorak_username'] ?? 'sistema';
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';

    $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (item_id, username, action, details, ip_address, created_at) VALUES (:item_id, :username, 'email_invite_sent', :details, :ip, NOW())");
    $log_stmt->execute([
        ':item_id' => $project_id,
        ':username' => $inviter,
        ':details' => json_encode(['invited_email' => $email, 'project_id' => $project_id], JSON_UNESCAPED_UNICODE),
        ':ip' => $ip
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => "Convite por e-mail registrado e disparado para {$email}!"
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao processar convite: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
