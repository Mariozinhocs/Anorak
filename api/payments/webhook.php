<?php
// Anorak Project Hub - Mercado Pago Webhook Notification Listener (Pix & Credit Card Subscriptions)
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
    if (isset($json['action']) && !$type) {
        $type = strpos($json['action'], 'subscription') !== false ? 'preapproval' : 'payment';
    }
}

if (!$id) {
    http_response_code(200);
    echo json_encode(['status' => 'ignored', 'message' => 'Sem ID de transação.']);
    exit;
}

$mpAccessToken = getenv('MERCADOPAGO_ACCESS_TOKEN');

if (!$mpAccessToken) {
    http_response_code(200);
    echo json_encode(['status' => 'warning', 'message' => 'Mercado Pago Access Token ausente.']);
    exit;
}

// 1. DETERMINA SE É ASSINATURA (PREAPPROVAL) OU PAGAMENTO ÚNICO
$isPreApproval = ($type === 'preapproval' || $type === 'subscription');

// Tenta verificar se é preapproval consultando o local db se o type for nulo
if (!$type) {
    try {
        $pdo = getDatabaseConnection();
        $dbPrefix = $GLOBALS['db_prefix'] ?? '';
        $stmtPay = $pdo->prepare("SELECT payment_method FROM `{$dbPrefix}payments` WHERE transaction_id = ? LIMIT 1");
        $stmtPay->execute([$id]);
        $pRow = $stmtPay->fetch();
        if ($pRow && $pRow['payment_method'] === 'credit_card') {
            $isPreApproval = true;
        }
    } catch (Exception $e) {}
}

