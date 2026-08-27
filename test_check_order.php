<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/api/config.php';

try {
    $pdo = getDatabaseConnection();
    $items_table = $db_prefix . 'items';
    $stmt = $pdo->query("SELECT id, title, type, status, custom_order, updated_at FROM `{$items_table}` ORDER BY custom_order ASC, updated_at DESC");
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'table' => $items_table,
        'count' => count($items),
        'items' => $items
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
