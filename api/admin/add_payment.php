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
if (!$input || !isset($input['user_id']) || !isset($input['amount']) || !isset($input['plan'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Usuário, valor e plano são campos obrigatórios.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userId = (int) $input['user_id'];
$amount = (float) $input['amount'];
$plan = trim($input['plan']);
$paymentMethod = trim($input['payment_method'] ?? 'manual');
$transactionId = trim($input['transaction_id'] ?? '');
$status = trim($input['status'] ?? 'completed');
$durationDays = isset($input['duration_days']) ? (int)$input['duration_days'] : 30; // Padrão: 30 dias

if ($transactionId === '') {
    $transactionId = 'PAY_' . strtoupper(bin2hex(random_bytes(8)));
}

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $payments_table = $prefix . 'payments';
    $users_table = $prefix . 'users';

    // Inicia uma transação no banco de dados para garantir consistência
    $pdo->beginTransaction();

    // 1. Verifica se o usuário existe
    $stmt_check = $pdo->prepare("SELECT username, email FROM `{$users_table}` WHERE id = :id LIMIT 1");
    $stmt_check->execute([':id' => $userId]);
    $user = $stmt_check->fetch();
    if (!$user) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Usuário não encontrado.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 2. Insere a transação de pagamento
    $stmt_pay = $pdo->prepare("
        INSERT INTO `{$payments_table}` (user_id, amount, currency, plan, status, payment_method, transaction_id, created_at, updated_at)
        VALUES (:user_id, :amount, 'BRL', :plan, :status, :method, :trans_id, NOW(), NOW())
    ");
    $stmt_pay->execute([
        ':user_id' => $userId,
        ':amount' => $amount,
        ':plan' => $plan,
        ':status' => $status,
        ':method' => $paymentMethod,
        ':trans_id' => $transactionId
    ]);

    // 3. Se status do pagamento for completed, ativa o plano correspondente do usuário
    if ($status === 'completed') {
        $expiresAt = null;
        if ($durationDays > 0) {
            // Calcula data de expiração adicionando dias ao horário UTC atual
            $expiresAt = date('Y-m-d H:i:s', time() + ($durationDays * 86400));
        }

        $stmt_user = $pdo->prepare("
            UPDATE `{$users_table}`
            SET plan = :plan,
                plan_status = 'active',
                plan_expires_at = :expires,
                updated_at = NOW()
            WHERE id = :id
        ");
        $stmt_user->execute([
            ':plan' => $plan,
            ':expires' => $expiresAt,
            ':id' => $userId
        ]);
    }

    $pdo->commit();

    // Grava log de atividade
    try {
        $logs_table = $prefix . 'activity_logs';
        $admin_username = $_SESSION['anorak_username'] ?? 'admin';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $details = json_encode([
            'pay_user_id' => $userId,
            'pay_username' => $user['username'],
            'amount' => $amount,
            'plan' => $plan,
            'transaction_id' => $transactionId,
            'status' => $status
        ], JSON_UNESCAPED_UNICODE);
        
        $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (username, action, details, ip_address, created_at) VALUES (:admin, 'payment_registered', :details, :ip, NOW())");
        $log_stmt->execute([':admin' => $admin_username, ':details' => $details, ':ip' => $ip]);
    } catch (Exception $logEx) {}

    echo json_encode([
        'status' => 'success',
        'message' => 'Pagamento registrado com sucesso e plano ativado para o cliente!',
        'transaction_id' => $transactionId
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao registrar pagamento: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
