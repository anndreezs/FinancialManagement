ALTER TABLE goals
  ADD COLUMN idempotency_key VARCHAR(80) DEFAULT NULL,
  ADD UNIQUE KEY uq_goals_idempotency (idempotency_key);

ALTER TABLE contribution_plans
  ADD COLUMN idempotency_key VARCHAR(80) DEFAULT NULL,
  ADD UNIQUE KEY uq_contribution_plans_idempotency (idempotency_key);