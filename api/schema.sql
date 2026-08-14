-- Schema do Banco de Dados para Anorak (OASIS Project Hub)
-- Suporta prefixo dinâmico {PREFIX} (ex: hml_ ou anorak_)

CREATE TABLE IF NOT EXISTS `{PREFIX}items` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `type` ENUM('project', 'task', 'idea') NOT NULL DEFAULT 'project',
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'homologacao',
    `priority` ENUM('baixa', 'media', 'alta', 'critica') NOT NULL DEFAULT 'media',
    `impact` ENUM('baixo', 'medio', 'alto') NOT NULL DEFAULT 'medio',
    `urgency` ENUM('baixa', 'media', 'alta') NOT NULL DEFAULT 'media',
    `assigned_to` VARCHAR(100) NULL,
    `tags_json` JSON NULL,
    `context_links_json` JSON NULL,
    `tasks_json` JSON NULL,
    `validation_history_json` JSON NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_type_status` (`type`, `status`),
    INDEX `idx_priority` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `{PREFIX}users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(100) NOT NULL UNIQUE,
    `email` VARCHAR(191) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'user',
    `plan` ENUM('explorer', 'creator', 'master') NOT NULL DEFAULT 'creator',
    `plan_status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `plan_expires_at` DATETIME NULL DEFAULT NULL,
    `password_reset_token` VARCHAR(255) DEFAULT NULL,
    `password_reset_expires` DATETIME DEFAULT NULL,
    `timezone` VARCHAR(100) NOT NULL DEFAULT 'America/Sao_Paulo',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted_at` DATETIME NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `{PREFIX}activity_logs` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `item_id` VARCHAR(64) NULL,
    `username` VARCHAR(100) NULL,
    `action` VARCHAR(100) NOT NULL,
    `details` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_item_id` (`item_id`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `{PREFIX}payments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'BRL',
    `plan` VARCHAR(50) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'completed',
    `payment_method` VARCHAR(50) NOT NULL DEFAULT 'pix',
    `transaction_id` VARCHAR(100) NOT NULL UNIQUE,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `{PREFIX}users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
