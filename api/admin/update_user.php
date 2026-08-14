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
if (!$input || !isset($input['id'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'ID do usuário é obrigatório.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userId = (int) $input['id'];
$username = trim($input['username'] ?? '');
$email = trim($input['email'] ?? '');
$role = trim($input['role'] ?? 'user');
$plan = trim($input['plan'] ?? 'explorer');
$planStatus = trim($input['plan_status'] ?? 'active');
$planExpiresAt = !empty($input['plan_expires_at']) ? $input['plan_expires_at'] : null;

// Impede que o próprio admin logado remova seu acesso de admin ou suspenda sua própria conta
if ($userId === (int) $_SESSION['anorak_user_id']) {
    if ($role !== 'admin') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Você não pode revogar seus próprios privilégios de administrador.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($planStatus !== 'active') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Você não pode suspender ou expirar sua própria conta.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $users_table = $prefix . 'users';

    // Se fornecidos email e username, verifica se já existem em outra conta
    if ($username !== '' || $email !== '') {
        $stmt_check = $pdo->prepare("SELECT id, username, email FROM `{$users_table}` WHERE (username = :u OR email = :e) AND id != :id LIMIT 1");
        $stmt_check->execute([':u' => $username, ':e' => $email, ':id' => $userId]);
        $existing = $stmt_check->fetch();
        if ($existing) {
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'Nome de usuário ou e-mail já estão em uso por outra conta.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // Formata plan_expires_at para MySQL se não for null
    $formattedExpires = null;
    if ($planExpiresAt) {
        $formattedExpires = date('Y-m-d H:i:s', strtotime($planExpiresAt));
    }

    $stmt_update = $pdo->prepare("
        UPDATE `{$users_table}`
        SET username = :username,
            email = :email,
            role = :role,
            plan = :plan,
            plan_status = :status,
            plan_expires_at = :expires,
            updated_at = NOW()
        WHERE id = :id
    ");

    $stmt_update->execute([
        ':username' => $username,
        ':email' => $email,
        ':role' => $role,
        ':plan' => $plan,
        ':status' => $planStatus,
        ':expires' => $formattedExpires,
        ':id' => $userId
    ]);

    // Grava log de atividade
    try {
        $logs_table = $prefix . 'activity_logs';
        $admin_username = $_SESSION['anorak_username'] ?? 'admin';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $details = json_encode([
            'updated_user_id' => $userId,
            'updated_username' => $username,
            'plan' => $plan,
            'status' => $planStatus,
            'role' => $role
        ], JSON_UNESCAPED_UNICODE);
        
        $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (username, action, details, ip_address, created_at) VALUES (:admin, 'user_updated', :details, :ip, NOW())");
        $log_stmt->execute([':admin' => $admin_username, ':details' => $details, ':ip' => $ip]);
    } catch (Exception $logEx) {}

    echo json_encode(['status' => 'success', 'message' => 'Configurações de conta salvas com sucesso!'], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao atualizar usuário: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
