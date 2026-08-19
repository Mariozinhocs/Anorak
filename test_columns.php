<?php
header('Content-Type: text/plain; charset=utf-8');
require_once __DIR__ . '/api/config.php';

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $table = $prefix . 'items';
    
    $desc = $pdo->query("DESCRIBE `$table`")->fetchAll();
    $cols = [];
    foreach ($desc as $col) {
        $cols[] = $col['Field'];
    }
    echo "COLUMNS_JSON: " . json_encode($cols) . "\n";
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
