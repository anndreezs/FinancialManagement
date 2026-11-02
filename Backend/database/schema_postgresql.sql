-- ==============================================================================
-- SISTEMA DE GESTÃO FINANCEIRA - SCHEMA POSTGRESQL (NEON DB / RENDER / LOCAL)
-- ==============================================================================
-- Este script cria todas as tabelas, tipos, funções auxiliares e índices necessários.
-- Pode ser executado diretamente no SQL Editor do NeonDB, pgAdmin, DBeaver ou psql.
-- ==============================================================================

-- 1. Funções de compatibilidade para extração de Mês e Ano
CREATE OR REPLACE FUNCTION MONTH(d DATE) RETURNS INTEGER AS $$
  SELECT EXTRACT(MONTH FROM d)::INTEGER;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION MONTH(ts TIMESTAMP) RETURNS INTEGER AS $$
  SELECT EXTRACT(MONTH FROM ts)::INTEGER;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION YEAR(d DATE) RETURNS INTEGER AS $$
  SELECT EXTRACT(YEAR FROM d)::INTEGER;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION YEAR(ts TIMESTAMP) RETURNS INTEGER AS $$
  SELECT EXTRACT(YEAR FROM ts)::INTEGER;
$$ LANGUAGE SQL IMMUTABLE;