if ($isPreApproval) {
    // === FLUXO DE ASSINATURA (CARTÃO DE CRÉDITO RECORRENTE) ===
    $ch = curl_init("https://api.mercadopago.com/preapproval/{$id}");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $mpAccessToken
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        http_response_code(200);
        echo json_encode(['status' => 'error', 'message' => 'Não foi possível consultar assinatura no MP.']);
        exit;
    }

    $subInfo = json_decode($response, true);
    $status = $subInfo['status'] ?? ''; // 'authorized' indica assinatura ativa
    $payerEmail = $subInfo['payer_email'] ?? null;
    $reason = $subInfo['reason'] ?? '';

    if ($status === 'authorized' && $payerEmail) {
        try {
            $pdo = getDatabaseConnection();
            $dbPrefix = $GLOBALS['db_prefix'] ?? '';

            // Tenta obter o plano cadastrado na transação pendente local
            $plan = 'creator';
            $billingCycle = 'monthly';
            $amount = 49.00;
            $userId = null;

            $stmtPayLocal = $pdo->prepare("SELECT user_id, plan, amount FROM `{$dbPrefix}payments` WHERE transaction_id = ? LIMIT 1");
            $stmtPayLocal->execute([$id]);
            $localPay = $stmtPayLocal->fetch();

            if ($localPay) {
                $plan = $localPay['plan'];
                $amount = $localPay['amount'];
                $userId = $localPay['user_id'];
                if ($amount >= 400) {
                    $billingCycle = 'annual';
                }
            } else {
                // Heurística secundária com base no título da assinatura ou valor
                if (strpos(strtolower($reason), 'legend') !== false) $plan = 'legend';
                elseif (strpos(strtolower($reason), 'master') !== false) $plan = 'master';
                
                if (strpos(strtolower($reason), 'anual') !== false || strpos(strtolower($reason), 'annual') !== false) {
                    $billingCycle = 'annual';
                }
            }

            // Descobre o usuário pelo ID ou pelo E-mail
            if (!$userId) {
                $stmtU = $pdo->prepare("SELECT id FROM `{$dbPrefix}users` WHERE email = ? LIMIT 1");
                $stmtU->execute([$payerEmail]);
                $uRow = $stmtU->fetch();
                $userId = $uRow ? $uRow['id'] : null;
            }

            if ($userId) {
                // Calcula data de expiração baseada no ciclo
                $interval = ($billingCycle === 'annual') ? '1 YEAR' : '30 DAY';
                
                // 1. Atualiza usuário no banco
                $stmtUpUser = $pdo->prepare("UPDATE `{$dbPrefix}users` SET plan = ?, plan_status = 'active', billing_cycle = ?, plan_expires_at = DATE_ADD(NOW(), INTERVAL {$interval}) WHERE id = ?");
                $stmtUpUser->execute([$plan, $billingCycle, $userId]);

                // 2. Atualiza ou insere pagamento
                if ($localPay) {
                    $stmtUpPay = $pdo->prepare("UPDATE `{$dbPrefix}payments` SET status = 'completed', updated_at = NOW() WHERE transaction_id = ?");
                    $stmtUpPay->execute([$id]);
                } else {
                    $stmtInsPay = $pdo->prepare("INSERT INTO `{$dbPrefix}payments` (user_id, amount, currency, plan, status, payment_method, transaction_id) VALUES (?, ?, 'BRL', ?, 'completed', 'credit_card', ?)");
                    $stmtInsPay->execute([$userId, $amount, $plan, $id]);
                }

                // 3. Log de atividades
                $stmtLog = $pdo->prepare("INSERT INTO `{$dbPrefix}activity_logs` (username, action, details) VALUES (?, 'subscription_approved', ?)");
                $stmtLog->execute([$payerEmail, "Assinatura recorrente aprovada via Cartão (Plano {$plan} {$billingCycle}). Transação: {$id}"]);

                http_response_code(200);
                echo json_encode(['status' => 'success', 'message' => 'Assinatura por cartão ativada com sucesso!']);
                exit;
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Erro ao processar assinatura no banco: ' . $e->getMessage()]);
            exit;
        }
    }
} else {
    // === FLUXO DE PAGAMENTO ÚNICO (PIX) ===
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
        echo json_encode(['status' => 'error', 'message' => 'Não foi possível consultar pagamento Pix no MP.']);
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

            // Tenta obter o plano cadastrado na transação pendente local
            $plan = 'creator';
            $billingCycle = 'monthly';
            
            $stmtPayLocal = $pdo->prepare("SELECT user_id, plan, amount FROM `{$dbPrefix}payments` WHERE transaction_id = ? LIMIT 1");
            $stmtPayLocal->execute([$txId]);
            $localPay = $stmtPayLocal->fetch();

            if ($localPay) {
                $plan = $localPay['plan'];
                $amount = $localPay['amount'];
                if ($amount >= 400) {
                    $billingCycle = 'annual';
                }
            } else {
                // Heurística com base no valor cobrado
                if ($amount >= 400) {
                    $billingCycle = 'annual';
                    if ($amount >= 1800) $plan = 'legend';
                    elseif ($amount >= 1000) $plan = 'master';
                } else {
                    $billingCycle = 'monthly';
                    if ($amount >= 180) $plan = 'legend';
                    elseif ($amount >= 100) $plan = 'master';
                }
            }

            // Descobre o usuário pelo ID ou pelo E-mail
            $userId = $localPay ? $localPay['user_id'] : null;
            if (!$userId) {
                $stmtU = $pdo->prepare("SELECT id FROM `{$dbPrefix}users` WHERE email = ? LIMIT 1");
                $stmtU->execute([$payerEmail]);
                $uRow = $stmtU->fetch();
                $userId = $uRow ? $uRow['id'] : null;
            }

            if ($userId) {
                // Calcula data de expiração baseada no ciclo
                $interval = ($billingCycle === 'annual') ? '1 YEAR' : '30 DAY';

                // 1. Atualiza Usuário no Banco
                $stmtUser = $pdo->prepare("UPDATE `{$dbPrefix}users` SET plan = ?, plan_status = 'active', billing_cycle = ?, plan_expires_at = DATE_ADD(NOW(), INTERVAL {$interval}) WHERE id = ?");
                $stmtUser->execute([$plan, $billingCycle, $userId]);

                // 2. Atualiza ou Insere Registro de Pagamento Concluído
                if ($localPay) {
                    $stmtUp = $pdo->prepare("UPDATE `{$dbPrefix}payments` SET status = 'completed', updated_at = NOW() WHERE transaction_id = ?");
                    $stmtUp->execute([$txId]);
                } else {
                    $stmtIns = $pdo->prepare("INSERT INTO `{$dbPrefix}payments` (user_id, amount, currency, plan, status, payment_method, transaction_id) VALUES (?, ?, 'BRL', ?, 'completed', 'pix', ?)");
                    $stmtIns->execute([$userId, $amount, $plan, $txId]);
                }

                // 3. Registra no Log de Atividades
                $stmtLog = $pdo->prepare("INSERT INTO `{$dbPrefix}activity_logs` (username, action, details) VALUES (?, 'payment_approved', ?)");
                $stmtLog->execute([$payerEmail, "Pagamento de R$ {$amount} aprovado via Pix (Plano {$plan} {$billingCycle}). Transação: {$txId}"]);

                http_response_code(200);
                echo json_encode(['status' => 'success', 'message' => 'Pagamento Pix processado e conta ativada com sucesso!']);
                exit;
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Erro ao ativar assinatura Pix no banco: ' . $e->getMessage()]);
            exit;
        }
    }
}

http_response_code(200);
echo json_encode(['status' => 'received', 'payment_status' => $status ?? 'processed']);
