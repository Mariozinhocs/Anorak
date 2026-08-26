<?php
/**
 * ANORAK - Structured Logger & Observability Engine
 * Implementação dos Pilares de Observabilidade (M.E.L.T.) para o Squad A-Team
 * 
 * Desenvolvido por Mario Henrique (mariozinhocs) - mariozinhocs@gmail.com
 * "si vis pacem para bellum"
 */

class AnorakLogger {
    private static ?string $traceId = null;

    /**
     * Obtém ou inicializa o Trace-ID único para a requisição atual
     */
    public static function getTraceId(): string {
        if (self::$traceId !== null) {
            return self::$traceId;
        }

        // Tenta capturar dos headers da requisição
        $headers = [
            'HTTP_X_TRACE_ID',
            'HTTP_X_CORRELATION_ID',
            'HTTP_X_REQUEST_ID'
        ];

        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                self::$traceId = substr(preg_replace('/[^a-zA-Z0-9\-_]/', '', $_SERVER[$header]), 0, 64);
                return self::$traceId;
            }
        }

        // Gera novo Trace-ID (hexadecimal randômico de alta entropia)
        try {
            self::$traceId = 'tr-' . bin2hex(random_bytes(8)) . '-' . bin2hex(random_bytes(4));
        } catch (Exception $e) {
            self::$traceId = 'tr-' . uniqid('', true);
        }

        return self::$traceId;
    }

    /**
     * Define o Trace-ID no cabeçalho de resposta HTTP
     */
    public static function injectTraceHeader(): void {
        if (!headers_sent()) {
            $traceId = self::getTraceId();
            header("X-Trace-ID: {$traceId}");
            header("X-Correlation-ID: {$traceId}");
        }
    }

    /**
     * Emite log estruturado em JSON
     */
    public static function log(string $level, string $message, array $context = [], ?string $module = null): array {
        $traceId = self::getTraceId();
        $userId = $_SESSION['anorak_user_id'] ?? null;
        $username = $_SESSION['anorak_username'] ?? 'anonymous';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

        $entry = [
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'level'     => strtoupper($level),
            'service'   => 'anorak-api',
            'module'    => $module ?? ($_SERVER['SCRIPT_NAME'] ?? 'unknown'),
            'trace_id'  => $traceId,
            'user'      => [
                'id'       => $userId,
                'username' => $username,
                'ip'       => $ip
            ],
            'message'   => $message,
            'context'   => $context
        ];

        // Se o nível for de erro, grava no log de erro padrão do PHP em JSON estruturado
        if (in_array(strtoupper($level), ['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'])) {
            error_log('[ANORAK-OBSERVABILITY] ' . json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        }

        return $entry;
    }

    public static function info(string $message, array $context = [], ?string $module = null): array {
        return self::log('INFO', $message, $context, $module);
    }

    public static function warn(string $message, array $context = [], ?string $module = null): array {
        return self::log('WARN', $message, $context, $module);
    }

    public static function error(string $message, array $context = [], ?string $module = null): array {
        return self::log('ERROR', $message, $context, $module);
    }

    public static function debug(string $message, array $context = [], ?string $module = null): array {
        return self::log('DEBUG', $message, $context, $module);
    }

    /**
     * Registra auditoria persistente no banco de dados (Tabela activity_logs)
     */
    public static function audit(PDO $pdo, string $action, array $details = [], ?int $itemId = null): bool {
        try {
            $traceId = self::getTraceId();
            $username = $_SESSION['anorak_username'] ?? 'system';
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $dbPrefix = getenv('DB_TABLE_PREFIX') ?: '';
            $table = $dbPrefix . 'activity_logs';

            $details['trace_id'] = $traceId;
            $detailsJson = json_encode($details, JSON_UNESCAPED_UNICODE);

            $stmt = $pdo->prepare("INSERT INTO `{$table}` (item_id, username, action, details, ip_address, created_at) VALUES (:item_id, :username, :action, :details, :ip, UTC_TIMESTAMP())");
            return $stmt->execute([
                ':item_id'  => $itemId,
                ':username' => $username,
                ':action'   => $action,
                ':details'  => $detailsJson,
                ':ip'       => $ip
            ]);
        } catch (Exception $e) {
            self::error('Falha ao gravar log de auditoria no MySQL: ' . $e->getMessage(), ['exception' => $e->getMessage()]);
            return false;
        }
    }
}
