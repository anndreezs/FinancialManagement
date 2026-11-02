ALTER TABLE cartoes
  ADD COLUMN limite_pessoal DECIMAL(10,2) DEFAULT NULL;

ALTER TABLE transacoes
  MODIFY COLUMN forma_pagamento ENUM('debito','pix','credito','dinheiro','transferencia') NOT NULL,
  ADD COLUMN idempotency_key VARCHAR(80) DEFAULT NULL,
  ADD UNIQUE KEY uq_transacoes_idempotency_key (idempotency_key);

CREATE TABLE financial_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  percentual_seguro_bps SMALLINT UNSIGNED NOT NULL DEFAULT 7000,
  horizonte_dias SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  alertas_percentuais VARCHAR(100) NOT NULL DEFAULT '50,70,80,90,100',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_financial_settings_id CHECK (id = 1),
  CONSTRAINT chk_financial_settings_percent CHECK (percentual_seguro_bps <= 10000),
  CONSTRAINT chk_financial_settings_horizon CHECK (horizonte_dias BETWEEN 1 AND 366)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO financial_settings (id) VALUES (1);

CREATE TABLE planned_movements (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('income','commitment') NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  data_prevista DATE NOT NULL,
  status ENUM('confirmed','estimated','pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  categoria_id INT DEFAULT NULL,
  conta_id INT DEFAULT NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_planned_movements_idempotency (idempotency_key),
  KEY ix_planned_movements_date_status (data_prevista, status),
  CONSTRAINT chk_planned_movements_amount CHECK (valor > 0),
  CONSTRAINT fk_planned_movements_category FOREIGN KEY (categoria_id) REFERENCES categorias (id),
  CONSTRAINT fk_planned_movements_account FOREIGN KEY (conta_id) REFERENCES contas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE goals (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT DEFAULT NULL,
  valor_alvo DECIMAL(12,2) NOT NULL,
  data_inicio DATE NOT NULL,
  data_limite DATE NOT NULL,
  finalidade VARCHAR(80) DEFAULT NULL,
  conta_id INT DEFAULT NULL,
  observacoes TEXT DEFAULT NULL,
  status ENUM('active','paused','completed','archived','cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_goals_target CHECK (valor_alvo > 0),
  CONSTRAINT chk_goals_dates CHECK (data_limite >= data_inicio),
  CONSTRAINT fk_goals_account FOREIGN KEY (conta_id) REFERENCES contas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE contribution_plans (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  goal_id INT NOT NULL,
  metodo ENUM('fixed','calculated','custom','progressive') NOT NULL,
  frequencia ENUM('weekly','monthly') NOT NULL,
  data_inicio DATE NOT NULL,
  data_limite DATE NOT NULL,
  dia_preferencial TINYINT UNSIGNED DEFAULT NULL,
  valor_fixo DECIMAL(12,2) DEFAULT NULL,
  incremento_bps SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  valores_personalizados LONGTEXT DEFAULT NULL,
  status ENUM('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_contribution_plans_goal_status (goal_id, status),
  CONSTRAINT chk_contribution_plans_dates CHECK (data_limite >= data_inicio),
  CONSTRAINT chk_contribution_plans_day CHECK (dia_preferencial IS NULL OR dia_preferencial BETWEEN 1 AND 31),
  CONSTRAINT chk_contribution_plans_fixed CHECK (valor_fixo IS NULL OR valor_fixo > 0),
  CONSTRAINT fk_contribution_plans_goal FOREIGN KEY (goal_id) REFERENCES goals (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE contribution_occurrences (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  goal_id INT NOT NULL,
  data_prevista DATE NOT NULL,
  valor_planejado DECIMAL(12,2) NOT NULL,
  valor_contribuido DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('pending','partial','complete','overdue','deferred','skipped','cancelled') NOT NULL DEFAULT 'pending',
  ajuste_manual TINYINT(1) NOT NULL DEFAULT 0,
  observacao VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contribution_occurrence_date (plan_id, data_prevista),
  KEY ix_contribution_occurrence_goal_date (goal_id, data_prevista, status),
  CONSTRAINT chk_contribution_occurrence_amount CHECK (valor_planejado > 0 AND valor_contribuido >= 0),
  CONSTRAINT fk_contribution_occurrences_plan FOREIGN KEY (plan_id) REFERENCES contribution_plans (id),
  CONSTRAINT fk_contribution_occurrences_goal FOREIGN KEY (goal_id) REFERENCES goals (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE internal_transfers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conta_origem_id INT NOT NULL,
  conta_destino_id INT NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  data DATE NOT NULL,
  descricao VARCHAR(255) DEFAULT NULL,
  goal_id INT DEFAULT NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_internal_transfers_idempotency (idempotency_key),
  CONSTRAINT chk_internal_transfer_amount CHECK (valor > 0),
  CONSTRAINT chk_internal_transfer_accounts CHECK (conta_origem_id <> conta_destino_id),
  CONSTRAINT fk_internal_transfer_origin FOREIGN KEY (conta_origem_id) REFERENCES contas (id),
  CONSTRAINT fk_internal_transfer_destination FOREIGN KEY (conta_destino_id) REFERENCES contas (id),
  CONSTRAINT fk_internal_transfer_goal FOREIGN KEY (goal_id) REFERENCES goals (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE goal_movements (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  goal_id INT NOT NULL,
  occurrence_id INT DEFAULT NULL,
  tipo ENUM('contribution','withdrawal','adjustment','reversal') NOT NULL,
  modalidade ENUM('virtual','transfer','adjustment') NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  data DATE NOT NULL,
  conta_origem_id INT DEFAULT NULL,
  conta_destino_id INT DEFAULT NULL,
  transfer_id INT DEFAULT NULL,
  reverses_movement_id INT DEFAULT NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL,
  observacao VARCHAR(255) DEFAULT NULL,
  status ENUM('posted','reversed') NOT NULL DEFAULT 'posted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_goal_movements_idempotency (idempotency_key),
  UNIQUE KEY uq_goal_movements_transfer (transfer_id),
  KEY ix_goal_movements_goal_date (goal_id, data),
  CONSTRAINT chk_goal_movement_amount CHECK ((tipo = 'adjustment') OR valor > 0),
  CONSTRAINT fk_goal_movements_goal FOREIGN KEY (goal_id) REFERENCES goals (id),
  CONSTRAINT fk_goal_movements_occurrence FOREIGN KEY (occurrence_id) REFERENCES contribution_occurrences (id),
  CONSTRAINT fk_goal_movements_origin FOREIGN KEY (conta_origem_id) REFERENCES contas (id),
  CONSTRAINT fk_goal_movements_destination FOREIGN KEY (conta_destino_id) REFERENCES contas (id),
  CONSTRAINT fk_goal_movements_transfer FOREIGN KEY (transfer_id) REFERENCES internal_transfers (id),
  CONSTRAINT fk_goal_movements_reversal FOREIGN KEY (reverses_movement_id) REFERENCES goal_movements (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE card_payments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cartao_id INT NOT NULL,
  conta_id INT NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  data DATE NOT NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_card_payments_idempotency (idempotency_key),
  KEY ix_card_payments_card_date (cartao_id, data),
  CONSTRAINT chk_card_payment_amount CHECK (valor > 0),
  CONSTRAINT fk_card_payments_card FOREIGN KEY (cartao_id) REFERENCES cartoes (id),
  CONSTRAINT fk_card_payments_account FOREIGN KEY (conta_id) REFERENCES contas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE financial_alert_events (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alert_key VARCHAR(160) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  entidade_id INT DEFAULT NULL,
  mensagem VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismissed_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_financial_alert_key (alert_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;