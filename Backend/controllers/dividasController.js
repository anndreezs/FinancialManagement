const db = require('../config/db').promise();
const { withTransaction } = require('../services/financialStore');
const { addMonths, centsToDecimal, parseIsoDate, toCents } = require('../services/financialDomain');
const { registerCardExpense } = require('../services/financialOperations');

/* =========================
   LISTAR DÍVIDAS POR MÊS
========================= */
exports.listarDividas = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { mes, ano } = req.query;
  const temMes = mes !== undefined && mes !== '';
  const temAno = ano !== undefined && ano !== '';

  if (temMes !== temAno) {
    return res.status(400).json({ error: 'Informe mes e ano juntos' });
  }

  const params = [usuarioId];
  let filtroPeriodo = 'WHERE d.usuario_id = ?';

  if (temMes) {
    const mesNumero = Number(mes);
    const anoNumero = Number(ano);
    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12 || !Number.isInteger(anoNumero)) {
      return res.status(400).json({ error: 'Período inválido' });
    }
    filtroPeriodo += ' AND MONTH(d.data_vencimento) = ? AND YEAR(d.data_vencimento) = ?';
    params.push(mesNumero, anoNumero);
  }

  const query = `
    SELECT 
      d.id,
      d.descricao,
      d.valor,
      d.data_vencimento AS dataVencimento,
      d.status,
      UPPER(d.tipo_divida) AS tipoDivida,
      d.parcela_atual AS parcelaAtual,
      d.parcela_total AS parcelaTotal,
      d.categoria_id AS categoriaId,
      c.nome AS categoria,
      c.cor
    FROM dividas d
    JOIN categorias c ON c.id = d.categoria_id
    ${filtroPeriodo}
    ORDER BY d.data_vencimento
  `;

  try {
    const [results] = await db.query(query, params);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar dívidas' });
  }
};

/* =========================
   CRIAR DÍVIDA
========================= */
exports.criarDivida = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const {
    descricao,
    valor,
    data_vencimento,
    categoria_id,
    tipo_divida,
    parcela_total
  } = req.body;

  let amountCents;
  try {
    amountCents = toCents(valor);
    parseIsoDate(data_vencimento);
  } catch {
    return res.status(400).json({ error: 'Valor ou vencimento inválido' });
  }
  const installmentCount = Number(parcela_total);
  if (!descricao?.trim() || amountCents <= 0 || !categoria_id
    || !['fixa', 'parcelada'].includes(tipo_divida)
    || (tipo_divida === 'parcelada' && (!Number.isInteger(installmentCount) || installmentCount < 2 || installmentCount > 120))) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  try {
    const created = await withTransaction(async (connection) => {
      const [categories] = await connection.query('SELECT nome, cor, tipo FROM categorias WHERE id = ? AND usuario_id = ?', [categoria_id, usuarioId]);
      const category = categories[0];
      if (!category || category.tipo !== 'DESPESA') {
        const error = new Error('Categoria inválida para dívida');
        error.status = 400;
        throw error;
      }

      const count = tipo_divida === 'parcelada' ? installmentCount : 1;
      const rows = [];
      const preferredDay = Number(data_vencimento.slice(8, 10));
      for (let index = 1; index <= count; index += 1) {
        const dueDate = tipo_divida === 'parcelada'
          ? addMonths(data_vencimento, index - 1, preferredDay)
          : data_vencimento;
        const [result] = await connection.query(
          `INSERT INTO dividas
           (descricao, valor, valor_total, data_vencimento, categoria_id, tipo_divida, parcela_total, parcela_atual, status, usuario_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`,
          [descricao.trim(), centsToDecimal(amountCents), centsToDecimal(amountCents), dueDate, categoria_id,
            tipo_divida, tipo_divida === 'parcelada' ? count : null,
            tipo_divida === 'parcelada' ? index : null, usuarioId]
        );
        rows.push({
          id: result.insertId,
          descricao: descricao.trim(),
          valor: Number(centsToDecimal(amountCents)),
          dataVencimento: dueDate,
          status: 'pendente',
          tipoDivida: tipo_divida.toUpperCase(),
          parcelaAtual: tipo_divida === 'parcelada' ? index : null,
          parcelaTotal: tipo_divida === 'parcelada' ? count : null,
          categoriaId: Number(categoria_id),
          categoria: category.nome,
          cor: category.cor,
        });
      }
      return rows;
    });
    res.status(201).json(tipo_divida === 'parcelada' ? created : created[0]);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível criar a dívida' });
  }
};