-- 2. Tabela de Usuários (Autenticação JWT)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Contas Bancárias / Carteiras
CREATE TABLE IF NOT EXISTS contas (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  saldo NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  cor VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela de Cartões de Crédito
CREATE TABLE IF NOT EXISTS cartoes (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  limite NUMERIC(12,2) NOT NULL,
  limite_pessoal NUMERIC(12,2) DEFAULT NULL,
  fechamento SMALLINT NOT NULL,
  vencimento SMALLINT NOT NULL,
  cor VARCHAR(20) DEFAULT NULL,
  conta_id INT DEFAULT NULL REFERENCES contas (id) ON DELETE SET NULL,
  saldo_utilizado NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  limite_disponivel NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_cartoes_fechamento CHECK (fechamento BETWEEN 1 AND 31),
  CONSTRAINT chk_cartoes_vencimento CHECK (vencimento BETWEEN 1 AND 31),
  CONSTRAINT chk_cartoes_limite CHECK (limite > 0),
  CONSTRAINT chk_cartoes_limite_pessoal CHECK (limite_pessoal IS NULL OR limite_pessoal > 0)
);

-- 5. Tabela de Categorias
CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  cor VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabela de Dívidas e Empréstimos
CREATE TABLE IF NOT EXISTS dividas (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  descricao VARCHAR(255) NOT NULL,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  valor_total NUMERIC(12,2) DEFAULT NULL,
  valor_restante NUMERIC(12,2) DEFAULT NULL,
  data_vencimento DATE NOT NULL,
  categoria_id INT DEFAULT NULL REFERENCES categorias (id) ON DELETE SET NULL,
  tipo_divida VARCHAR(20) NOT NULL DEFAULT 'fixa',
  parcela_total INT DEFAULT NULL,
  parcela_atual INT DEFAULT NULL,
  parcelas_totais INT NOT NULL DEFAULT 1,
  parcelas_pagas INT NOT NULL DEFAULT 0,
  credor VARCHAR(100) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  conta_id INT DEFAULT NULL REFERENCES contas (id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_dividas_valor CHECK (valor >= 0)
);

-- 7. Tabela de Metas Financeiras
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT DEFAULT NULL,
  valor_alvo NUMERIC(12,2) NOT NULL,
  data_inicio DATE NOT NULL,
  data_limite DATE NOT NULL,
  finalidade VARCHAR(80) DEFAULT NULL,
  conta_id INT DEFAULT NULL REFERENCES contas (id) ON DELETE SET NULL,
  observacoes TEXT DEFAULT NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_goals_target CHECK (valor_alvo > 0),
  CONSTRAINT chk_goals_dates CHECK (data_limite >= data_inicio)
);

-- 8. Tabela de Planos de Contribuição de Metas
CREATE TABLE IF NOT EXISTS contribution_plans (
  id SERIAL PRIMARY KEY,
  goal_id INT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  metodo VARCHAR(30) NOT NULL,
  frequencia VARCHAR(20) NOT NULL,
  data_inicio DATE NOT NULL,
  data_limite DATE NOT NULL,
  dia_preferencial SMALLINT DEFAULT NULL,
  valor_fixo NUMERIC(12,2) DEFAULT NULL,
  incremento_bps SMALLINT NOT NULL DEFAULT 0,
  valores_personalizados TEXT DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  idempotency_key VARCHAR(80) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_contribution_plans_dates CHECK (data_limite >= data_inicio),
  CONSTRAINT chk_contribution_plans_day CHECK (dia_preferencial IS NULL OR dia_preferencial BETWEEN 1 AND 31),
  CONSTRAINT chk_contribution_plans_fixed CHECK (valor_fixo IS NULL OR valor_fixo > 0)
);

-- 9. Tabela de Ocorrências Planejadas de Metas
CREATE TABLE IF NOT EXISTS contribution_occurrences (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES contribution_plans (id) ON DELETE CASCADE,
  goal_id INT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  data_prevista DATE NOT NULL,
  valor_planejado NUMERIC(12,2) NOT NULL,
  valor_contribuido NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ajuste_manual SMALLINT NOT NULL DEFAULT 0,
  observacao VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_contribution_occurrence_date UNIQUE (plan_id, data_prevista),
  CONSTRAINT chk_contribution_occurrence_amount CHECK (valor_planejado > 0 AND valor_contribuido >= 0)
);

-- 10. Tabela de Transferências Internas entre Contas
CREATE TABLE IF NOT EXISTS internal_transfers (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  conta_origem_id INT NOT NULL REFERENCES contas (id) ON DELETE CASCADE,
  conta_destino_id INT NOT NULL REFERENCES contas (id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL,
  data DATE NOT NULL,
  descricao VARCHAR(255) DEFAULT NULL,
  goal_id INT DEFAULT NULL REFERENCES goals (id) ON DELETE SET NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_internal_transfer_amount CHECK (valor > 0),
  CONSTRAINT chk_internal_transfer_accounts CHECK (conta_origem_id <> conta_destino_id)
);

-- 11. Tabela de Movimentações de Metas (Aportes, Resgates, Estornos)
CREATE TABLE IF NOT EXISTS goal_movements (
  id SERIAL PRIMARY KEY,
  goal_id INT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  occurrence_id INT DEFAULT NULL REFERENCES contribution_occurrences (id) ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL,
  modalidade VARCHAR(20) NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  data DATE NOT NULL,
  conta_origem_id INT DEFAULT NULL REFERENCES contas (id) ON DELETE SET NULL,
  conta_destino_id INT DEFAULT NULL REFERENCES contas (id) ON DELETE SET NULL,
  transfer_id INT DEFAULT NULL REFERENCES internal_transfers (id) ON DELETE SET NULL UNIQUE,
  reverses_movement_id INT DEFAULT NULL REFERENCES goal_movements (id) ON DELETE SET NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL UNIQUE,
  observacao VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'posted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_goal_movement_amount CHECK ((tipo = 'adjustment') OR valor > 0)
);

-- 12. Tabela de Transações Reais
CREATE TABLE IF NOT EXISTS transacoes (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  descricao VARCHAR(255) NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  data DATE NOT NULL,
  forma_pagamento VARCHAR(50) NOT NULL,
  categoria_id INT DEFAULT NULL REFERENCES categorias (id) ON DELETE SET NULL,
  conta_id INT DEFAULT NULL REFERENCES contas (id) ON DELETE SET NULL,
  cartao_id INT DEFAULT NULL REFERENCES cartoes (id) ON DELETE SET NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'posted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. Tabela de Pagamentos de Fatura de Cartão
CREATE TABLE IF NOT EXISTS card_payments (
  id SERIAL PRIMARY KEY,
  cartao_id INT NOT NULL REFERENCES cartoes (id) ON DELETE CASCADE,
  conta_id INT NOT NULL REFERENCES contas (id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL,
  data DATE NOT NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_card_payment_amount CHECK (valor > 0)
);

-- 14. Tabela de Configurações de Segurança Financeira / Saldo Seguro
CREATE TABLE IF NOT EXISTS financial_settings (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL DEFAULT 1 UNIQUE,
  percentual_seguro_bps SMALLINT NOT NULL DEFAULT 7000,
  horizonte_dias SMALLINT NOT NULL DEFAULT 30,
  alertas_percentuais VARCHAR(100) NOT NULL DEFAULT '50,70,80,90,100',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_financial_settings_percent CHECK (percentual_seguro_bps <= 10000),
  CONSTRAINT chk_financial_settings_horizon CHECK (horizonte_dias BETWEEN 1 AND 366)
);

-- 15. Tabela de Lançamentos Previstos (Compromissos e Receitas Futuras)
CREATE TABLE IF NOT EXISTS planned_movements (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  data_prevista DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  categoria_id INT DEFAULT NULL REFERENCES categorias (id) ON DELETE SET NULL,
  conta_id INT DEFAULT NULL REFERENCES contas (id) ON DELETE SET NULL,
  idempotency_key VARCHAR(80) DEFAULT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_planned_movements_amount CHECK (valor > 0)
);

-- 16. Tabela de Eventos de Alerta e Notificações (com suporte a e-mail)
CREATE TABLE IF NOT EXISTS financial_alert_events (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  alert_key VARCHAR(120) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  entidade_id INT DEFAULT NULL,
  mensagem VARCHAR(255) NOT NULL,
  lido_em TIMESTAMP NULL DEFAULT NULL,
  enviado_email_em TIMESTAMP NULL DEFAULT NULL,
  dismissed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_alert_events_user_key UNIQUE (usuario_id, alert_key)
);

-- ==============================================================================
-- 17. ÍNDICES DE PERFORMANCE (Otimização para consultas com filtros)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS ix_contas_usuario ON contas (usuario_id);
CREATE INDEX IF NOT EXISTS ix_cartoes_usuario ON cartoes (usuario_id);
CREATE INDEX IF NOT EXISTS ix_categorias_usuario ON categorias (usuario_id);
CREATE INDEX IF NOT EXISTS ix_dividas_usuario ON dividas (usuario_id, data_vencimento);
CREATE INDEX IF NOT EXISTS ix_dividas_categoria ON dividas (categoria_id);
CREATE INDEX IF NOT EXISTS ix_transacoes_usuario_data ON transacoes (usuario_id, data);
CREATE INDEX IF NOT EXISTS ix_transacoes_status ON transacoes (status);
CREATE INDEX IF NOT EXISTS ix_goals_usuario ON goals (usuario_id);
CREATE INDEX IF NOT EXISTS ix_planned_movements_usuario_date ON planned_movements (usuario_id, data_prevista);
CREATE INDEX IF NOT EXISTS ix_alert_events_usuario ON financial_alert_events (usuario_id, dismissed_at);
CREATE INDEX IF NOT EXISTS ix_internal_transfers_usuario ON internal_transfers (usuario_id, data);
CREATE INDEX IF NOT EXISTS ix_goal_movements_goal ON goal_movements (goal_id, data);
