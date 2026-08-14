<?php
require_once __DIR__ . '/config.php';
startAnorakSession();

// Verifica se o usuário está autenticado
if (!isset($_SESSION['anorak_user_id'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Não autorizado. Por favor, conecte-se.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $db_prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $logs_table = $db_prefix . 'activity_logs';

    $itemId = isset($_GET['item_id']) ? $_GET['item_id'] : null;

    if ($itemId) {
        $stmt = $pdo->prepare("SELECT id, item_id, username, action, details, ip_address, created_at FROM `{$logs_table}` WHERE item_id = :item_id ORDER BY created_at DESC LIMIT 100");
        $stmt->execute([':item_id' => $itemId]);
    } else {
        $stmt = $pdo->query("SELECT id, item_id, username, action, details, ip_address, created_at FROM `{$logs_table}` ORDER BY created_at DESC LIMIT 100");
    }

    $logs = $stmt->fetchAll();

    // Formata o campo details de JSON string para objeto/array antes de enviar
    foreach ($logs as &$log) {
        if (!empty($log['details'])) {
            $decoded = json_decode($log['details'], true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $log['details'] = $decoded;
            }
        }
    }

    echo json_encode([
        'status' => 'success',
        'data' => $logs
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao buscar logs de auditoria: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
