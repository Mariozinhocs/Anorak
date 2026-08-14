<?php
// Anorak Project Hub - Mercado Pago Pix Payment Generator
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
$email = isset($data['email']) ? filter_var(trim($data['email']), FILTER_VALIDATE_EMAIL) : null;
$username = isset($data['username']) ? trim($data['username']) : null;

if (!$email) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'E-mail válido é obrigatório para gerar o Pix.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Mapeamento de Valores dos Planos
$planPrices = [
    'creator' => 49.00,
    'master' => 119.00,
    'legend' => 199.00
];

if (!isset($planPrices[$plan])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Plano inválido selecionado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$amount = $planPrices[$plan];
$mpAccessToken = getenv('MERCADOPAGO_ACCESS_TOKEN');

if (!$mpAccessToken) {
    // Se o Access Token ainda não foi configurado no .env, retorna estrutura de pré-produção simulada
    $simulatedTxId = 'MP_SIM_' . time() . '_' . rand(1000, 9999);
    echo json_encode([
        'status' => 'success',
        'mode' => 'simulated',
        'message' => 'Mercado Pago em modo de configuração. Insira o MERCADOPAGO_ACCESS_TOKEN no arquivo .env.',
        'data' => [
            'payment_id' => $simulatedTxId,
            'amount' => $amount,
            'plan' => $plan,
            'qr_code' => '00020126580014BR.GOV.BCB.PIX0136anorak-oasis-hub-key520400005303986540549.005802BR5922Hub Digital 360 Anorak6009SAO PAULO62070503***6304E2CA',
            'qr_code_base64' => '',
            'ticket_url' => '#'
        ]
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Chamada Real à API do Mercado Pago
$payload = [
    'transaction_amount' => $amount,
    'description' => "Assinatura Anorak OASIS Hub - Plano " . ucfirst($plan),
    'payment_method_id' => 'pix',
    'payer' => [
        'email' => $email,
        'first_name' => $username ?: 'Assinante Anorak'
    ],
    'notification_url' => (getenv('APP_URL') ?: 'http://anorak.hubdigital360.com') . '/api/payments/webhook.php'
];

$ch = curl_init('https://api.mercadopago.com/v1/payments');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $mpAccessToken,
    'X-Idempotency-Key: ' . uniqid('anorak_pix_', true)
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$resData = json_decode($response, true);

if ($httpCode === 201 && isset($resData['point_of_interaction']['transaction_data'])) {
    $txData = $resData['point_of_interaction']['transaction_data'];
    
    // Registra intenção de pagamento pendente no banco local
    try {
        $pdo = getDatabaseConnection();
        $dbPrefix = $GLOBALS['db_prefix'] ?? '';
        
        // Busca ID do usuário se já cadastrado
        $stmtUser = $pdo->prepare("SELECT id FROM `{$dbPrefix}users` WHERE email = ? LIMIT 1");
        $stmtUser->execute([$email]);
        $user = $stmtUser->fetch();
        $userId = $user ? $user['id'] : null;

        if ($userId) {
            $stmtIns = $pdo->prepare("INSERT INTO `{$dbPrefix}payments` (user_id, amount, currency, plan, status, payment_method, transaction_id) VALUES (?, ?, 'BRL', ?, 'pending', 'pix', ?)");
            $stmtIns->execute([$userId, $amount, $plan, (string)$resData['id']]);
        }
    } catch (Exception $e) {
        // Log passivo se houver erro ao registrar pendente
    }

    echo json_encode([
        'status' => 'success',
        'mode' => 'live',
        'data' => [
            'payment_id' => $resData['id'],
            'amount' => $amount,
            'plan' => $plan,
            'qr_code' => $txData['qr_code'],
            'qr_code_base64' => $txData['qr_code_base64'] ?? '',
            'ticket_url' => $txData['ticket_url'] ?? '#'
        ]
    ], JSON_UNESCAPED_UNICODE);
} else {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $resData['message'] ?? 'Falha ao comunicar com o Mercado Pago.'
    ], JSON_UNESCAPED_UNICODE);
}
