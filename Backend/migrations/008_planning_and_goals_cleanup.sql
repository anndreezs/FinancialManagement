-- Migração 008: Suporte a Exclusão e Reset de Planejamento e Metas (Cascateamento Seguro)

-- 1. Permite que exclusão de metas remova automaticamente seus planos e ocorrências
-- ou defina NULL nas transferências internas caso o comando seja rodado diretamente no banco.

SET FOREIGN_KEY_CHECKS = 0;

-- Atualiza chave de internal_transfers para SET NULL ao excluir meta
ALTER TABLE internal_transfers DROP FOREIGN KEY fk_internal_transfer_goal;
ALTER TABLE internal_transfers 
  ADD CONSTRAINT fk_internal_transfer_goal 
  FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE SET NULL;

-- Atualiza chaves de contribution_plans para CASCADE ao excluir meta
ALTER TABLE contribution_plans DROP FOREIGN KEY fk_contribution_plans_goal;
ALTER TABLE contribution_plans 
  ADD CONSTRAINT fk_contribution_plans_goal 
  FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE;

-- Atualiza chaves de contribution_occurrences para CASCADE
ALTER TABLE contribution_occurrences DROP FOREIGN KEY fk_contribution_occurrences_goal;
ALTER TABLE contribution_occurrences DROP FOREIGN KEY fk_contribution_occurrences_plan;
ALTER TABLE contribution_occurrences 
  ADD CONSTRAINT fk_contribution_occurrences_goal 
  FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE;
ALTER TABLE contribution_occurrences 
  ADD CONSTRAINT fk_contribution_occurrences_plan 
  FOREIGN KEY (plan_id) REFERENCES contribution_plans (id) ON DELETE CASCADE;

-- Atualiza chave de goal_movements para CASCADE
ALTER TABLE goal_movements DROP FOREIGN KEY fk_goal_movements_goal;
ALTER TABLE goal_movements 
  ADD CONSTRAINT fk_goal_movements_goal 
  FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
