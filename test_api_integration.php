<?php
header('Content-Type: text/plain; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Base URL of the API
$baseUrl = 'http://localhost' . dirname($_SERVER['SCRIPT_NAME']) . '/api/items.php';

echo "Testing API at URL: $baseUrl\n\n";

// Helper function for GET
function apiGet($url) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true);
}

// Helper function for POST
function apiPost($url, $data) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true);
}

// 1. Get all items
$res = apiGet($baseUrl);
if ($res['status'] !== 'success') {
    die("GET failed: " . print_r($res, true));
}

$projects = array_filter($res['data'], function($item) {
    return $item['type'] === 'project';
});

if (empty($projects)) {
    die("No projects returned by API.\n");
}

$project = reset($projects);
echo "Original project contextLinks: " . json_encode($project['contextLinks']) . "\n\n";

// 2. Modify project to add hmlUrl
$project['contextLinks']['hmlUrl'] = 'https://anorak.hubdigital360.com/hml/api-integration-test-url';

// 3. POST project back
$postRes = apiPost($baseUrl, $project);
echo "POST response: " . json_encode($postRes) . "\n\n";

// 4. GET again to verify
$res2 = apiGet($baseUrl . '?id=' . urlencode($project['id']));
echo "Fetched project contextLinks: " . json_encode($res2['data']['contextLinks']) . "\n\n";

// Restore original contextLinks
$project['contextLinks']['hmlUrl'] = '';
apiPost($baseUrl, $project);
echo "Restored original project contextLinks\n";
