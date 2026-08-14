<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// Verifica privilégios de Admin
if (!isset($_SESSION['anorak_user_id']) || $_SESSION['anorak_role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Acesso negado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $payments_table = $prefix . 'payments';
    $users_table = $prefix . 'users';

    $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;

    $whereClause = "";
    $params = [];
    if ($userId > 0) {
        $whereClause = "WHERE p.user_id = :user_id";
        $params[':user_id'] = $userId;
    }

    $sql = "
        SELECT p.id, p.user_id, p.amount, p.currency, p.plan, p.status, p.payment_method, p.transaction_id, p.created_at,
               u.username, u.email
        FROM `{$payments_table}` p
        INNER JOIN `{$users_table}` u ON p.user_id = u.id
        {$whereClause}
        ORDER BY p.created_at DESC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $payments = $stmt->fetchAll();

    foreach ($payments as &$payment) {
        $payment['amount'] = (float) $payment['amount'];
        $payment['created_at'] = date('c', strtotime($payment['created_at']));
    }

    echo json_encode([
        'status' => 'success',
        'data' => $payments
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao listar pagamentos: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
