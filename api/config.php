<?php
// Anorak Project Hub - Backend Configuration
// Desenvolvido por Mario Henrique (mariozinhocs) - mariozinhocs@gmail.com
// "si vis pacem para bellum"

// Configurações de exibição de erros
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Fuso horário padrão em UTC
date_default_timezone_set('UTC');

// Utilitário de Observabilidade & Logs Estruturados
require_once __DIR__ . '/utils/logger.php';

// Headers padrão para resposta JSON, CORS seguro e Rastreabilidade (Trace-ID)
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
AnorakLogger::injectTraceHeader();

// Inicialização segura de sessão
function startAnorakSession() {
    if (session_status() === PHP_SESSION_NONE) {
        $cookieParams = [
            'lifetime' => 86400 * 30, // 30 dias
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax'
        ];
        if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') {
            $cookieParams['secure'] = true;
        }
        session_set_cookie_params($cookieParams);
        session_start();
    }
}

// Função auxiliar para carregar o arquivo .env
function loadEnv($path) {
    if (!file_exists($path)) {
        return false;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value, " \t\n\r\0\x0B\"'");
            if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
                putenv(sprintf('%s=%s', $name, $value));
                $_ENV[$name] = $value;
                $_SERVER[$name] = $value;
            }
        }
    }
    return true;
}

// Carrega o arquivo .env da raiz do projeto ou diretório pai
$env_loaded = loadEnv(__DIR__ . '/../.env') || loadEnv(__DIR__ . '/.env');

// Obtenção de variáveis de conexão
$db_host = getenv('DATABASE_HOST') ?: 'localhost';
$db_user = getenv('DATABASE_USER') ?: 'root';
$db_pass = getenv('DATABASE_PASSWORD') ?: '';
$db_name = getenv('DATABASE_NAME') ?: 'anorak_db';
$db_port = getenv('DATABASE_PORT') ?: '3306';
$db_prefix = getenv('DB_TABLE_PREFIX') ?: '';

// Função para obter a conexão PDO
function getDatabaseConnection() {
    global $db_host, $db_user, $db_pass, $db_name, $db_port;
    try {
        $dsn = "mysql:host=$db_host;port=$db_port;dbname=$db_name;charset=utf8mb4";
        $pdo = new PDO($dsn, $db_user, $db_pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]);
        // Forçar fuso UTC no MySQL
        $pdo->exec("SET time_zone = '+00:00'");
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => 'Falha na conexão com o banco de dados: ' . $e->getMessage()
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
