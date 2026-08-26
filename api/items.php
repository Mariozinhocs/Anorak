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
            $collaborators_json = json_encode($input['collaborators'] ?? []);
            $tags_json = json_encode($input['tags'] ?? []);
            $context_links_json = json_encode($input['contextLinks'] ?? []);
            $tasks_json = json_encode($input['tasks'] ?? []);
            $validation_history_json = json_encode($input['validationHistory'] ?? []);

            $custom_order = isset($input['customOrder']) ? (int)$input['customOrder'] : 0;
            $quadrant = !empty($input['quadrant']) ? $input['quadrant'] : null;

            // Auto-migração preventiva das colunas custom_order e quadrant
            try {
                $pdo->exec("ALTER TABLE `{$items_table}` ADD COLUMN `custom_order` INT NOT NULL DEFAULT 0 AFTER `status`");
                $pdo->exec("ALTER TABLE `{$items_table}` ADD COLUMN `quadrant` VARCHAR(10) NULL DEFAULT NULL AFTER `urgency`");
            } catch (Exception $e) {}

            // Determina se é criação ou atualização para o log
            $action_type = 'item_created';
            try {
                $check_stmt = $pdo->prepare("SELECT id FROM `{$items_table}` WHERE id = :id LIMIT 1");
                $check_stmt->execute([':id' => $id]);
                if ($check_stmt->fetch()) {
                    $action_type = 'item_updated';
                }
            } catch (Exception $e) {}

            // Lê datas geradas no cliente (sincronização LWW)
            $created_at = null;
            if (!empty($input['createdAt'])) {
                $created_at = date('Y-m-d H:i:s', strtotime($input['createdAt']));
            }
            $updated_at = null;
            if (!empty($input['updatedAt'])) {
                $updated_at = date('Y-m-d H:i:s', strtotime($input['updatedAt']));
            }

            $stmt = $pdo->prepare("
                INSERT INTO `{$items_table}` 
                (id, type, title, description, status, custom_order, priority, impact, urgency, quadrant, assigned_to, collaborators_json, tags_json, context_links_json, tasks_json, validation_history_json, created_at, updated_at)
                VALUES 
                (:id, :type, :title, :description, :status, :custom_order, :priority, :impact, :urgency, :quadrant, :assigned_to, :collaborators_json, :tags_json, :context_links_json, :tasks_json, :validation_history_json, COALESCE(:created_at, NOW()), COALESCE(:updated_at, NOW()))
                ON DUPLICATE KEY UPDATE 
                title = VALUES(title),
                description = VALUES(description),
                status = VALUES(status),
                custom_order = VALUES(custom_order),
                priority = VALUES(priority),
                impact = VALUES(impact),
                urgency = VALUES(urgency),
                quadrant = VALUES(quadrant),
                assigned_to = VALUES(assigned_to),
                collaborators_json = VALUES(collaborators_json),
                tags_json = VALUES(tags_json),
                context_links_json = VALUES(context_links_json),
                tasks_json = VALUES(tasks_json),
                validation_history_json = VALUES(validation_history_json),
                updated_at = VALUES(updated_at)
            ");

            $stmt->execute([
                ':id' => $id,
                ':type' => $type,
                ':title' => $title,
                ':description' => $description,
                ':status' => $status,
                ':custom_order' => $custom_order,
                ':priority' => $priority,
                ':impact' => $impact,
                ':urgency' => $urgency,
                ':quadrant' => $quadrant,
                ':assigned_to' => $assigned_to,
                ':collaborators_json' => $collaborators_json,
                ':tags_json' => $tags_json,
                ':context_links_json' => $context_links_json,
                ':tasks_json' => $tasks_json,
                ':validation_history_json' => $validation_history_json,
                ':created_at' => $created_at,
                ':updated_at' => $updated_at
            ]);

            // Grava log de atividade com Trace-ID via AnorakLogger
            AnorakLogger::audit($pdo, $action_type, [
                'title'  => $title,
                'type'   => $type,
                'status' => $status
            ], (int)$id);

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

            // Grava log de exclusão com Trace-ID via AnorakLogger
            AnorakLogger::audit($pdo, 'item_deleted', [
                'title' => $item_title,
                'type'  => $item_type
            ], (int)$id);

            echo json_encode(['status' => 'success', 'message' => 'Item excluído com sucesso'], JSON_UNESCAPED_UNICODE);
            break;

        default:
            http_response_code(405);
            echo json_encode(['status' => 'error', 'message' => 'Método HTTP não permitido'], JSON_UNESCAPED_UNICODE);
            break;
    }
} catch (Exception $e) {
    AnorakLogger::error('Erro operacional na API de itens: ' . $e->getMessage(), [
        'method'    => $method,
        'exception' => $e->getMessage()
    ]);
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro no servidor: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

function formatItemJsonFields(&$item) {
    $item['collaborators'] = !empty($item['collaborators_json']) ? json_decode($item['collaborators_json'], true) : [];
    $item['tags'] = !empty($item['tags_json']) ? json_decode($item['tags_json'], true) : [];
    $item['contextLinks'] = !empty($item['context_links_json']) ? json_decode($item['context_links_json'], true) : [];
    $item['tasks'] = !empty($item['tasks_json']) ? json_decode($item['tasks_json'], true) : [];
    $item['validationHistory'] = !empty($item['validation_history_json']) ? json_decode($item['validation_history_json'], true) : [];
    $item['assignedTo'] = $item['assigned_to'] ?? '';
    $item['customOrder'] = isset($item['custom_order']) ? (int)$item['custom_order'] : 0;
    $item['quadrant'] = $item['quadrant'] ?? null;
    $item['createdAt'] = !empty($item['created_at']) ? date('c', strtotime($item['created_at'])) : null;
    $item['updatedAt'] = !empty($item['updated_at']) ? date('c', strtotime($item['updated_at'])) : null;
    unset($item['collaborators_json'], $item['tags_json'], $item['context_links_json'], $item['tasks_json'], $item['validation_history_json'], $item['assigned_to'], $item['custom_order'], $item['created_at'], $item['updated_at']);
}
