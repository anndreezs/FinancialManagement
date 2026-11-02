-- A coluna armazena classes Tailwind de gradiente, que excedem o limite
-- original de 20 caracteres.
ALTER TABLE cartoes ALTER COLUMN cor TYPE VARCHAR(50);
