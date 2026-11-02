const { centsToDecimal, getCardCycleRange, toCents } = require('./financialDomain');
const { registerAlertEvent } = require('./notificationService');

async function registerCardExpense(connection, { cardId, amountCents, transactionId, transactionDate, usuarioId = 1 }) {
  const [cards] = await connection.query('SELECT * FROM cartoes WHERE id = ? FOR UPDATE', [cardId]);
  const card = cards[0];
  if (!card) {
    const error = new Error('Cartão não encontrado');
    error.status = 404;
    throw error;
  }

  const previousUsedCents = Math.max(0, toCents(card.saldo_utilizado || 0));
  const bankLimitCents = toCents(card.limite);
  if (previousUsedCents + amountCents > bankLimitCents) {
    const error = new Error('A compra ultrapassa o limite bancário cadastrado');
    error.status = 400;
    throw error;
  }

  const nextUsedCents = previousUsedCents + amountCents;
  await connection.query(
    'UPDATE cartoes SET saldo_utilizado = ?, limite_disponivel = ? WHERE id = ?',
    [centsToDecimal(nextUsedCents), centsToDecimal(bankLimitCents - nextUsedCents), cardId]
  );

  const cycle = getCardCycleRange(transactionDate, Number(card.fechamento));
  const [cycleRows] = await connection.query(
    `SELECT COALESCE(SUM(valor), 0) AS gasto
     FROM transacoes
     WHERE cartao_id = ? AND tipo = 'saida' AND forma_pagamento = 'credito'
       AND status = 'posted' AND data >= ? AND data <= ? AND id <> ?`,
    [cardId, cycle.startDate, cycle.endDate, transactionId]
  );
  const previousCycleSpendCents = toCents(cycleRows[0].gasto || 0);
  const nextCycleSpendCents = previousCycleSpendCents + amountCents;
  const personalLimitCents = card.limite_pessoal ? toCents(card.limite_pessoal) : 0;
  const alerts = [];
  if (personalLimitCents > 0) {
    const [settings] = await connection.query('SELECT alertas_percentuais FROM financial_settings WHERE usuario_id = ? LIMIT 1', [usuarioId]);
    const alertasRaw = settings[0]?.alertas_percentuais || '50,70,80,90,100';
    const thresholds = alertasRaw.split(',').map(Number).filter(Number.isFinite);
    const beforeBps = Math.floor(previousCycleSpendCents * 10000 / personalLimitCents);
    const afterBps = Math.floor(nextCycleSpendCents * 10000 / personalLimitCents);
    const crossed = thresholds.filter((threshold) => beforeBps < threshold * 100 && afterBps >= threshold * 100);

    for (const threshold of crossed) {
      const key = `card:${cardId}:transaction:${transactionId}:${threshold}`;
      const message = `${card.nome}: consumo atingiu ${threshold}% do seu limite pessoal.`;
      
      await registerAlertEvent(connection, {
        usuarioId,
        alertKey: key,
        tipo: 'card_limit',
        entidadeId: cardId,
        mensagem: message,
      });

      alerts.push({
        tipo: 'card_limit',
        cartaoId: cardId,
        compraCentavos: amountCents,
        consumoAnteriorCentavos: previousCycleSpendCents,
        consumoAtualCentavos: nextCycleSpendCents,
        limitePessoalCentavos: personalLimitCents,
        excedenteCentavos: Math.max(0, nextCycleSpendCents - personalLimitCents),
        percentualAtingido: threshold,
        mensagem: message,
      });
    }
  }

  return {
    alerts,
    cycleStartDate: cycle.startDate,
    cycleEndDate: cycle.endDate,
    cycleSpendCents: nextCycleSpendCents,
    exceededPersonalLimit: personalLimitCents > 0
      && previousCycleSpendCents < personalLimitCents
      && nextCycleSpendCents > personalLimitCents,
  };
}

async function registerInternalTransfer(connection, {
  originId,
  destinationId,
  amountCents,
  date,
  description,
  goalId = null,
  idempotencyKey = null,
  usuarioId = 1,
}) {
  if (!Number.isInteger(originId) || !Number.isInteger(destinationId)
    || originId === destinationId || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    const error = new Error('Contas ou valor de transferência inválidos');
    error.status = 400;
    throw error;
  }

  const amount = centsToDecimal(amountCents);
  const [debit] = await connection.query(
    'UPDATE contas SET saldo = saldo - ? WHERE id = ? AND saldo >= ?',
    [amount, originId, amount]
  );
  if (debit.affectedRows === 0) {
    const error = new Error('Conta de origem não encontrada ou sem saldo suficiente');
    error.status = 400;
    throw error;
  }
  const [credit] = await connection.query('UPDATE contas SET saldo = saldo + ? WHERE id = ?', [amount, destinationId]);
  if (credit.affectedRows === 0) {
    const error = new Error('Conta de destino não encontrada');
    error.status = 400;
    throw error;
  }
  const [transfer] = await connection.query(
    `INSERT INTO internal_transfers
     (conta_origem_id, conta_destino_id, valor, data, descricao, goal_id, idempotency_key, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [originId, destinationId, amount, date, description || null, goalId, idempotencyKey, usuarioId]
  );
  return transfer.insertId;
}

module.exports = { registerCardExpense, registerInternalTransfer };
