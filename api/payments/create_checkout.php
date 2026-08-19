<?php
// Anorak Project Hub - Mercado Pago Unified Checkout Generator (Pix / Credit Card)
require_once __DIR__ . '/../config.php';

startAnorakSession();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Método não permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!$data) {
    $data = $_POST;
}

$plan = isset($data['plan']) ? strtolower(trim($data['plan'])) : 'creator';
$billing = isset($data['billing']) ? strtolower(trim($data['billing'])) : 'monthly';
$method = isset($data['method']) ? strtolower(trim($data['method'])) : 'pix';
$email = isset($data['email']) ? filter_var(trim($data['email']), FILTER_VALIDATE_EMAIL) : null;
$username = isset($data['username']) ? trim($data['username']) : null;

// Se não logado mas possui e-mail de sessão, aproveita
if (!$email && isset($_SESSION['anorak_email'])) {
    $email = $_SESSION['anorak_email'];
}
if (!$username && isset($_SESSION['anorak_username'])) {
    $username = $_SESSION['anorak_username'];
}

if (!$email) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'E-mail válido é obrigatório para gerar o pagamento.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Tabela de Preços (Mensal / Anual)
$prices = [
    'monthly' => [
        'creator' => 49.00,
        'master' => 119.00,
        'legend' => 199.00
    ],
    'annual' => [
        'creator' => 490.00,
        'master' => 1190.00,
        'legend' => 1990.00
    ]
];

