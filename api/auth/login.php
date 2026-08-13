<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Método não permitido'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$usernameOrEmail = trim($input['username'] ?? '');
$password = trim($input['password'] ?? '');

if (empty($usernameOrEmail) || empty($password)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Por favor, informe o usuário/e-mail e a senha.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $db_prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $db_prefix . 'users';

    $stmt = $pdo->prepare("
        SELECT id, username, email, password_hash, role, timezone, deleted_at 
        FROM `{$users_table}` 
        WHERE (username = :val1 OR email = :val2) 
        LIMIT 1
    ");
    $stmt->execute([
        ':val1' => $usernameOrEmail,
        ':val2' => $usernameOrEmail
    ]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Credenciais incorretas ou usuário não encontrado.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!empty($user['deleted_at'])) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Esta conta foi desativada.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Credenciais incorretas ou senha inválida.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Cria sessão do usuário
    $_SESSION['anorak_user_id'] = $user['id'];
    $_SESSION['anorak_username'] = $user['username'];
    $_SESSION['anorak_email'] = $user['email'];
    $_SESSION['anorak_role'] = $user['role'];

    // Registrar log de login
    try {
        $logs_table = $db_prefix . 'activity_logs';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (action, details, ip_address, created_at) VALUES ('user_login', :details, :ip, NOW())");
        $log_stmt->execute([
            ':details' => json_encode(['username' => $user['username'], 'user_id' => $user['id']]),
            ':ip' => $ip
        ]);
    } catch (Exception $e) {
        // Log silencioso se falhar
    }

    echo json_encode([
        'status' => 'success',
        'message' => 'Autenticado com sucesso!',
        'user' => [
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'role' => $user['role'],
            'timezone' => $user['timezone'] ?? 'America/Sao_Paulo'
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro interno ao autenticar: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
