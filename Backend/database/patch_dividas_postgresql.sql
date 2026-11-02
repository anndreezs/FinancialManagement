-- ==============================================================================
-- PATCH: Atualização da tabela dividas para PostgreSQL / NeonDB
-- Execute este script no SQL Editor do NeonDB caso já tenha executado
-- o schema_postgresql.sql anteriormente.
-- ==============================================================================

-- 1. Adiciona as colunas necessárias para as dívidas
ALTER TABLE dividas ADD COLUMN IF NOT EXISTS valor NUMERIC(12,2) DEFAULT NULL;
ALTER TABLE dividas ADD COLUMN IF NOT EXISTS categoria_id INT DEFAULT NULL REFERENCES categorias (id) ON DELETE SET NULL;
ALTER TABLE dividas ADD COLUMN IF NOT EXISTS tipo_divida VARCHAR(20) NOT NULL DEFAULT 'fixa';
ALTER TABLE dividas ADD COLUMN IF NOT EXISTS parcela_total INT DEFAULT NULL;
ALTER TABLE dividas ADD COLUMN IF NOT EXISTS parcela_atual INT DEFAULT NULL;

-- 2. Preenche 'valor' com valor_restante ou valor_total caso estejam presentes
UPDATE dividas 
SET valor = COALESCE(valor, valor_restante, valor_total, 0.00) 
WHERE valor IS NULL;

-- 3. Define valor padrão e restrição
ALTER TABLE dividas ALTER COLUMN valor SET DEFAULT 0.00;

-- 4. Cria índice para categoria_id se não existir
CREATE INDEX IF NOT EXISTS ix_dividas_categoria ON dividas (categoria_id);
