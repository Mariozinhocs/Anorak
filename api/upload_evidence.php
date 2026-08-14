<?php
require_once __DIR__ . '/config.php';
startAnorakSession();

// Apenas aceita requisições POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Método não permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Verifica se o usuário está autenticado
if (!isset($_SESSION['anorak_user_id'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Não autorizado. Por favor, conecte-se.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Verifica se o arquivo foi enviado
if (!isset($_FILES['evidence_file'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Nenhum arquivo enviado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$file = $_FILES['evidence_file'];

// Verifica erros de upload
if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao receber o arquivo (código: ' . $file['error'] . ').'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Valida tamanho do arquivo (máximo 10MB)
$maxSize = 10 * 1024 * 1024; // 10MB
if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'O arquivo excede o limite máximo permitido de 10MB.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Valida extensão do arquivo contra tipos seguros
$filename = $file['name'];
$ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
$allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'zip', 'docx', 'xlsx', 'txt'];

if (!in_array($ext, $allowedExtensions)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Extensão de arquivo não permitida. Apenas PDF, Imagens (PNG, JPG, JPEG), ZIP, Word, Excel e TXT.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Define o diretório de uploads (raiz do projeto/uploads)
$uploadDir = __DIR__ . '/../uploads/';
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Adiciona um arquivo .htaccess para desativar a execução de scripts PHP no diretório de uploads
$htaccessPath = $uploadDir . '.htaccess';
if (!file_exists($htaccessPath)) {
    $htaccessContent = "Options -ExecCGI\n";
    $htaccessContent .= "AddHandler default-handler .php .phtml .php3 .php4 .php5 .php6 .php7 .php8 .phps .cgi .pl .py .asp .aspx .shtml .sh .xml\n";
    $htaccessContent .= "RemoveHandler .php .phtml .php3 .php4 .php5 .php6 .php7 .php8 .phps .cgi .pl .py .asp .aspx .shtml .sh .xml\n";
    $htaccessContent .= "ForceType application/octet-stream\n";
    file_put_contents($htaccessPath, $htaccessContent);
}

// Gera um nome único e seguro para o arquivo
$safeFilename = 'evidence_' . time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
$targetPath = $uploadDir . $safeFilename;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    echo json_encode([
        'status' => 'success',
        'message' => 'Arquivo enviado com sucesso.',
        'name' => $filename,
        'path' => 'uploads/' . $safeFilename
    ], JSON_UNESCAPED_UNICODE);
} else {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Falha ao salvar o arquivo no servidor.'], JSON_UNESCAPED_UNICODE);
}
