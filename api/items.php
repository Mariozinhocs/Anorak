<?php
require_once __DIR__ . '/config.php';
startAnorakSession();

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
            $assigned_to = $input['assignedTo'] ?? null;
            $tags_json = json_encode($input['tags'] ?? []);
            $context_links_json = json_encode($input['contextLinks'] ?? []);
            $tasks_json = json_encode($input['tasks'] ?? []);
            $validation_history_json = json_encode($input['validationHistory'] ?? []);

            // Determina se é criação ou atualização para o log
            $action_type = 'item_created';
            try {
                $check_stmt = $pdo->prepare("SELECT id FROM `{$items_table}` WHERE id = :id LIMIT 1");
                $check_stmt->execute([':id' => $id]);
                if ($check_stmt->fetch()) {
                    $action_type = 'item_updated';
                }
            } catch (Exception $e) {}

            $stmt = $pdo->prepare("
                INSERT INTO `{$items_table}` 
                (id, type, title, description, status, priority, impact, urgency, assigned_to, tags_json, context_links_json, tasks_json, validation_history_json, created_at, updated_at)
                VALUES 
                (:id, :type, :title, :description, :status, :priority, :impact, :urgency, :assigned_to, :tags_json, :context_links_json, :tasks_json, :validation_history_json, NOW(), NOW())
                ON DUPLICATE KEY UPDATE 
                title = VALUES(title),
                description = VALUES(description),
                status = VALUES(status),
                priority = VALUES(priority),
                impact = VALUES(impact),
                urgency = VALUES(urgency),
                assigned_to = VALUES(assigned_to),
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
                ':assigned_to' => $assigned_to,
                ':tags_json' => $tags_json,
                ':context_links_json' => $context_links_json,
                ':tasks_json' => $tasks_json,
                ':validation_history_json' => $validation_history_json
            ]);

            // Grava log de atividade
            try {
                $logs_table = $db_prefix . 'activity_logs';
                $username_session = $_SESSION['anorak_username'] ?? 'sistema';
                $ip = $_SERVER['REMOTE_ADDR'] ?? '';

                $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (item_id, username, action, details, ip_address, created_at) VALUES (:item_id, :username, :action, :details, :ip, NOW())");
                $log_stmt->execute([
                    ':item_id' => $id,
                    ':username' => $username_session,
                    ':action' => $action_type,
                    ':details' => json_encode(['title' => $title, 'type' => $type, 'status' => $status], JSON_UNESCAPED_UNICODE),
                    ':ip' => $ip
                ]);
            } catch (Exception $e) {}

            echo json_encode(['status' => 'success', 'message' => 'Item salvo com sucesso', 'id' => $id], JSON_UNESCAPED_UNICODE);
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'ID do item é obrigatório'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            // Busca detalhes antes de excluir para o log
            $item_title = 'Desconhecido';
            $item_type = 'unknown';
            try {
                $get_stmt = $pdo->prepare("SELECT title, type FROM `{$items_table}` WHERE id = :id LIMIT 1");
                $get_stmt->execute([':id' => $id]);
                $item_info = $get_stmt->fetch();
                if ($item_info) {
                    $item_title = $item_info['title'];
                    $item_type = $item_info['type'];
                }
            } catch (Exception $e) {}

            $stmt = $pdo->prepare("DELETE FROM `{$items_table}` WHERE id = :id");
            $stmt->execute([':id' => $id]);

            // Grava log de exclusão
            try {
                $logs_table = $db_prefix . 'activity_logs';
                $username_session = $_SESSION['anorak_username'] ?? 'sistema';
                $ip = $_SERVER['REMOTE_ADDR'] ?? '';

                $log_stmt = $pdo->prepare("INSERT INTO `{$logs_table}` (item_id, username, action, details, ip_address, created_at) VALUES (:item_id, :username, 'item_deleted', :details, :ip, NOW())");
                $log_stmt->execute([
                    ':item_id' => $id,
                    ':username' => $username_session,
                    ':details' => json_encode(['title' => $item_title, 'type' => $item_type], JSON_UNESCAPED_UNICODE),
                    ':ip' => $ip
                ]);
            } catch (Exception $e) {}

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
    $item['assignedTo'] = $item['assigned_to'] ?? '';
    $item['createdAt'] = !empty($item['created_at']) ? date('c', strtotime($item['created_at'])) : null;
    $item['updatedAt'] = !empty($item['updated_at']) ? date('c', strtotime($item['updated_at'])) : null;
    unset($item['tags_json'], $item['context_links_json'], $item['tasks_json'], $item['validation_history_json'], $item['assigned_to'], $item['created_at'], $item['updated_at']);
}
