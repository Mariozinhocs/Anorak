<?php
require_once __DIR__ . '/config.php';

$pdo = getDatabaseConnection();
$items_table = $db_prefix . 'items';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['id'])) {
                $stmt = $pdo->prepare("SELECT * FROM `{$items_table}` WHERE id = :id LIMIT 1");
                $stmt->execute([':id' => $_GET['id']]);
                $item = $stmt->fetch();
                if (!$item) {
                    http_response_code(404);
                    echo json_encode(['status' => 'error', 'message' => 'Item não encontrado'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                formatItemJsonFields($item);
                echo json_encode(['status' => 'success', 'data' => $item], JSON_UNESCAPED_UNICODE);
            } else {
                $type = isset($_GET['type']) ? $_GET['type'] : null;
                if ($type) {
                    $stmt = $pdo->prepare("SELECT * FROM `{$items_table}` WHERE type = :type ORDER BY updated_at DESC");
                    $stmt->execute([':type' => $type]);
                } else {
                    $stmt = $pdo->query("SELECT * FROM `{$items_table}` ORDER BY updated_at DESC");
                }
                $items = $stmt->fetchAll();
                foreach ($items as &$it) {
                    formatItemJsonFields($it);
                }
                echo json_encode(['status' => 'success', 'data' => $items], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'POST':
        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true);
            if (!$input || !isset($input['id']) || !isset($input['title'])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Campos obrigatórios ausentes (id, title)'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $id = $input['id'];
            $type = $input['type'] ?? 'project';
            $title = $input['title'];
            $description = $input['description'] ?? '';
            $status = $input['status'] ?? 'homologacao';
            $priority = $input['priority'] ?? 'media';
            $impact = $input['impact'] ?? 'medio';
            $urgency = $input['urgency'] ?? 'media';
            $tags_json = json_encode($input['tags'] ?? []);
            $context_links_json = json_encode($input['contextLinks'] ?? []);
            $tasks_json = json_encode($input['tasks'] ?? []);
            $validation_history_json = json_encode($input['validationHistory'] ?? []);

            $stmt = $pdo->prepare("
                INSERT INTO `{$items_table}` 
                (id, type, title, description, status, priority, impact, urgency, tags_json, context_links_json, tasks_json, validation_history_json, created_at, updated_at)
                VALUES 
                (:id, :type, :title, :description, :status, :priority, :impact, :urgency, :tags_json, :context_links_json, :tasks_json, :validation_history_json, NOW(), NOW())
                ON DUPLICATE KEY UPDATE 
                title = VALUES(title),
                description = VALUES(description),
                status = VALUES(status),
                priority = VALUES(priority),
                impact = VALUES(impact),
                urgency = VALUES(urgency),
                tags_json = VALUES(tags_json),
                context_links_json = VALUES(context_links_json),
                tasks_json = VALUES(tasks_json),
                validation_history_json = VALUES(validation_history_json),
                updated_at = NOW()
            ");

            $stmt->execute([
                ':id' => $id,
                ':type' => $type,
                ':title' => $title,
                ':description' => $description,
                ':status' => $status,
                ':priority' => $priority,
                ':impact' => $impact,
                ':urgency' => $urgency,
                ':tags_json' => $tags_json,
                ':context_links_json' => $context_links_json,
                ':tasks_json' => $tasks_json,
                ':validation_history_json' => $validation_history_json
            ]);

            echo json_encode(['status' => 'success', 'message' => 'Item salvo com sucesso', 'id' => $id], JSON_UNESCAPED_UNICODE);
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'ID do item é obrigatório'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $stmt = $pdo->prepare("DELETE FROM `{$items_table}` WHERE id = :id");
            $stmt->execute([':id' => $id]);

            echo json_encode(['status' => 'success', 'message' => 'Item excluído com sucesso'], JSON_UNESCAPED_UNICODE);
            break;

        default:
            http_response_code(405);
            echo json_encode(['status' => 'error', 'message' => 'Método HTTP não suportado'], JSON_UNESCAPED_UNICODE);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

function formatItemJsonFields(&$item) {
    $item['tags'] = !empty($item['tags_json']) ? json_decode($item['tags_json'], true) : [];
    $item['contextLinks'] = !empty($item['context_links_json']) ? json_decode($item['context_links_json'], true) : [];
    $item['tasks'] = !empty($item['tasks_json']) ? json_decode($item['tasks_json'], true) : [];
    $item['validationHistory'] = !empty($item['validation_history_json']) ? json_decode($item['validation_history_json'], true) : [];
    unset($item['tags_json'], $item['context_links_json'], $item['tasks_json'], $item['validation_history_json']);
}
