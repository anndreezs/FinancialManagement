const {
  addDays,
  calculateGoalProgress,
  calculateSafeBalance,
  centsToDecimal,
  createMonthlyReport,
  parseIsoDate,
  toCents,
} = require('../services/financialDomain');
const { pool, withTransaction } = require('../services/financialStore');
const { registerInternalTransfer } = require('../services/financialOperations');

const money = (value) => {
  try {
    return toCents(value);
  } catch {
    return 0;
  }
};

const decimal = (cents) => centsToDecimal(cents);

function monthStart(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthBefore(year, month) {
  const date = new Date(Date.UTC(year, month - 2, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function formatSettings(row) {
  if (!row) {
    return {
      percentualSeguro: 70,
      horizonteDias: 30,
      alertasPercentuais: [50, 70, 80, 90, 100],
    };
  }
  return {
    percentualSeguro: (row.percentual_seguro_bps || 7000) / 100,
    horizonteDias: row.horizonte_dias || 30,
    alertasPercentuais: (row.alertas_percentuais || '50,70,80,90,100').split(',').map(Number).filter(Number.isFinite),
  };
}

async function getSettings(usuarioId = 1) {
  const [rows] = await pool.query('SELECT * FROM financial_settings WHERE usuario_id = ? LIMIT 1', [usuarioId]);
  if (rows.length === 0) {
    // Inicializa settings padrão para o usuário
    await pool.query(
      `INSERT INTO financial_settings (usuario_id, percentual_seguro_bps, horizonte_dias, alertas_percentuais)
       VALUES (?, 7000, 30, '50,70,80,90,100')
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [usuarioId]
    );
    return formatSettings(null);
  }
  return formatSettings(rows[0]);
}

exports.getSettings = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    res.json(await getSettings(usuarioId));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar as configurações financeiras' });
  }
};

exports.updateSettings = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const percentual = Number(req.body.percentualSeguro);
  const horizonteDias = Number(req.body.horizonteDias);
  const alertas = req.body.alertasPercentuais;

  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100
    || !Number.isInteger(horizonteDias) || horizonteDias < 1 || horizonteDias > 366
    || !Array.isArray(alertas)
    || alertas.some((value) => !Number.isInteger(value) || value < 1 || value > 100)) {
    return res.status(400).json({ error: 'Configuração financeira inválida' });
  }

  try {
    const alertStr = [...new Set(alertas)].sort((a, b) => a - b).join(',');
    await pool.query(
      `INSERT INTO financial_settings (usuario_id, percentual_seguro_bps, horizonte_dias, alertas_percentuais)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE percentual_seguro_bps = VALUES(percentual_seguro_bps),
                               horizonte_dias = VALUES(horizonte_dias),
                               alertas_percentuais = VALUES(alertas_percentuais)`,
      [usuarioId, Math.round(percentual * 100), horizonteDias, alertStr]
    );
    res.json(await getSettings(usuarioId));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível salvar as configurações financeiras' });
  }
};

exports.getMonthlyReport = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const month = Number(req.query.month ?? req.query.mes);
  const year = Number(req.query.year ?? req.query.ano);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return res.status(400).json({ error: 'Informe um mês e ano válidos' });
  }

  const filters = ['t.usuario_id = ?'];
  const filterValues = [usuarioId];
  if (req.query.tipo !== undefined) {
    if (!['entrada', 'saida'].includes(req.query.tipo)) return res.status(400).json({ error: 'Tipo de movimentação inválido' });
    filters.push('t.tipo = ?');
    filterValues.push(req.query.tipo);
  }
  for (const [queryName, column] of [['categoriaId', 't.categoria_id'], ['contaId', 't.conta_id'], ['cartaoId', 't.cartao_id']]) {
    if (req.query[queryName] !== undefined && req.query[queryName] !== '') {
      const id = Number(req.query[queryName]);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Filtro inválido' });
      filters.push(`${column} = ?`);
      filterValues.push(id);
    }
  }

  try {
    const previous = monthBefore(year, month);
    const now = new Date();
    const isCurrentMonth = now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
    const currentLastDay = isCurrentMonth ? now.getUTCDate() : Number(monthEnd(year, month).slice(8, 10));
    const previousLastDay = Math.min(currentLastDay, Number(monthEnd(previous.year, previous.month).slice(8, 10)));
    const startDate = monthStart(previous.year, previous.month);
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(currentLastDay).padStart(2, '0')}`;
    const [rows] = await pool.query(
      `SELECT t.id, t.tipo, t.valor, t.data, t.descricao, t.forma_pagamento,
              c.nome AS categoria_nome, co.nome AS conta_nome, ca.nome AS cartao_nome
       FROM transacoes t
       LEFT JOIN categorias c ON c.id = t.categoria_id
       LEFT JOIN contas co ON co.id = t.conta_id
       LEFT JOIN cartoes ca ON ca.id = t.cartao_id
       WHERE t.status = 'posted' AND t.data >= ? AND t.data <= ?
       ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
       ORDER BY t.data, t.id`,
      [startDate, endDate, ...filterValues]
    );
    const current = createMonthlyReport({ transactions: rows, month, year });
    const previousReport = createMonthlyReport({
      transactions: rows,
      month: previous.month,
      year: previous.year,
    });
    const previousPeriodDays = previousLastDay;
    const currentTransactions = rows.filter((row) => {
      const date = parseIsoDate(row.data);
      return date.startsWith(`${year}-${String(month).padStart(2, '0')}`);
    });
    const [movementRows] = await pool.query(
      `SELECT gm.id, gm.tipo, gm.valor, gm.status, gm.reverses_movement_id
       FROM goal_movements gm
       JOIN goals g ON g.id = gm.goal_id
       WHERE g.usuario_id = ? AND gm.data >= ? AND gm.data <= ?`,
      [usuarioId, monthStart(year, month), endDate]
    );
    const goalProgress = calculateGoalProgress({
      targetCents: Number.MAX_SAFE_INTEGER,
      movements: movementRows.map((row, index) => ({
        id: index + 1,
        type: row.tipo,
        amountCents: money(row.valor),
        status: row.status,
        reversesMovementId: row.reverses_movement_id,
      })),
    });
    const comparison = {
      receitasVariacaoCentavos: current.totalIncomeCents - previousReport.totalIncomeCents,
      despesasVariacaoCentavos: current.totalExpenseCents - previousReport.totalExpenseCents,
      resultadoVariacaoCentavos: current.netCents - previousReport.netCents,
      resultadoVariacaoPercentual: previousReport.netCents === 0
        ? null
        : Math.round((current.netCents - previousReport.netCents) * 10000 / Math.abs(previousReport.netCents)) / 100,
      periodoAnteriorComparadoAteDia: previousPeriodDays,
    };

    res.json({
      periodo: { mes: month, ano: year, diasComparados: currentLastDay },
      resumo: {
        receitasCentavos: current.totalIncomeCents,
        despesasCentavos: current.totalExpenseCents,
        resultadoCentavos: current.netCents,
        saldoInicialCentavos: null,
        saldoFinalCentavos: null,
        saldoHistoricoIndisponivel: true,
        quantidadeTransacoes: current.transactionCount,
        despesaMediaCentavos: current.averageExpenseCents,
        maiorDespesa: current.largestExpense,
        categoriaMaiorDespesa: current.largestExpenseCategory,
        taxaPoupancaPercentual: current.savingsRatePercent,
        contribuicoesMetasCentavos: goalProgress.accumulatedCents,
      },
      comparacao: comparison,
      categorias: current.categories.map((category) => ({
        nome: category.categoria,
        receitasCentavos: category.receitasCentavos,
        despesasCentavos: category.despesasCentavos,
        percentualDespesas: category.percentualDespesas,
        quantidade: category.quantidade,
        transacoes: currentTransactions
          .filter((transaction) => (transaction.categoria_nome || 'Sem categoria') === category.categoria)
          .map((transaction) => ({
            id: transaction.id,
            categoria: category.categoria,
            data: parseIsoDate(transaction.data),
            descricao: transaction.descricao,
            tipo: transaction.tipo,
            valorCentavos: money(transaction.valor),
            conta: transaction.conta_nome,
            cartao: transaction.cartao_nome,
            formaPagamento: transaction.forma_pagamento,
          })),
      })),
      avisos: [
        'Saldos inicial e final históricos não são calculados porque o sistema não registra saldo de abertura por período.',
        ...current.integrityWarnings,
      ],
    });
  } catch (error) {
    console.error('Erro ao gerar relatório financeiro', error.code || error.message);
    res.status(500).json({ error: 'Não foi possível gerar o relatório' });
  }
};

exports.getTrendReport = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const months = Number(req.query.months ?? 6);
  if (![6, 12, 24].includes(months)) return res.status(400).json({ error: 'Selecione 6, 12 ou 24 meses' });

  const now = new Date();
  const endYear = Number(req.query.year ?? now.getUTCFullYear());
  const endMonth = Number(req.query.month ?? now.getUTCMonth() + 1);
  if (!Number.isInteger(endYear) || !Number.isInteger(endMonth) || endMonth < 1 || endMonth > 12) {
    return res.status(400).json({ error: 'Período final inválido' });
  }

  const filters = ['usuario_id = ?'];
  const filterValues = [usuarioId];
  if (req.query.tipo !== undefined) {
    if (!['entrada', 'saida'].includes(req.query.tipo)) return res.status(400).json({ error: 'Tipo de movimentação inválido' });
    filters.push('tipo = ?');
    filterValues.push(req.query.tipo);
  }
  for (const [queryName, column] of [['categoriaId', 'categoria_id'], ['contaId', 'conta_id'], ['cartaoId', 'cartao_id']]) {
    if (req.query[queryName] !== undefined && req.query[queryName] !== '') {
      const id = Number(req.query[queryName]);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Filtro inválido' });
      filters.push(`${column} = ?`);
      filterValues.push(id);
    }
  }

  try {
    const start = new Date(Date.UTC(endYear, endMonth - months, 1));
    const startYear = start.getUTCFullYear();
    const startMonth = start.getUTCMonth() + 1;
    const [rows] = await pool.query(
      `SELECT tipo, valor, data, categoria_id
       FROM transacoes
       WHERE status = 'posted' AND data >= ? AND data <= ?
       ${filters.length ? `AND ${filters.join(' AND ')}` : ''}`,
      [monthStart(startYear, startMonth), monthEnd(endYear, endMonth), ...filterValues]
    );
    const values = [];
    for (let offset = 0; offset < months; offset += 1) {
      const date = new Date(Date.UTC(startYear, startMonth - 1 + offset, 1));
      const month = date.getUTCMonth() + 1;
      const year = date.getUTCFullYear();
      const report = createMonthlyReport({ transactions: rows, month, year });
      values.push({
        mes: month,
        ano: year,
        receitasCentavos: report.totalIncomeCents,
        despesasCentavos: report.totalExpenseCents,
        resultadoCentavos: report.netCents,
        taxaPoupancaPercentual: report.savingsRatePercent,
      });
    }
    res.json({ meses: values, historicoInsuficiente: rows.length === 0 });
  } catch (error) {
    console.error('Erro ao gerar tendência financeira', error.code || error.message);
    res.status(500).json({ error: 'Não foi possível gerar a tendência' });
  }
};

exports.getPlanning = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const settings = await getSettings(usuarioId);
    const start = parseIsoDate(req.query.asOf || new Date().toISOString().slice(0, 10));
    const horizonDays = Number(req.query.horizonDays ?? settings.horizonteDias);
    const horizonEnd = addDays(start, horizonDays);
    if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 366) {
      return res.status(400).json({ error: 'Horizonte inválido' });
    }

    const [[accountRows], [debts], [planned], [cards], [movementRows], [futureContributions]] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(saldo), 0) AS saldo FROM contas WHERE usuario_id = ?', [usuarioId]),
      pool.query(
        `SELECT id, descricao, valor, data_vencimento
         FROM dividas WHERE status IN ('pendente','atrasada') AND data_vencimento <= ? AND usuario_id = ?`,
        [horizonEnd, usuarioId]
      ),
      pool.query(
        `SELECT id, tipo, descricao, valor, data_prevista, status
         FROM planned_movements
         WHERE status IN ('confirmed','pending','estimated') AND data_prevista <= ? AND usuario_id = ?`,
        [horizonEnd, usuarioId]
      ),
      pool.query('SELECT id, nome, vencimento, saldo_utilizado FROM cartoes WHERE saldo_utilizado > 0 AND usuario_id = ?', [usuarioId]),
      pool.query(
        `SELECT gm.id, gm.goal_id, gm.tipo, gm.valor, gm.status, gm.reverses_movement_id 
         FROM goal_movements gm
         JOIN goals g ON g.id = gm.goal_id
         WHERE g.usuario_id = ? ORDER BY gm.id`,
        [usuarioId]
      ),
      pool.query(
        `SELECT o.id, o.data_prevista, o.valor_planejado, o.valor_contribuido
         FROM contribution_occurrences o
         JOIN contribution_plans p ON p.id = o.plan_id
         JOIN goals g ON g.id = o.goal_id
         WHERE p.status = 'active' AND g.status = 'active' AND g.usuario_id = ?
           AND o.status IN ('pending','partial','overdue')
           AND o.data_prevista <= ?`,
        [usuarioId, horizonEnd]
      ),
    ]);

    const goals = new Map();
    for (const row of movementRows) {
      const movements = goals.get(row.goal_id) || [];
      movements.push({
        id: row.id,
        type: row.tipo,
        amountCents: money(row.valor),
        status: row.status,
        reversesMovementId: row.reverses_movement_id,
      });
      goals.set(row.goal_id, movements);
    }
    let reservationsCents = 0;
    for (const movements of goals.values()) {
      const progress = calculateGoalProgress({ targetCents: Number.MAX_SAFE_INTEGER, movements });
      reservationsCents += progress.accumulatedCents;
    }
    reservationsCents = Math.max(0, reservationsCents);

    const commitments = debts.map((row) => ({
      id: `debt:${row.id}`,
      date: parseIsoDate(row.data_vencimento),
      amountCents: money(row.valor),
      status: 'pending',
      description: row.descricao,
      source: 'debt',
    }));
    for (const row of planned) {
      if (row.tipo === 'income') {
        if (row.status === 'confirmed') {
          commitments.push({
            id: `income:${row.id}`,
            date: parseIsoDate(row.data_prevista),
            amountCents: money(row.valor),
            status: 'confirmed',
            confirmed: true,
            description: row.descricao,
            source: 'planned-income',
          });
        }
      } else if (row.status === 'pending') {
        commitments.push({
          id: `planned:${row.id}`,
          date: parseIsoDate(row.data_prevista),
          amountCents: money(row.valor),
          status: 'pending',
          description: row.descricao,
          source: 'planned-commitment',
        });
      }
    }

    const warnings = [];
    for (const card of cards) {
      const today = new Date(`${start}T00:00:00.000Z`);
      const dueDay = Number(card.vencimento);
      const dueThisMonth = `${start.slice(0, 8)}${String(Math.min(dueDay, Number(monthEnd(Number(start.slice(0, 4)), Number(start.slice(5, 7))).slice(8, 10)))).padStart(2, '0')}`;
      let dueDate = dueThisMonth;
      if (dueDate < start) {
        const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
        const nextMonthEnd = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
        dueDate = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(dueDay, nextMonthEnd)).padStart(2, '0')}`;
      }
      if (dueDate <= horizonEnd) {
        commitments.push({
          id: `card:${card.id}`,
          date: dueDate,
          amountCents: money(card.saldo_utilizado),
          status: 'pending',
          description: `Fatura estimada: ${card.nome}`,
          source: 'card-estimate',
        });
      }
      warnings.push('Vencimentos de cartões são estimados pelo dia de vencimento.');
    }

    const projection = calculateSafeBalance({
      saldoAtualCentavos: money(accountRows[0]?.saldo || 0),
      reservasVirtuaisCentavos: reservationsCents,
      percentualBps: Math.round(settings.percentualSeguro * 100),
      inicio: start,
      horizonteDias: horizonDays,
      entradas: commitments.filter((event) => event.status === 'confirmed'),
      compromissos: commitments.filter((event) => event.status === 'pending'),
    });
    const plannedContributionEvents = futureContributions
      .map((row) => ({
        id: `goal-plan:${row.id}`,
        date: parseIsoDate(row.data_prevista),
        amountCents: Math.max(0, money(row.valor_planejado) - money(row.valor_contribuido)),
        status: 'pending',
        description: 'Contribuição planejada para meta',
        source: 'goal-plan-scenario',
      }))
      .filter((event) => event.amountCents > 0);
    const planScenario = calculateSafeBalance({
      saldoAtualCentavos: projection.saldoAtualCentavos,
      reservasVirtuaisCentavos: reservationsCents,
      percentualBps: Math.round(settings.percentualSeguro * 100),
      inicio: start,
      horizonteDias: horizonDays,
      entradas: commitments.filter((event) => event.status === 'confirmed'),
      compromissos: [
        ...commitments.filter((event) => event.status === 'pending'),
        ...plannedContributionEvents,
      ],
    });

    res.json({
      configuracoes: { ...settings, horizonteDias: horizonDays },
      projecao: {
        ...projection,
        saldoAtualCentavos: projection.saldoAtualCentavos,
        eventos: projection.events.map((event) => ({
          ...event,
          valorCentavos: event.amountCents,
          origem: commitments.find((item) => item.id === event.id)?.source || 'desconhecida',
          tipo: event.kind,
        })),
      },
      projecaoComPlanos: {
        saldoResidualCentavos: planScenario.saldoResidualCentavos,
        saldoSeguroCentavos: planScenario.saldoSeguroCentavos,
        menorSaldoProjetadoCentavos: planScenario.menorSaldoProjetadoCentavos,
        dataMenorSaldo: planScenario.dataMenorSaldo,
        riscoInsuficiencia: planScenario.riscoInsuficiencia,
        contribuicoesPlanejadasCentavos: plannedContributionEvents.reduce((sum, event) => sum + event.amountCents, 0),
      },
      avisos: [...new Set(warnings)],
    });
  } catch (error) {
    console.error('Erro ao calcular planejamento', error.code || error.message);
    res.status(500).json({ error: 'Não foi possível calcular o planejamento financeiro' });
  }
};

exports.listPlannedMovements = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [rows] = await pool.query(
      `SELECT id, tipo, descricao, valor, data_prevista, status, categoria_id, conta_id
       FROM planned_movements 
       WHERE usuario_id = ?
       ORDER BY data_prevista, id`,
      [usuarioId]
    );
    res.json(rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      descricao: row.descricao,
      valorCentavos: money(row.valor),
      data: parseIsoDate(row.data_prevista),
      status: row.status,
      categoriaId: row.categoria_id,
      contaId: row.conta_id,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar os lançamentos previstos' });
  }
};

exports.createPlannedMovement = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { tipo, descricao, data, status, categoriaId, contaId, idempotencyKey } = req.body;
  let amountCents;
  try {
    amountCents = toCents(req.body.valor);
    parseIsoDate(data);
  } catch {
    return res.status(400).json({ error: 'Valor ou data inválidos' });
  }

  const validStatus = tipo === 'income'
    ? ['confirmed', 'estimated'].includes(status)
    : tipo === 'commitment' && ['pending'].includes(status);
  if (!validStatus || !descricao || amountCents <= 0) {
    return res.status(400).json({ error: 'Lançamento previsto inválido' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO planned_movements
       (tipo, descricao, valor, data_prevista, status, categoria_id, conta_id, idempotency_key, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tipo, descricao.trim(), decimal(amountCents), data, status, categoriaId || null, contaId || null, idempotencyKey || null, usuarioId]
    );
    res.status(201).json({ id: result.insertId, tipo, descricao: descricao.trim(), valorCentavos: amountCents, data, status, usuario_id: usuarioId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(200).json({ duplicado: true });
    res.status(500).json({ error: 'Não foi possível cadastrar o lançamento previsto' });
  }
};

exports.settlePlannedMovement = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const id = Number(req.params.id);
  const accountId = Number(req.body.contaId);
  const paymentMethod = String(req.body.formaPagamento || '').toLowerCase();
  const idempotencyKey = req.body.idempotencyKey || null;
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(accountId) || accountId < 1) {
    return res.status(400).json({ error: 'Lançamento e conta são obrigatórios' });
  }
  if (!['dinheiro', 'debito', 'pix', 'transferencia'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'Forma de pagamento inválida' });
  }

  try {
    const response = await withTransaction(async (connection) => {
      if (idempotencyKey) {
        const [existing] = await connection.query('SELECT id FROM transacoes WHERE idempotency_key = ?', [idempotencyKey]);
        if (existing.length) return { id: existing[0].id, transacaoId: existing[0].id, duplicado: true };
      }
      const [rows] = await connection.query('SELECT * FROM planned_movements WHERE id = ? AND usuario_id = ? FOR UPDATE', [id, usuarioId]);
      const movement = rows[0];
      if (!movement || !['pending', 'confirmed'].includes(movement.status)) {
        const error = new Error('Lançamento não está pendente');
        error.status = 409;
        throw error;
      }
      const amountCents = money(movement.valor);
      const transactionType = movement.tipo === 'income' ? 'entrada' : 'saida';
      const sign = movement.tipo === 'income' ? '+' : '-';
      const [accountResult] = await connection.query(
        `UPDATE contas SET saldo = saldo ${sign} ? WHERE id = ? AND usuario_id = ? ${movement.tipo === 'commitment' ? 'AND saldo >= ?' : ''}`,
        movement.tipo === 'commitment' ? [decimal(amountCents), accountId, usuarioId, decimal(amountCents)] : [decimal(amountCents), accountId, usuarioId]
      );
      if (accountResult.affectedRows === 0) {
        const error = new Error('Conta não encontrada ou sem saldo suficiente');
        error.status = 400;
        throw error;
      }
      const [insert] = await connection.query(
        `INSERT INTO transacoes
         (tipo, valor, data, descricao, forma_pagamento, conta_id, categoria_id, idempotency_key, status, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)`,
        [transactionType, decimal(amountCents), req.body.dataPagamento || new Date().toISOString().slice(0, 10), movement.descricao, paymentMethod, accountId, movement.categoria_id, idempotencyKey, usuarioId]
      );
      await connection.query('UPDATE planned_movements SET status = ? WHERE id = ? AND usuario_id = ?', ['paid', id, usuarioId]);
      return { id: insert.insertId, transacaoId: insert.insertId, contaId: accountId, status: 'paid' };
    });
    res.json(response);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível liquidar o lançamento' });
  }
};

exports.cancelPlannedMovement = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [result] = await pool.query(
      `UPDATE planned_movements SET status = 'cancelled'
       WHERE id = ? AND usuario_id = ? AND status IN ('confirmed','estimated','pending')`,
      [req.params.id, usuarioId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Lançamento não encontrado ou já encerrado' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível cancelar o lançamento' });
  }
};


exports.deletePlannedMovement = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const id = Number(req.params.id);

  try {
    const [result] = await pool.query(
      'DELETE FROM planned_movements WHERE id = ? AND usuario_id = ?',
      [id, usuarioId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Lançamento previsto não encontrado' });
    }

    res.json({ success: true, deletedId: id });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível excluir o lançamento previsto' });
  }
};

exports.clearPlannedMovements = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { status } = req.query;

  try {
    let sql = 'DELETE FROM planned_movements WHERE usuario_id = ?';
    const params = [usuarioId];

    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }

    const [result] = await pool.query(sql, params);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível limpar os lançamentos previstos' });
  }
};

exports.resetPlanning = async (req, res) => {
  const usuarioId = req.user?.id || 1;

  try {
    await withTransaction(async (connection) => {
      await connection.query('DELETE FROM planned_movements WHERE usuario_id = ?', [usuarioId]);
      await connection.query(
        `UPDATE financial_settings 
         SET percentual_seguro_bps = 7000, horizonte_dias = 30, alertas_percentuais = '50,70,80,90,100'
         WHERE usuario_id = ?`,
        [usuarioId]
      );
    });

    res.json({ success: true, message: 'Planejamento resetado com sucesso para os valores padrão.' });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível resetar o planejamento' });
  }
};

exports.listInternalTransfers = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.valor, t.data, t.descricao, t.goal_id,
              origem.nome AS conta_origem, destino.nome AS conta_destino
       FROM internal_transfers t
       JOIN contas origem ON origem.id = t.conta_origem_id
       JOIN contas destino ON destino.id = t.conta_destino_id
       WHERE t.usuario_id = ?
       ORDER BY t.data DESC, t.id DESC`,
      [usuarioId]
    );
    res.json(rows.map((row) => ({
      id: row.id,
      valorCentavos: money(row.valor),
      data: parseIsoDate(row.data),
      descricao: row.descricao,
      contaOrigem: row.conta_origem,
      contaDestino: row.conta_destino,
      goalId: row.goal_id,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar transferências' });
  }
};

exports.createInternalTransfer = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const originId = Number(req.body.contaOrigemId);
  const destinationId = Number(req.body.contaDestinoId);
  const idempotencyKey = req.body.idempotencyKey || req.get('Idempotency-Key') || null;
  let amountCents;
  try {
    amountCents = toCents(req.body.valor);
    parseIsoDate(req.body.data);
  } catch {
    return res.status(400).json({ error: 'Valor ou data da transferência inválidos' });
  }
  if (!idempotencyKey) return res.status(400).json({ error: 'Chave de idempotência obrigatória' });

  try {
    const result = await withTransaction(async (connection) => {
      const [existing] = await connection.query('SELECT id FROM internal_transfers WHERE idempotency_key = ?', [idempotencyKey]);
      if (existing.length) return { id: existing[0].id, duplicado: true };
      const id = await registerInternalTransfer(connection, {
        originId,
        destinationId,
        amountCents,
        date: req.body.data,
        description: req.body.descricao,
        idempotencyKey,
        usuarioId,
      });
      return { id, valorCentavos: amountCents, contaOrigemId: originId, contaDestinoId: destinationId };
    });
    res.status(result.duplicado ? 200 : 201).json(result);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(200).json({ duplicado: true });
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível registrar a transferência' });
  }
};

/* ==========================================
   CENTRAL DE NOTIFICAÇÕES E ALERTAS
========================================== */

exports.listAlerts = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [rows] = await pool.query(
      `SELECT id, alert_key, tipo, entidade_id, mensagem, created_at, lido_em
       FROM financial_alert_events
       WHERE usuario_id = ? AND dismissed_at IS NULL
       ORDER BY created_at DESC LIMIT 50`,
      [usuarioId]
    );
    const unreadCount = rows.filter((r) => !r.lido_em).length;
    res.json({ unreadCount, alerts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar notificações' });
  }
};

exports.markAlertRead = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const id = req.params.id;
  try {
    await pool.query('UPDATE financial_alert_events SET lido_em = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar notificação' });
  }
};

exports.dismissAlert = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const id = req.params.id;
  try {
    await pool.query('UPDATE financial_alert_events SET dismissed_at = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao descartar notificação' });
  }
};

exports.markAllAlertsRead = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    await pool.query('UPDATE financial_alert_events SET lido_em = CURRENT_TIMESTAMP WHERE usuario_id = ? AND lido_em IS NULL', [usuarioId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao marcar notificações como lidas' });
  }
};
