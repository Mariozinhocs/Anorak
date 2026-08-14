<?php
// Anorak Project Hub - Mercado Pago Webhook Notification Listener
require_once __DIR__ . '/../config.php';

// Mercado Pago envia notificações via POST ou GET query params
$id = $_GET['id'] ?? $_GET['data_id'] ?? null;
$type = $_GET['type'] ?? $_GET['topic'] ?? null;

if (!$id && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    if (isset($json['data']['id'])) {
        $id = $json['data']['id'];
    }
    if (isset($json['type'])) {
        $type = $json['type'];
    }
}

if (!$id) {
    http_response_code(200);
    echo json_encode(['status' => 'ignored', 'message' => 'Sem ID de pagamento.']);
    exit;
}

$mpAccessToken = getenv('MERCADOPAGO_ACCESS_TOKEN');

if (!$mpAccessToken) {
    http_response_code(200);
    echo json_encode(['status' => 'warning', 'message' => 'Mercado Pago Access Token ausente.']);
    exit;
}

// Consulta status real na API do Mercado Pago
$ch = curl_init("https://api.mercadopago.com/v1/payments/{$id}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $mpAccessToken
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200) {
    http_response_code(200);
    echo json_encode(['status' => 'error', 'message' => 'Não foi possível consultar transação no MP.']);
    exit;
}

$paymentInfo = json_decode($response, true);
$status = $paymentInfo['status'] ?? '';
$payerEmail = $paymentInfo['payer']['email'] ?? null;
$amount = $paymentInfo['transaction_amount'] ?? 0;
$txId = (string)($paymentInfo['id'] ?? $id);

if ($status === 'approved' && $payerEmail) {
    try {
        $pdo = getDatabaseConnection();
        $dbPrefix = $GLOBALS['db_prefix'] ?? '';

        // Identifica o plano com base no valor cobrado
        $plan = 'creator';
        if ($amount >= 100) {
            $plan = 'master';
        }
        if ($amount >= 180) {
            $plan = 'legend';
        }

        // 1. Atualiza Usuário no Banco
        $stmtUser = $pdo->prepare("UPDATE `{$dbPrefix}users` SET plan = ?, plan_status = 'active', plan_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE email = ?");
        $stmtUser->execute([$plan, $payerEmail]);

        // 2. Atualiza ou Insere Registro de Pagamento Concluído
        $stmtCheck = $pdo->prepare("SELECT id FROM `{$dbPrefix}payments` WHERE transaction_id = ? LIMIT 1");
        $stmtCheck->execute([$txId]);
        $existing = $stmtCheck->fetch();

        if ($existing) {
            $stmtUp = $pdo->prepare("UPDATE `{$dbPrefix}payments` SET status = 'completed', updated_at = NOW() WHERE transaction_id = ?");
            $stmtUp->execute([$txId]);
        } else {
            // Se o pagamento for direto e não tiver o user_id, descobre pelo e-mail
            $stmtU = $pdo->prepare("SELECT id FROM `{$dbPrefix}users` WHERE email = ? LIMIT 1");
            $stmtU->execute([$payerEmail]);
            $uRow = $stmtU->fetch();
            if ($uRow) {
                $stmtIns = $pdo->prepare("INSERT INTO `{$dbPrefix}payments` (user_id, amount, currency, plan, status, payment_method, transaction_id) VALUES (?, ?, 'BRL', ?, 'completed', 'pix', ?)");
                $stmtIns->execute([$uRow['id'], $amount, $plan, $txId]);
            }
        }

        // 3. Registra no Log de Atividades
        $stmtLog = $pdo->prepare("INSERT INTO `{$dbPrefix}activity_logs` (username, action, details) VALUES (?, 'payment_approved', ?)");
        $stmtLog->execute([$payerEmail, "Pagamento de R$ {$amount} aprovado via Mercado Pago (Plano {$plan}). Transação: {$txId}"]);

        http_response_code(200);
        echo json_encode(['status' => 'success', 'message' => 'Pagamento processado e conta ativada com sucesso!']);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Erro ao ativar assinatura no banco: ' . $e->getMessage()]);
        exit;
    }
}

http_response_code(200);
echo json_encode(['status' => 'received', 'payment_status' => $status]);