if (!isset($prices[$billing]) || !isset($prices[$billing][$plan])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Plano ou ciclo de faturamento inválido selecionado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$amount = $prices[$billing][$plan];
$mpAccessToken = getenv('MERCADOPAGO_ACCESS_TOKEN');
$appUrl = getenv('APP_URL') ?: 'http://anorak.hubdigital360.com';

if (!$mpAccessToken) {
    // Modo Simulado
    $simulatedTxId = 'MP_SIM_' . time() . '_' . rand(1000, 9999);
    
    // Registra pendente no banco para testes
    try {
        $pdo = getDatabaseConnection();
        $dbPrefix = $GLOBALS['db_prefix'] ?? '';
        
        $stmtUser = $pdo->prepare("SELECT id FROM `{$dbPrefix}users` WHERE email = ? LIMIT 1");
        $stmtUser->execute([$email]);
        $user = $stmtUser->fetch();
        $userId = $user ? $user['id'] : null;

        if ($userId) {
            $stmtIns = $pdo->prepare("INSERT INTO `{$dbPrefix}payments` (user_id, amount, currency, plan, status, payment_method, transaction_id) VALUES (?, ?, 'BRL', ?, 'pending', ?, ?)");
            $stmtIns->execute([$userId, $amount, $plan, $method, $simulatedTxId]);
        }
    } catch (Exception $e) {
        // Ignora passivamente
    }

    if ($method === 'pix') {
        echo json_encode([
            'status' => 'success',
            'mode' => 'simulated',
            'message' => 'Mercado Pago em modo simulação. Insira o MERCADOPAGO_ACCESS_TOKEN no .env.',
            'data' => [
                'payment_id' => $simulatedTxId,
                'amount' => $amount,
                'plan' => $plan,
                'billing' => $billing,
                'qr_code' => '00020126580014BR.GOV.BCB.PIX0136anorak-oasis-hub-key520400005303986540549.005802BR5922Hub Digital 360 Anorak6009SAO PAULO62070503***6304E2CA',
                'qr_code_base64' => '',
                'ticket_url' => '#'
            ]
        ], JSON_UNESCAPED_UNICODE);
    } else {
        // Cartão de Crédito (Mock)
        echo json_encode([
            'status' => 'success',
            'mode' => 'simulated',
            'message' => 'Mercado Pago em modo simulação. Insira o MERCADOPAGO_ACCESS_TOKEN no .env.',
            'data' => [
                'payment_id' => $simulatedTxId,
                'amount' => $amount,
                'plan' => $plan,
                'billing' => $billing,
                'init_point' => $appUrl . '/app.html?payment_status=success&simulated_id=' . $simulatedTxId
            ]
        ], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// Integração Oficial Mercado Pago
if ($method === 'pix') {
    // 1. Geração de Pix via v1/payments
    $payload = [
        'transaction_amount' => $amount,
        'description' => "Assinatura Anorak OASIS - Plano " . ucfirst($plan) . " (" . ($billing === 'annual' ? 'Anual' : 'Mensal') . ")",
        'payment_method_id' => 'pix',
        'payer' => [
            'email' => $email,
            'first_name' => $username ?: 'Assinante Anorak'
        ],
        'notification_url' => $appUrl . '/api/payments/webhook.php'
    ];

    $ch = curl_init('https://api.mercadopago.com/v1/payments');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $mpAccessToken,
        'X-Idempotency-Key: ' . uniqid('anorak_checkout_pix_', true)
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $resData = json_decode($response, true);

    if ($httpCode === 201 && isset($resData['point_of_interaction']['transaction_data'])) {
        $txData = $resData['point_of_interaction']['transaction_data'];
        
        // Registra pendente no banco
        try {
            $pdo = getDatabaseConnection();
            $dbPrefix = $GLOBALS['db_prefix'] ?? '';
            
            $stmtUser = $pdo->prepare("SELECT id FROM `{$dbPrefix}users` WHERE email = ? LIMIT 1");
            $stmtUser->execute([$email]);
            $user = $stmtUser->fetch();
            $userId = $user ? $user['id'] : null;

            if ($userId) {
                $stmtIns = $pdo->prepare("INSERT INTO `{$dbPrefix}payments` (user_id, amount, currency, plan, status, payment_method, transaction_id) VALUES (?, ?, 'BRL', ?, 'pending', 'pix', ?)");
                $stmtIns->execute([$userId, $amount, $plan, (string)$resData['id']]);
            }
        } catch (Exception $e) {
            // Ignora
        }

        echo json_encode([
            'status' => 'success',
            'mode' => 'live',
            'data' => [
                'payment_id' => $resData['id'],
                'amount' => $amount,
                'plan' => $plan,
                'billing' => $billing,
                'qr_code' => $txData['qr_code'],
                'qr_code_base64' => $txData['qr_code_base64'] ?? '',
                'ticket_url' => $txData['ticket_url'] ?? '#'
            ]
        ], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => $resData['message'] ?? 'Falha ao gerar cobrança Pix via Mercado Pago.'
        ], JSON_UNESCAPED_UNICODE);
    }
} else {
    // 2. Geração de Assinatura Recorrente via preapproval
    $payload = [
        'reason' => 'Assinatura Anorak OASIS - Plano ' . ucfirst($plan) . ' (' . ($billing === 'annual' ? 'Anual' : 'Mensal') . ')',
        'auto_recurring' => [
            'frequency' => 1,
            'frequency_type' => $billing === 'annual' ? 'years' : 'months',
            'transaction_amount' => $amount,
            'currency_id' => 'BRL'
        ],
        'payer_email' => $email,
        'back_url' => $appUrl . '/app.html?payment_status=success',
        'status' => 'pending'
    ];

    $ch = curl_init('https://api.mercadopago.com/preapproval');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $mpAccessToken
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $resData = json_decode($response, true);

    if (($httpCode === 201 || $httpCode === 200) && isset($resData['init_point'])) {
        // Registra intenção de assinatura pendente no banco local
        try {
            $pdo = getDatabaseConnection();
            $dbPrefix = $GLOBALS['db_prefix'] ?? '';
            
            $stmtUser = $pdo->prepare("SELECT id FROM `{$dbPrefix}users` WHERE email = ? LIMIT 1");
            $stmtUser->execute([$email]);
            $user = $stmtUser->fetch();
            $userId = $user ? $user['id'] : null;

            if ($userId) {
                $stmtIns = $pdo->prepare("INSERT INTO `{$dbPrefix}payments` (user_id, amount, currency, plan, status, payment_method, transaction_id) VALUES (?, ?, 'BRL', ?, 'pending', 'credit_card', ?)");
                $stmtIns->execute([$userId, $amount, $plan, (string)$resData['id']]);
            }
        } catch (Exception $e) {
            // Ignora
        }

        echo json_encode([
            'status' => 'success',
            'mode' => 'live',
            'data' => [
                'payment_id' => $resData['id'],
                'amount' => $amount,
                'plan' => $plan,
                'billing' => $billing,
                'init_point' => $resData['init_point']
            ]
        ], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => $resData['message'] ?? 'Falha ao gerar link de assinatura com cartão.'
        ], JSON_UNESCAPED_UNICODE);
    }
}
