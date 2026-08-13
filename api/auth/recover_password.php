<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Método não permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$emailOrUsername = trim($data['email'] ?? $data['username'] ?? '');

if (empty($emailOrUsername)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Por favor, informe seu e-mail ou nome de usuário.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDatabaseConnection();
    $users_table = $db_prefix . 'users';

    // Buscar usuário por email ou username
    $stmt = $pdo->prepare("SELECT id, username, email FROM `{$users_table}` WHERE (email = :val1 OR username = :val2) AND deleted_at IS NULL LIMIT 1");
    $stmt->execute([
        ':val1' => $emailOrUsername,
        ':val2' => $emailOrUsername
    ]);
    $user = $stmt->fetch();

    if ($user) {
        // Gerar token de redefinição
        $token = bin2hex(random_bytes(16));
        $expires = gmdate('Y-m-d H:i:s', time() + 3600); // 1 hora UTC

        $stmtUpdate = $pdo->prepare("UPDATE `{$users_table}` SET password_reset_token = :token, password_reset_expires = :expires WHERE id = :id");
        $stmtUpdate->execute([
            ':token' => $token,
            ':expires' => $expires,
            ':id' => $user['id']
        ]);

        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
        $host = $_SERVER['HTTP_HOST'];
        $script_dir = dirname($_SERVER['SCRIPT_NAME']); // ex: /hml/api/auth
        $base_dir = dirname(dirname($script_dir)); // ex: /hml
        if ($base_dir === DIRECTORY_SEPARATOR || $base_dir === '\\') {
            $base_dir = '';
        }
        $reset_url = "{$protocol}://{$host}{$base_dir}/login.html?token={$token}";

        $to = $user['email'];
        $subject = "Recuperação de Senha - Anorak OASIS";
        $headers = "From: no-reply@hubdigital360.com\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";

        $message = "
        <html>
        <head>
          <title>Recuperação de Senha - Anorak OASIS</title>
        </head>
        <body style='font-family: Arial, sans-serif; background-color: #070b14; color: #f3f4f6; padding: 20px;'>
          <div style='max-width: 600px; margin: 0 auto; background: #0d1321; padding: 30px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.3);'>
            <h2 style='color: #38bdf8;'>Olá, {$user['username']}!</h2>
            <p>Recebemos uma solicitação de redefinição de chave de acesso para sua conta no <strong>Anorak OASIS</strong>.</p>
            <p>Para definir sua nova senha, clique no botão abaixo:</p>
            <p style='text-align: center; margin: 30px 0;'>
              <a href='{$reset_url}' style='background: linear-gradient(135deg, #38bdf8 0%, #a855f7 100%); color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;'>Redefinir Minha Senha</a>
            </p>
            <p style='font-size: 12px; color: #94a3b8;'>Este link é válido por 1 hora. Se você não solicitou, apenas ignore esta mensagem.</p>
            <hr style='border: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 20px 0;'>
            <p style='font-size: 11px; color: #64748b;'>Anorak OASIS Project Hub</p>
          </div>
        </body>
        </html>
        ";

        @mail($to, $subject, $message, $headers);

        echo json_encode([
            'status' => 'success',
            'message' => 'Se o cadastro existir, o link de recuperação foi gerado.',
            'debug_token' => $token,
            'reset_link' => $reset_url
        ], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode([
            'status' => 'success',
            'message' => 'Se o cadastro existir, o link de recuperação foi gerado.'
        ], JSON_UNESCAPED_UNICODE);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Erro ao processar recuperação: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
