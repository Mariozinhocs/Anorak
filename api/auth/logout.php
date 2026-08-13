<?php
require_once __DIR__ . '/../config.php';
startAnorakSession();

// Limpa variáveis de sessão
$_SESSION = [];

// Destrói cookie de sessão
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}

// Destrói a sessão
session_destroy();

echo json_encode([
    'status' => 'success',
    'message' => 'Sessão encerrada com sucesso.'
], JSON_UNESCAPED_UNICODE);
