<?php
header('Content-Type: text/plain; charset=utf-8');
require_once __DIR__ . '/api/config.php';

try {
    $pdo = getDatabaseConnection();
    $prefix = getenv('DB_TABLE_PREFIX') ?: '';
    $table = $prefix . 'items';

    // Fetch the project
    $stmt = $pdo->prepare("SELECT * FROM `{$table}` WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => 'proj_anorak_core']);
    $project = $stmt->fetch();
    if (!$project) {
        die("Project proj_anorak_core not found.\n");
    }

    echo "BEFORE - Custom Order: {$project['custom_order']} | Updated At: {$project['updated_at']}\n";

    // Format the payload exactly like JS:
    $payload = [
        'id' => $project['id'],
        'type' => $project['type'],
        'title' => $project['title'],
        'description' => $project['description'],
        'status' => $project['status'],
        'priority' => $project['priority'],
        'impact' => $project['impact'],
        'urgency' => $project['urgency'],
        'assignedTo' => $project['assigned_to'],
        'collaborators' => json_decode($project['collaborators_json'] ?? '[]', true),
        'tags' => json_decode($project['tags_json'] ?? '[]', true),
        'contextLinks' => json_decode($project['context_links_json'] ?? '{}', true),
        'tasks' => json_decode($project['tasks_json'] ?? '[]', true),
        'validationHistory' => json_decode($project['validation_history_json'] ?? '[]', true),
        'customOrder' => 95, // Set customOrder to 95
        'createdAt' => date('c', strtotime($project['created_at'])),
        'updatedAt' => date('c', time()) // Current time
    ];

    // Call api/items.php via cURL on HTTP_HOST
    $host = $_SERVER['HTTP_HOST'];
    $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    $apiUrl = "$protocol://$host" . dirname($_SERVER['SCRIPT_NAME']) . '/api/items.php';
    echo "API URL: $apiUrl\n";

    $ch = curl_init($apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Trace-ID: tr-test-12345',
        'X-Correlation-ID: tr-test-12345'
    ]);
    
    // Disable SSL verification for curl if needed
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    echo "HTTP Status Code: $httpCode\n";
    if ($curlError) {
        echo "cURL Error: $curlError\n";
    }
    echo "API Response: $response\n\n";

    // Fetch the project again
    $stmt->execute([':id' => 'proj_anorak_core']);
    $updatedProject = $stmt->fetch();
    echo "AFTER - Custom Order: {$updatedProject['custom_order']} | Updated At: {$updatedProject['updated_at']}\n";

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
