-- Migração 006: Criação ou adequação da tabela de usuários para autenticação JWT

CREATE TABLE IF NOT EXISTS usuarios (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  senha VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Garante que a coluna 'email' exista se a tabela veio do dump legado
SET @email_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'usuarios' 
    AND COLUMN_NAME = 'email'
);

SET @sql_email = IF(@email_exists = 0, 
  'ALTER TABLE usuarios ADD COLUMN email VARCHAR(150) NOT NULL AFTER nome, ADD UNIQUE KEY uq_usuarios_email (email)', 
  'SELECT 1'
);
PREPARE stmt_email FROM @sql_email;
EXECUTE stmt_email;
DEALLOCATE PREPARE stmt_email;

-- Garante que created_at e updated_at existam
SET @time_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'usuarios' 
    AND COLUMN_NAME = 'created_at'
);

SET @sql_time = IF(@time_exists = 0,
  'ALTER TABLE usuarios ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1'
);
PREPARE stmt_time FROM @sql_time;
EXECUTE stmt_time;
DEALLOCATE PREPARE stmt_time;
