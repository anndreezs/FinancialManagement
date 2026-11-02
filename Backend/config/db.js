/**
 * Módulo de Conexão com Banco de Dados
 * Suporta PostgreSQL (NeonDB, Render, Supabase, Local) e MySQL/MariaDB.
 * Quando DATABASE_URL estiver configurada, conecta automaticamente via PostgreSQL com SSL.
 */

const { Pool: PgPool } = require('pg');
let mysql = null;
try {
  mysql = require('mysql2');
} catch {
  // mysql2 opcional se estiver rodando puramente em postgres
}

const isPostgres = Boolean(
  process.env.DATABASE_URL ||
  process.env.DB_CLIENT === 'postgres' ||
  process.env.PGHOST
);

let dbInstance = null;

if (isPostgres) {
  // Configuração para PostgreSQL / NeonDB
  const connectionConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
        user: process.env.PGUSER || process.env.DB_USER || 'postgres',
        password: process.env.PGPASSWORD || process.env.DB_PASS || '',
        database: process.env.PGDATABASE || process.env.DB_NAME || 'financeiro',
        port: Number(process.env.PGPORT || 5432),
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
      };

  const pool = new PgPool({
    ...connectionConfig,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Tradutor universal de consultas SQL (MySQL ? -> PostgreSQL $1, $2...)
  function adaptQuery(sql, params = []) {
    let rawParams = Array.isArray(params) ? [...params] : [params];
    let adaptedSql = sql;

    // Converte ON DUPLICATE KEY UPDATE para ON CONFLICT no PostgreSQL
    if (adaptedSql.includes('financial_settings') && adaptedSql.includes('ON DUPLICATE KEY UPDATE')) {
      adaptedSql = adaptedSql
        .replace(/ON DUPLICATE KEY UPDATE[\s\S]*$/, 'ON CONFLICT (usuario_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP, percentual_seguro_bps = EXCLUDED.percentual_seguro_bps, horizonte_dias = EXCLUDED.horizonte_dias, alertas_percentuais = EXCLUDED.alertas_percentuais');
    } else if (adaptedSql.includes('financial_alert_events') && adaptedSql.includes('ON DUPLICATE KEY UPDATE')) {
      adaptedSql = adaptedSql
        .replace(/ON DUPLICATE KEY UPDATE[\s\S]*$/, 'ON CONFLICT (usuario_id, alert_key) DO UPDATE SET mensagem = EXCLUDED.mensagem');
    }

    // Trata parâmetros que sejam arrays (ex: WHERE id IN (?))
    const finalParams = [];
    let paramIndex = 1;

    adaptedSql = adaptedSql.replace(/\?/g, () => {
      if (rawParams.length === 0) return `$${paramIndex++}`;
      const nextParam = rawParams.shift();
      if (Array.isArray(nextParam)) {
        if (nextParam.length === 0) return 'NULL';
        const placeholders = nextParam.map(() => {
          finalParams.push(null); // placeholder
          return `$${paramIndex++}`;
        });
        // Atualiza os valores reais
        const start = paramIndex - nextParam.length - 1;
        nextParam.forEach((val, idx) => {
          finalParams[start + idx] = val;
        });
        return placeholders.join(', ');
      } else {
        finalParams.push(nextParam);
        return `$${paramIndex++}`;
      }
    });

    // Para INSERTs sem RETURNING, anexa RETURNING id para suportar insertId
    const isInsert = /^\s*INSERT\s+INTO/i.test(adaptedSql);
    const hasReturning = /RETURNING/i.test(adaptedSql);
    if (isInsert && !hasReturning) {
      adaptedSql += ' RETURNING id';
    }

    return { sql: adaptedSql, params: finalParams };
  }

  async function executePgQuery(clientOrPool, rawSql, rawParams) {
    const { sql, params } = adaptQuery(rawSql, rawParams);
    try {
      const res = await clientOrPool.query(sql, params);
      const rows = res.rows || [];

      // Simula formato MySQL para compatibilidade com os controllers
      const insertId = rows[0]?.id ? Number(rows[0].id) : 0;
      const affectedRows = res.rowCount || 0;

      rows.insertId = insertId;
      rows.affectedRows = affectedRows;

      const resultObject = {
        insertId,
        affectedRows,
        rowCount: affectedRows,
      };

      // Retorna [rows, fields] conforme convenção mysql2
      return [rows, resultObject];
    } catch (err) {
      // Normaliza código de violação de chave única para suportar checagem ER_DUP_ENTRY
      if (err.code === '23505') {
        err.code = 'ER_DUP_ENTRY';
      }
      throw err;
    }
  }

  // Wrapper compatível com a API do mysql2
  dbInstance = {
    // Modo Callback: db.query(sql, params, callback)
    query(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      executePgQuery(pool, sql, params)
        .then(([rows]) => {
          if (callback) callback(null, rows);
        })
        .catch((err) => {
          if (callback) callback(err);
        });
    },

    // Modo Promise: db.promise().query(sql, params)
    promise() {
      return {
        query: (sql, params) => executePgQuery(pool, sql, params),
        async getConnection() {
          const client = await pool.connect();
          return {
            beginTransaction: () => client.query('BEGIN'),
            commit: () => client.query('COMMIT'),
            rollback: () => client.query('ROLLBACK'),
            release: () => client.release(),
            query: (sql, params) => executePgQuery(client, sql, params),
          };
        },
      };
    },

    isPostgres: true,
  };
} else {
  // Modo MySQL / MariaDB (Legado)
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'financeiro',
    port: Number(process.env.DB_PORT || 3306),
  });

  dbInstance = pool;
  dbInstance.isPostgres = false;
}

module.exports = dbInstance;
