ALTER TABLE transacoes
  ADD COLUMN status ENUM('posted','cancelled','reversed') NOT NULL DEFAULT 'posted',
  ADD COLUMN reverses_transaction_id INT DEFAULT NULL,
  ADD KEY ix_transacoes_status_date (status, data),
  ADD CONSTRAINT fk_transacoes_reversal FOREIGN KEY (reverses_transaction_id) REFERENCES transacoes (id);