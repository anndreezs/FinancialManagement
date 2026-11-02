-- Migração 007: Vincular Dados ao Usuário (usuario_id) e Suporte a Notificações/E-mail

-- 1. Garante que exista pelo menos um usuário para vincular dados pré-existentes
INSERT IGNORE INTO usuarios (id, nome, email, senha) 
VALUES (1, 'Usuário Principal', 'admin@financeiro.local', '$2a$10$e8w.b0n0/Q1XW5aUqWjE4.dZ0X2JbYv2S5gK1z4h7r9w2v8x1u2t3');

-- Procedimento auxiliar para adicionar colunas de forma segura e idempotente
DELIMITER $$

DROP PROCEDURE IF EXISTS AddColumnIfNotExists$$
CREATE PROCEDURE AddColumnIfNotExists(
    IN tableName VARCHAR(64),
    IN columnName VARCHAR(64),
    IN columnDef VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = tableName
          AND COLUMN_NAME = columnName
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', tableName, '` ADD COLUMN `', columnName, '` ', columnDef);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

-- 2. Adiciona usuario_id nas tabelas operacionais
CALL AddColumnIfNotExists('contas', 'usuario_id', 'INT NOT NULL DEFAULT 1');
CALL AddColumnIfNotExists('cartoes', 'usuario_id', 'INT NOT NULL DEFAULT 1');
CALL AddColumnIfNotExists('categorias', 'usuario_id', 'INT NOT NULL DEFAULT 1');
CALL AddColumnIfNotExists('dividas', 'usuario_id', 'INT NOT NULL DEFAULT 1');
CALL AddColumnIfNotExists('transacoes', 'usuario_id', 'INT NOT NULL DEFAULT 1');
CALL AddColumnIfNotExists('planned_movements', 'usuario_id', 'INT NOT NULL DEFAULT 1');
CALL AddColumnIfNotExists('goals', 'usuario_id', 'INT NOT NULL DEFAULT 1');
CALL AddColumnIfNotExists('internal_transfers', 'usuario_id', 'INT NOT NULL DEFAULT 1');
CALL AddColumnIfNotExists('financial_alert_events', 'usuario_id', 'INT NOT NULL DEFAULT 1');

-- 3. Adiciona colunas para controle de leitura e envio de e-mail na tabela de alertas
CALL AddColumnIfNotExists('financial_alert_events', 'lido_em', 'TIMESTAMP NULL DEFAULT NULL');
CALL AddColumnIfNotExists('financial_alert_events', 'enviado_email_em', 'TIMESTAMP NULL DEFAULT NULL');

-- 4. Adiciona usuario_id em financial_settings para permitir configurações individuais
CALL AddColumnIfNotExists('financial_settings', 'usuario_id', 'INT NOT NULL DEFAULT 1');

-- Limpa a procedure temporária
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;

-- 5. Criação de índices para consultas rápidas filtradas por usuário
SET @ix1 = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contas' AND INDEX_NAME = 'ix_contas_usuario');
SET @sql1 = IF(@ix1 = 0, 'ALTER TABLE contas ADD KEY ix_contas_usuario (usuario_id)', 'SELECT 1');
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @ix2 = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cartoes' AND INDEX_NAME = 'ix_cartoes_usuario');
SET @sql2 = IF(@ix2 = 0, 'ALTER TABLE cartoes ADD KEY ix_cartoes_usuario (usuario_id)', 'SELECT 1');
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;

SET @ix3 = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categorias' AND INDEX_NAME = 'ix_categorias_usuario');
SET @sql3 = IF(@ix3 = 0, 'ALTER TABLE categorias ADD KEY ix_categorias_usuario (usuario_id)', 'SELECT 1');
PREPARE s3 FROM @sql3; EXECUTE s3; DEALLOCATE PREPARE s3;

SET @ix4 = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transacoes' AND INDEX_NAME = 'ix_transacoes_usuario_data');
SET @sql4 = IF(@ix4 = 0, 'ALTER TABLE transacoes ADD KEY ix_transacoes_usuario_data (usuario_id, data)', 'SELECT 1');
PREPARE s4 FROM @sql4; EXECUTE s4; DEALLOCATE PREPARE s4;

SET @ix5 = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financial_alert_events' AND INDEX_NAME = 'ix_alert_events_usuario');
SET @sql5 = IF(@ix5 = 0, 'ALTER TABLE financial_alert_events ADD KEY ix_alert_events_usuario (usuario_id, dismissed_at)', 'SELECT 1');
PREPARE s5 FROM @sql5; EXECUTE s5; DEALLOCATE PREPARE s5;
