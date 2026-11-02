const db = require('../config/db').promise();
const { withTransaction } = require('../services/financialStore');
const { centsToDecimal, parseIsoDate, toCents } = require('../services/financialDomain');
const { registerCardExpense } = require('../services/financialOperations');

exports.listarTransacoes = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [rows] = await db.query(
      "SELECT * FROM transacoes WHERE status = 'posted' AND usuario_id = ? ORDER BY data DESC, id DESC",
      [usuarioId]
    );
    res.json(rows.map((transaction) => ({
      id: transaction.id,
      descricao: transaction.descricao,
      valor: Number(transaction.valor),
      data: parseIsoDate(transaction.data).split('-').reverse().join('-'),
      categoriaId: transaction.categoria_id,
      formaPagamento: transaction.forma_pagamento?.toUpperCase() || 'PIX',
      tipo: transaction.tipo === 'entrada' ? 'RECEITA' : 'DESPESA',
      contaId: transaction.conta_id,
      cartaoId: transaction.cartao_id,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar as transações' });
  }
};

exports.criarTransacao = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const {
    tipo,
    valor,
    data,
    descricao,
    categoriaId,
    categoria_id,
    formaPagamento,
    forma_pagamento,
    contaId = null,
    conta_id = null,
    cartaoId = null,
    cartao_id = null,
  } = req.body;
  const categoriaFinal = categoriaId ?? categoria_id ?? null;
  const formaPagamentoFinal = (formaPagamento || forma_pagamento || 'PIX').toLowerCase();
  const contaFinal = contaId ?? conta_id ?? null;
  const cartaoFinal = cartaoId ?? cartao_id ?? null;
  const idempotencyKey = req.body.idempotencyKey || req.get('Idempotency-Key') || null;
  let amountCents;

  try {
    amountCents = toCents(valor);
    parseIsoDate(data);
  } catch {
    return res.status(400).json({ message: 'Valor ou data inválidos' });
  }

  if (!['RECEITA', 'DESPESA'].includes(tipo) || amountCents <= 0) {
    return res.status(400).json({ message: 'O valor da transação deve ser positivo' });
  }
  if (tipo === 'RECEITA' && !contaFinal) {
    return res.status(400).json({ message: 'Receita exige conta bancária' });
  }
  if (tipo === 'DESPESA' && !contaFinal && !cartaoFinal) {
    return res.status(400).json({ message: 'Despesa exige conta ou cartão' });
  }
  if (!['dinheiro', 'debito', 'credito', 'pix', 'transferencia'].includes(formaPagamentoFinal)) {
    return res.status(400).json({ message: 'Forma de pagamento inválida' });
  }
  if ((formaPagamentoFinal === 'credito') !== Boolean(cartaoFinal)) {
    return res.status(400).json({ message: 'Selecione cartão somente para compras no crédito' });
  }

  try {
    const result = await withTransaction(async (connection) => {
      if (idempotencyKey) {
        const [existing] = await connection.query('SELECT id FROM transacoes WHERE idempotency_key = ?', [idempotencyKey]);
        if (existing.length) return { id: existing[0].id, duplicado: true, alertas: [] };
      }

      if (categoriaFinal) {
        const [categories] = await connection.query('SELECT tipo FROM categorias WHERE id = ? AND usuario_id = ?', [categoriaFinal, usuarioId]);
        if (!categories.length || categories[0].tipo !== (tipo === 'RECEITA' ? 'RECEITA' : 'DESPESA')) {
          const error = new Error('Categoria incompatível ou não encontrada');
          error.status = 400;
          throw error;
        }
      }

      if (contaFinal) {
        const [accounts] = await connection.query('SELECT id FROM contas WHERE id = ? AND usuario_id = ? FOR UPDATE', [contaFinal, usuarioId]);
        if (!accounts.length) {
          const error = new Error('Conta não encontrada');
          error.status = 404;
          throw error;
        }
      }

      const [insert] = await connection.query(
        `INSERT INTO transacoes
         (tipo, valor, data, descricao, forma_pagamento, conta_id, cartao_id, categoria_id, idempotency_key, status, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)`,
        [tipo === 'RECEITA' ? 'entrada' : 'saida', centsToDecimal(amountCents), data, descricao,
          formaPagamentoFinal, contaFinal, cartaoFinal, categoriaFinal, idempotencyKey, usuarioId]
      );

      if (contaFinal) {
        const operator = tipo === 'RECEITA' ? '+' : '-';
        await connection.query(
          `UPDATE contas SET saldo = saldo ${operator} ? WHERE id = ? AND usuario_id = ?`,
          [centsToDecimal(amountCents), contaFinal, usuarioId]
        );
      }

      const cardResult = tipo === 'DESPESA' && cartaoFinal
        ? await registerCardExpense(connection, { cardId: cartaoFinal, amountCents, transactionId: insert.insertId, transactionDate: data, usuarioId })
        : { alerts: [], exceededPersonalLimit: false };

      return {
        id: insert.insertId,
        alertas: cardResult.alerts,
        excedeLimitePessoal: cardResult.exceededPersonalLimit,
      };
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' && idempotencyKey) {
      const [rows] = await db.query('SELECT id FROM transacoes WHERE idempotency_key = ?', [idempotencyKey]);
      return res.json({ id: rows[0]?.id, duplicado: true, alertas: [] });
    }
    res.status(error.status || 500).json({ message: error.message || 'Não foi possível criar a transação' });
  }
};

exports.deletarTransacao = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { id } = req.params;
  try {
    await withTransaction(async (connection) => {
      const [rows] = await connection.query(
        "SELECT * FROM transacoes WHERE id = ? AND usuario_id = ? AND status = 'posted' FOR UPDATE",
        [id, usuarioId]
      );
      const transaction = rows[0];
      if (!transaction) {
        const error = new Error('Transação não encontrada ou já cancelada');
        error.status = 404;
        throw error;
      }
      const amountCents = toCents(transaction.valor);

      if (transaction.conta_id) {
        const operator = transaction.tipo === 'entrada' ? '-' : '+';
        await connection.query(
          `UPDATE contas SET saldo = saldo ${operator} ? WHERE id = ? AND usuario_id = ?`,
          [centsToDecimal(amountCents), transaction.conta_id, usuarioId]
        );
      }

      if (transaction.cartao_id && transaction.tipo === 'saida') {
        const [cards] = await connection.query('SELECT * FROM cartoes WHERE id = ? AND usuario_id = ? FOR UPDATE', [transaction.cartao_id, usuarioId]);
        const card = cards[0];
        if (card) {
          const remainingCents = Math.max(0, toCents(card.saldo_utilizado || 0) - amountCents);
          await connection.query(
            'UPDATE cartoes SET saldo_utilizado = ?, limite_disponivel = ? WHERE id = ? AND usuario_id = ?',
            [centsToDecimal(remainingCents), centsToDecimal(toCents(card.limite) - remainingCents), transaction.cartao_id, usuarioId]
          );
        }
      }

      await connection.query("UPDATE transacoes SET status = 'cancelled' WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
    });
    res.status(204).send();
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Não foi possível cancelar a transação' });
  }
};
