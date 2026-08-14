<?php
// Anorak Project Hub - Endpoint de Checagem de Status de Pagamento Pix
require_once __DIR__ . '/../config.php';

startAnorakSession();

$paymentId = $_GET['payment_id'] ?? $_POST['payment_id'] ?? null;

if (!$paymentId) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'ID do pagamento não informado.']);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $dbPrefix = $GLOBALS['db_prefix'] ?? '';

    $stmt = $pdo->prepare("SELECT status, plan, created_at FROM `{$dbPrefix}payments` WHERE transaction_id = ? LIMIT 1");
    $stmt->execute([$paymentId]);
    $payment = $stmt->fetch();

    if ($payment) {
        echo json_encode([
            'status' => 'success',
            'payment_status' => $payment['status'],
            'plan' => $payment['plan'],
            'approved' => ($payment['status'] === 'completed' || $payment['status'] === 'approved')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Se não encontrou no banco local mas tem Mercado Pago Token, faz fallback na API
    $mpAccessToken = getenv('MERCADOPAGO_ACCESS_TOKEN');
    if ($mpAccessToken && !str_contains($paymentId, 'SIM_')) {
        $ch = curl_init("https://api.mercadopago.com/v1/payments/{$paymentId}");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $mpAccessToken]);
        $res = curl_exec($ch);
        curl_close($ch);
        $data = json_decode($res, true);
        
        $mpStatus = $data['status'] ?? 'pending';
        echo json_encode([
            'status' => 'success',
            'payment_status' => $mpStatus,
            'approved' => ($mpStatus === 'approved')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'status' => 'success',
        'payment_status' => 'pending',
        'approved' => false
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
