const db = require('../config/db').promise();
const { withTransaction } = require('../services/financialStore');
const { centsToDecimal, getCardCycleRange, toCents } = require('../services/financialDomain');

/* ================= LISTAR ================= */
exports.listarCartoes = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [cards] = await db.query(
      `SELECT id, nome, limite, limite_disponivel, saldo_utilizado, fechamento,
              vencimento, conta_id, cor, limite_pessoal
       FROM cartoes 
       WHERE usuario_id = ?
       ORDER BY id`,
      [usuarioId]
    );
    const today = new Date().toISOString().slice(0, 10);
    const results = await Promise.all(cards.map(async (card) => {
      const cycle = getCardCycleRange(today, Number(card.fechamento));
      const [rows] = await db.query(
        `SELECT COALESCE(SUM(valor), 0) AS gasto
         FROM transacoes
         WHERE cartao_id = ? AND tipo = 'saida' AND forma_pagamento = 'credito'
           AND status = 'posted' AND data >= ? AND data <= ? AND usuario_id = ?`,
        [card.id, cycle.startDate, cycle.endDate, usuarioId]
      );
      return {
        ...card,
        limite: Number(card.limite),
        limite_disponivel: Number(card.limite_disponivel),
        saldo_utilizado: Number(card.saldo_utilizado),
        limite_pessoal: card.limite_pessoal === null ? null : Number(card.limite_pessoal),
        gasto_ciclo: Number(rows[0].gasto),
        ciclo_inicio: cycle.startDate,
        ciclo_fim: cycle.endDate,
      };
    }));
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar cartões e gastos do ciclo' });
  }
};

/* ================= CRIAR ================= */
exports.criarCartao = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { nome, limite, fechamento, vencimento, contaId, cor, limitePessoal } = req.body;

  if (!nome || !limite) {
    return res.status(400).json({ error: 'Nome e limite do cartão são obrigatórios' });
  }

  try {
    const [result] = await db.query(
      `
      INSERT INTO cartoes
      (nome, limite, limite_disponivel, saldo_utilizado, fechamento, vencimento, conta_id, cor, limite_pessoal, usuario_id)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `,
      [String(nome).trim(), limite, limite, fechamento, vencimento, contaId || null, cor || '#8b5cf6', limitePessoal || null, usuarioId]
    );

    res.status(201).json({
      id: result.insertId,
      nome,
      limite: Number(limite),
      limite_disponivel: Number(limite),
      saldo_utilizado: 0,
      fechamento,
      vencimento,
      conta_id: contaId || null,
      cor: cor || '#8b5cf6',
      limite_pessoal: limitePessoal || null,
      usuario_id: usuarioId,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar cartão' });
  }
};

/* ================= ATUALIZAR ================= */
exports.atualizarCartao = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { id } = req.params;
  const { nome, limite, fechamento, vencimento, contaId, cor, limitePessoal } = req.body;

  try {
    const [result] = await db.query(
      `
      UPDATE cartoes
      SET
        nome = ?,
        limite = ?,
        saldo_utilizado = GREATEST(COALESCE(saldo_utilizado, 0), 0),
        limite_disponivel = ? - GREATEST(COALESCE(saldo_utilizado, 0), 0),
        fechamento = ?,
        vencimento = ?,
        conta_id = ?,
        cor = ?,
        limite_pessoal = ?
      WHERE id = ? AND usuario_id = ?
      `,
      [nome, limite, limite, fechamento, vencimento, contaId || null, cor || null, limitePessoal || null, id, usuarioId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cartão não encontrado' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar cartão' });
  }
};

/* ================= EXCLUIR ================= */
exports.excluirCartao = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { id } = req.params;

  try {
    const [result] = await db.query('DELETE FROM cartoes WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cartão não encontrado' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Não é possível excluir cartão com transações vinculadas' });
  }
};

/* ================= PAGAMENTO AUDITÁVEL DA FATURA ================= */
exports.pagarCartao = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const cardId = Number(req.params.id);
  let amountCents;
  try {
    amountCents = req.body.valor === undefined ? null : toCents(req.body.valor);
  } catch {
    return res.status(400).json({ error: 'Valor de pagamento inválido' });
  }

  const idempotencyKey = req.body.idempotencyKey || req.get('Idempotency-Key') || null;
  try {
    const payment = await withTransaction(async (connection) => {
      if (idempotencyKey) {
        const [existing] = await connection.query('SELECT id FROM card_payments WHERE idempotency_key = ?', [idempotencyKey]);
        if (existing.length) return { id: existing[0].id, duplicado: true };
      }

      const [cards] = await connection.query('SELECT * FROM cartoes WHERE id = ? AND usuario_id = ? FOR UPDATE', [cardId, usuarioId]);
      const card = cards[0];
      if (!card) {
        const error = new Error('Cartão não encontrado');
        error.status = 404;
        throw error;
      }
      const usedCents = toCents(card.saldo_utilizado || 0);
      const paymentCents = amountCents ?? usedCents;
      const accountId = Number(req.body.contaId || card.conta_id);
      const paymentDate = req.body.data || new Date().toISOString().slice(0, 10);

      if (!Number.isInteger(accountId) || accountId < 1 || paymentCents <= 0 || paymentCents > usedCents) {
        const error = new Error('Informe conta e valor dentro da fatura pendente');
        error.status = 400;
        throw error;
      }

      const [debit] = await connection.query(
        'UPDATE contas SET saldo = saldo - ? WHERE id = ? AND usuario_id = ? AND saldo >= ?',
        [centsToDecimal(paymentCents), accountId, usuarioId, centsToDecimal(paymentCents)]
      );
      if (debit.affectedRows === 0) {
        const error = new Error('Conta não encontrada ou sem saldo suficiente');
        error.status = 400;
        throw error;
      }

      const remainingCents = usedCents - paymentCents;
      await connection.query(
        'UPDATE cartoes SET saldo_utilizado = ?, limite_disponivel = ? WHERE id = ? AND usuario_id = ?',
        [centsToDecimal(remainingCents), centsToDecimal(toCents(card.limite) - remainingCents), cardId, usuarioId]
      );
      const [result] = await connection.query(
        `INSERT INTO card_payments (cartao_id, conta_id, valor, data, idempotency_key)
         VALUES (?, ?, ?, ?, ?)`,
        [cardId, accountId, centsToDecimal(paymentCents), paymentDate, idempotencyKey]
      );
      return {
        id: result.insertId,
        cartaoId: cardId,
        contaId: accountId,
        valorCentavos: paymentCents,
        saldoUtilizadoCentavos: remainingCents,
      };
    });
    res.json(payment);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' && idempotencyKey) {
      const [rows] = await db.query('SELECT id FROM card_payments WHERE idempotency_key = ?', [idempotencyKey]);
      return res.json({ id: rows[0]?.id, duplicado: true });
    }
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível pagar a fatura' });
  }
};

exports.listarPagamentos = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.cartao_id, p.conta_id, p.valor, p.data, p.created_at 
       FROM card_payments p
       JOIN cartoes c ON c.id = p.cartao_id
       WHERE p.cartao_id = ? AND c.usuario_id = ? 
       ORDER BY p.data DESC, p.id DESC`,
      [req.params.id, usuarioId]
    );
    res.json(rows.map((row) => ({
      id: row.id,
      cartaoId: row.cartao_id,
      contaId: row.conta_id,
      valorCentavos: toCents(row.valor),
      data: row.data instanceof Date ? row.data.toISOString().slice(0, 10) : String(row.data).slice(0, 10),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar pagamentos de fatura' });
  }
};
