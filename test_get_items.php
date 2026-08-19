<?php
header('Content-Type: text/plain; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/api/config.php';

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $table = $prefix . 'items';
    
    $stmt = $pdo->query("SELECT id, title, context_links_json FROM `{$table}` WHERE type='project'");
    $projects = $stmt->fetchAll();
    echo "DB Projects Raw:\n";
    foreach ($projects as $p) {
        echo "ID: {$p['id']} | Title: {$p['title']} | context_links_json: {$p['context_links_json']}\n";
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
