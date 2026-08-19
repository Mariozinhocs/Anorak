<?php
header('Content-Type: text/plain; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/api/config.php';

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $table = $prefix . 'items';
    
    // Find first project
    $stmt = $pdo->query("SELECT * FROM `{$table}` WHERE type='project' LIMIT 1");
    $project = $stmt->fetch();
    if (!$project) {
        die("No project found to test.\n");
    }
    
    echo "Original project context_links_json: {$project['context_links_json']}\n";
    
    // Mock the POST input
    $contextLinks = json_decode($project['context_links_json'] ?? '{}', true) ?: [];
    $contextLinks['hmlUrl'] = 'https://anorak.hubdigital360.com/hml/new-test-url-' . rand(100, 999);
    
    $input = [
        'id' => $project['id'],
        'title' => $project['title'],
        'type' => 'project',
        'contextLinks' => $contextLinks
    ];
    
    // Simulating api/items.php POST code:
    $id = $input['id'];
    $type = $input['type'] ?? 'project';
    $title = $input['title'];
    $description = $input['description'] ?? $project['description'];
    $status = $input['status'] ?? $project['status'];
    $priority = $input['priority'] ?? $project['priority'];
    $impact = $input['impact'] ?? $project['impact'];
    $urgency = $input['urgency'] ?? $project['urgency'];
    $assigned_to = $input['assignedTo'] ?? $project['assigned_to'];
    
    $collaborators_json = json_encode($input['collaborators'] ?? json_decode($project['collaborators_json'] ?? '[]', true));
    $tags_json = json_encode($input['tags'] ?? json_decode($project['tags_json'] ?? '[]', true));
    $context_links_json = json_encode($input['contextLinks'] ?? []);
    $tasks_json = json_encode($input['tasks'] ?? json_decode($project['tasks_json'] ?? '[]', true));
    $validation_history_json = json_encode($input['validationHistory'] ?? json_decode($project['validation_history_json'] ?? '[]', true));
    
    $save_stmt = $pdo->prepare("
        INSERT INTO `{$table}` 
        (id, type, title, description, status, priority, impact, urgency, assigned_to, collaborators_json, tags_json, context_links_json, tasks_json, validation_history_json, created_at, updated_at)
        VALUES 
        (:id, :type, :title, :description, :status, :priority, :impact, :urgency, :assigned_to, :collaborators_json, :tags_json, :context_links_json, :tasks_json, :validation_history_json, NOW(), NOW())
        ON DUPLICATE KEY UPDATE 
        title = VALUES(title),
        description = VALUES(description),
        status = VALUES(status),
        priority = VALUES(priority),
        impact = VALUES(impact),
        urgency = VALUES(urgency),
        assigned_to = VALUES(assigned_to),
        collaborators_json = VALUES(collaborators_json),
        tags_json = VALUES(tags_json),
        context_links_json = VALUES(context_links_json),
        tasks_json = VALUES(tasks_json),
        validation_history_json = VALUES(validation_history_json),
        updated_at = NOW()
    ");

    $save_stmt->execute([
        ':id' => $id,
        ':type' => $type,
        ':title' => $title,
        ':description' => $description,
        ':status' => $status,
        ':priority' => $priority,
        ':impact' => $impact,
        ':urgency' => $urgency,
        ':assigned_to' => $assigned_to,
        ':collaborators_json' => $collaborators_json,
        ':tags_json' => $tags_json,
        ':context_links_json' => $context_links_json,
        ':tasks_json' => $tasks_json,
        ':validation_history_json' => $validation_history_json
    ]);
    
    // Fetch it back
    $fetch_stmt = $pdo->prepare("SELECT context_links_json FROM `{$table}` WHERE id = :id");
    $fetch_stmt->execute([':id' => $id]);
    $updated_project = $fetch_stmt->fetch();
    echo "Updated project context_links_json: {$updated_project['context_links_json']}\n";
    
    // Restore original contextLinks
    $restore_stmt = $pdo->prepare("UPDATE `{$table}` SET context_links_json = :orig WHERE id = :id");
    $restore_stmt->execute([':orig' => $project['context_links_json'], ':id' => $id]);
    echo "Restored original project context_links_json\n";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
