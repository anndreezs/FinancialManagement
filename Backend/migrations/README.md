# Migrações do banco

O projeto usa MySQL/MariaDB, mas não possui runner de migrações. Depois de importar `financeiro_backup.sql`, confira se `cartoes.cor` já existe. O backup atualizado já inclui essa coluna; execute `001_add_cor_to_cartoes.sql` somente em uma base antiga onde ela esteja ausente. Em seguida, execute uma vez, em ordem, os demais arquivos:

1. `002_integrated_finance.sql`
2. `003_auditable_transactions.sql`
3. `004_create_dividas_if_missing.sql`
4. `005_goal_idempotency.sql`

Exemplo no terminal, solicitando a senha sem gravá-la no comando:

```sh
mysql --host="$DB_HOST" --user="$DB_USER" --password "$DB_NAME" < migrations/001_add_cor_to_cartoes.sql
```

Repita o comando para cada arquivo, substituindo o nome. Use uma cópia de segurança antes de migrar um banco com dados importantes. As migrações são aditivas; não recriam as tabelas financeiras existentes. O MySQL/MariaDB executa DDL fora de transações, portanto uma falha no meio de uma migração precisa ser conferida no schema antes de tentar novamente.

`004_create_dividas_if_missing.sql` existe porque o dump inicial do projeto não contém a tabela `dividas`, embora a aplicação já dependa dela. Em bases que já possuem a tabela, `CREATE TABLE IF NOT EXISTS` não altera seus registros.

Não há rollback automático: remover tabelas de metas, contribuições, pagamentos ou transferências apagaria histórico financeiro. Faça uma cópia de segurança e planeje qualquer reversão de forma específica para o ambiente.