/* =========================
   DELETAR DÍVIDA
========================= */
exports.deletarDivida = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { id } = req.params;

  try {
    const [result] = await db.query(
      'DELETE FROM dividas WHERE id = ? AND usuario_id = ? AND status = "pendente"',
      [id, usuarioId]
    );
    if (result.affectedRows === 0) {
      return res.status(400).json({ error: 'Dívida não encontrada ou não pode ser removida' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir dívida' });
  }
};

/* =========================
   PAGAR DÍVIDA
========================= */
exports.pagarDivida = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const debtId = Number(req.params.id);
  const accountId = req.body.conta_id ? Number(req.body.conta_id) : null;
  const cardId = req.body.cartao_id ? Number(req.body.cartao_id) : null;
  const paymentMethod = String(req.body.forma_pagamento || '').toLowerCase();
  const date = req.body.data || new Date().toISOString().slice(0, 10);

  if (!['dinheiro', 'debito', 'credito', 'pix', 'transferencia'].includes(paymentMethod)
    || (paymentMethod === 'credito' && !cardId)
    || (paymentMethod !== 'credito' && !accountId)) {
    return res.status(400).json({ error: 'Informe uma forma de pagamento e a conta ou cartão correspondente' });
  }

  try {
    const result = await withTransaction(async (connection) => {
      const idempotencyKey = `debt-payment:${debtId}`;
      const [existing] = await connection.query('SELECT id FROM transacoes WHERE idempotency_key = ?', [idempotencyKey]);
      if (existing.length) return { transacaoId: existing[0].id, duplicado: true };

      const [rows] = await connection.query(
        'SELECT * FROM dividas WHERE id = ? AND usuario_id = ? AND status = \'pendente\' FOR UPDATE',
        [debtId, usuarioId]
      );
      const debt = rows[0];
      if (!debt) {
        const error = new Error('Dívida inválida ou já paga');
        error.status = 409;
        throw error;
      }

      const amountCents = toCents(debt.valor);
      await connection.query('UPDATE dividas SET status = \'paga\' WHERE id = ? AND usuario_id = ?', [debtId, usuarioId]);
      const [transaction] = await connection.query(
        `INSERT INTO transacoes
         (tipo, valor, data, descricao, forma_pagamento, conta_id, cartao_id, categoria_id, idempotency_key, status, usuario_id)
         VALUES ('saida', ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)`,
        [centsToDecimal(amountCents), date, debt.descricao, paymentMethod, accountId, cardId,
          debt.categoria_id, idempotencyKey, usuarioId]
      );

      const cardResult = cardId
        ? await registerCardExpense(connection, { cardId, amountCents, transactionId: transaction.insertId, transactionDate: date, usuarioId })
        : { alerts: [] };

      if (accountId) {
        const [accountUpdate] = await connection.query(
          'UPDATE contas SET saldo = saldo - ? WHERE id = ? AND usuario_id = ? AND saldo >= ?',
          [centsToDecimal(amountCents), accountId, usuarioId, centsToDecimal(amountCents)]
        );
        if (accountUpdate.affectedRows === 0) {
          const error = new Error('Conta não encontrada ou sem saldo suficiente');
          error.status = 400;
          throw error;
        }
      }

      return { transacaoId: transaction.insertId, alertas: cardResult.alerts };
    });
    res.json({ message: 'Dívida paga com sucesso', ...result });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível pagar a dívida' });
  }
};
