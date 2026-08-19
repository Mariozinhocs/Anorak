<?php
header('Content-Type: text/plain; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/api/config.php';

$db_host = getenv('DATABASE_HOST') ?: 'localhost';
$db_name = getenv('DATABASE_NAME') ?: 'anorak_db';
$prefix = getenv('DB_TABLE_PREFIX') ?: '';

try {
    $pdo = getDatabaseConnection();
    echo "Connected successfully to DB: $db_name\n";
    
    $items_table = $db_prefix . 'items';
    $id = 'proj_test_hml_url_' . rand(1000, 9999);
    $title = 'Test Project HML';
    $context_links = [
        'driveFolder' => 'https://drive.google.com/test',
        'githubRepo' => 'https://github.com/test',
        'hmlUrl' => 'https://anorak.hubdigital360.com/hml/test-hml-url-value',
        'liveUrl' => 'https://live.com/test'
    ];
    $context_links_json = json_encode($context_links);
    
    $stmt = $pdo->prepare("
        INSERT INTO `{$items_table}` 
        (id, type, title, description, status, priority, impact, urgency, assigned_to, collaborators_json, tags_json, context_links_json, tasks_json, validation_history_json, created_at, updated_at)
        VALUES 
        (:id, 'project', :title, '', 'homologacao', 'media', 'medio', 'media', NULL, '[]', '[]', :context_links_json, '[]', '[]', NOW(), NOW())
    ");
    $stmt->execute([
        ':id' => $id,
        ':title' => $title,
        ':context_links_json' => $context_links_json
    ]);
    echo "Inserted project with ID: $id\n";
    
    // Fetch it back
    $fetch_stmt = $pdo->prepare("SELECT id, title, context_links_json FROM `{$items_table}` WHERE id = :id");
    $fetch_stmt->execute([':id' => $id]);
    $row = $fetch_stmt->fetch();
    echo "Fetched row from DB:\n";
    echo "ID: {$row['id']} | Title: {$row['title']} | context_links_json: {$row['context_links_json']}\n";
    
    // Delete test project
    $del_stmt = $pdo->prepare("DELETE FROM `{$items_table}` WHERE id = :id");
    $del_stmt->execute([':id' => $id]);
    echo "Cleaned up test project\n";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
