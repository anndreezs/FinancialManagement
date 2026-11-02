const db = require('../config/db');

exports.relatorioMensal = (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { mes, ano } = req.query;

  if (!mes || !ano) {
    return res.status(400).json({
      error: 'Parâmetros mes e ano são obrigatórios'
    });
  }

  const sql = `
    SELECT
      t.id,
      t.tipo,
      t.valor,
      t.data,
      t.descricao,
      t.forma_pagamento,

      c.nome AS categoria_nome,
      co.nome AS conta_nome,
      ca.nome AS cartao_nome

    FROM transacoes t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    LEFT JOIN contas     co ON co.id = t.conta_id
    LEFT JOIN cartoes    ca ON ca.id = t.cartao_id

    WHERE
      t.status = 'posted'
      AND t.usuario_id = ?
      AND MONTH(t.data) = ?
      AND YEAR(t.data) = ?

    ORDER BY
      c.nome ASC,
      t.data ASC
  `;

  db.query(sql, [usuarioId, mes, ano], (err, rows) => {
    if (err) {
      return res.status(500).json(err);
    }

    const categorias = {};
    let totalEntradas = 0;
    let totalSaidas = 0;

    rows.forEach(t => {
      const categoria = t.categoria_nome || 'Sem categoria';

      if (!categorias[categoria]) {
        categorias[categoria] = {
          categoria,
          total: 0,
          transacoes: []
        };
      }

      const valor = Number(t.valor);

      // normalização defensiva do tipo
      const tipoNormalizado =
      t.tipo === 'entrada' ? 'entrada' :
      t.tipo === 'saida'   ? 'saida'   :
      'saida'; // fallback seguro


      categorias[categoria].transacoes.push({
        id: t.id,
        data: t.data,
        descricao: t.descricao,
        valor,
        tipo: tipoNormalizado,
        forma_pagamento: t.forma_pagamento,
        conta: t.conta_nome || null,
        cartao: t.cartao_nome || null
      });

      categorias[categoria].total += valor;

      if (tipoNormalizado === 'entrada') {
        totalEntradas += valor;
      } else {
        totalSaidas += valor;
      }
    });

    res.json({
      mes: Number(mes),
      ano: Number(ano),
      resumo: {
        total_entradas: totalEntradas,
        total_saidas: totalSaidas,
        saldo_mes: totalEntradas - totalSaidas
      },
      categorias: Object.values(categorias)
    });
  });
};

exports.saldoGeral = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [accounts] = await db.promise().query('SELECT COALESCE(SUM(saldo), 0) AS total FROM contas WHERE usuario_id = ?', [usuarioId]);
    const [cards] = await db.promise().query('SELECT COALESCE(SUM(saldo_utilizado), 0) AS total FROM cartoes WHERE usuario_id = ?', [usuarioId]);
    const totalContas = Number(accounts[0].total);
    const totalCartoes = Number(cards[0].total);
    res.json({ totalContas, totalCartoes, saldoGeral: totalContas - totalCartoes });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar o saldo consolidado' });
  }
};

exports.saldoContas = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [rows] = await db.promise().query('SELECT id, nome, saldo FROM contas WHERE usuario_id = ? ORDER BY nome', [usuarioId]);
    res.json(rows.map((row) => ({ ...row, saldo: Number(row.saldo) })));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar os saldos das contas' });
  }
};

exports.saldoCartoes = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [rows] = await db.promise().query(
      `SELECT id, nome, limite, saldo_utilizado AS usado, limite_disponivel AS disponivel
       FROM cartoes WHERE usuario_id = ? ORDER BY nome`
    );
    res.json(rows.map((row) => ({
      ...row,
      limite: Number(row.limite),
      usado: Number(row.usado),
      disponivel: Number(row.disponivel),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar os saldos dos cartões' });
  }
};
