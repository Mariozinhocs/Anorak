<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// 1. Verifica privilégios de Admin
if (!isset($_SESSION['anorak_user_id']) || $_SESSION['anorak_role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Acesso negado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. Garante execução apenas no ambiente local (localhost / 127.0.0.1)
$host = $_SERVER['HTTP_HOST'] ?? '';
$isLocal = ($host === 'localhost' || $host === '127.0.0.1' || strpos($host, '192.168.') === 0 || strpos($host, '10.') === 0);

if (!$isLocal) {
    http_response_code(403);
    echo json_encode([
        'status' => 'error',
        'message' => 'O deploy FTP automático via painel web só pode ser disparado a partir de um ambiente de desenvolvimento local (localhost).'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $scriptPath = realpath(__DIR__ . '/../../deploy-hml.ps1');
    if (!$scriptPath || !file_exists($scriptPath)) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'O script de deploy "deploy-hml.ps1" não foi encontrado na raiz.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $output = [];
    $return_var = 0;
    
    // Executa o script do PowerShell bypassando restrições de política locais e redirecionando erros
    exec("powershell.exe -ExecutionPolicy Bypass -File \"$scriptPath\" 2>&1", $output, $return_var);

    echo json_encode([
        'status' => $return_var === 0 ? 'success' : 'error',
        'message' => $return_var === 0 ? 'Deploy FTP finalizado com sucesso!' : 'Houve um problema durante o deploy.',
        'output' => implode("\n", $output)
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Falha ao executar deploy: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
