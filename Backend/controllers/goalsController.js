const {
  buildContributionSchedule,
  calculateGoalProgress,
  centsToDecimal,
  parseIsoDate,
  toCents,
} = require('../services/financialDomain');
const { pool, withTransaction } = require('../services/financialStore');
const { registerInternalTransfer } = require('../services/financialOperations');

const money = (value) => toCents(value);
const decimal = (cents) => centsToDecimal(cents);
const today = () => new Date().toISOString().slice(0, 10);

function movementInput(row) {
  return {
    id: row.id,
    type: row.tipo,
    amountCents: money(row.valor),
    status: row.status,
    reversesMovementId: row.reverses_movement_id,
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    modalidade: row.modalidade,
    valorCentavos: money(row.valor),
    data: parseIsoDate(row.data),
    contaOrigemId: row.conta_origem_id,
    contaDestinoId: row.conta_destino_id,
    transferId: row.transfer_id,
    reversesMovementId: row.reverses_movement_id,
    occurrenceId: row.occurrence_id,
    observacao: row.observacao,
    status: row.status,
  };
}

function mapGoal(row, movements) {
  const progress = calculateGoalProgress({
    targetCents: money(row.valor_alvo),
    movements: movements.map(movementInput),
  });

  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    valorAlvoCentavos: money(row.valor_alvo),
    dataInicio: parseIsoDate(row.data_inicio),
    dataLimite: parseIsoDate(row.data_limite),
    finalidade: row.finalidade,
    contaId: row.conta_id,
    observacoes: row.observacoes,
    status: row.status,
    ...progress,
  };
}

async function getGoalRows(goalId, usuarioId = null) {
  const sql = usuarioId ? 'SELECT * FROM goals WHERE id = ? AND usuario_id = ?' : 'SELECT * FROM goals WHERE id = ?';
  const params = usuarioId ? [goalId, usuarioId] : [goalId];
  const [rows] = await pool.query(sql, params);
  if (rows.length === 0) return null;
  const [movements] = await pool.query('SELECT * FROM goal_movements WHERE goal_id = ? ORDER BY id', [goalId]);
  return mapGoal(rows[0], movements);
}

async function getGoalMovements(connection, goalId) {
  const [rows] = await connection.query('SELECT * FROM goal_movements WHERE goal_id = ? ORDER BY id', [goalId]);
  return rows;
}

function contributionSchedule(goal, movementRows, body) {
  const progress = calculateGoalProgress({
    targetCents: money(goal.valor_alvo),
    movements: movementRows.map(movementInput),
  });
  const method = body.metodo;
  const fixedAmountCents = body.valorFixo === undefined ? undefined : toCents(body.valorFixo);
  const customAmountsCents = Array.isArray(body.valoresPersonalizados)
    ? body.valoresPersonalizados.map(toCents)
    : undefined;
  const schedule = buildContributionSchedule({
    remainingCents: progress.remainingCents,
    startDate: body.dataInicio,
    dueDate: body.dataLimite,
    frequency: body.frequencia,
    preferredDay: body.diaPreferencial ? Number(body.diaPreferencial) : undefined,
    method,
    fixedAmountCents,
    customAmountsCents,
    incrementBps: Number(body.incrementoBps || 0),
  });
  return { schedule, progress };
}

async function persistSchedule(connection, planId, goalId, schedule) {
  for (const occurrence of schedule) {
    await connection.query(
      `INSERT INTO contribution_occurrences
       (plan_id, goal_id, data_prevista, valor_planejado, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [planId, goalId, occurrence.date, decimal(occurrence.amountCents)]
    );
  }
}

exports.listGoals = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const [goals] = await pool.query('SELECT * FROM goals WHERE usuario_id = ? ORDER BY created_at DESC', [usuarioId]);
    const [movements] = await pool.query('SELECT m.* FROM goal_movements m JOIN goals g ON g.id = m.goal_id WHERE g.usuario_id = ? ORDER BY m.id', [usuarioId]);
    res.json(goals.map((goal) => mapGoal(
      goal,
      movements.filter((movement) => movement.goal_id === goal.id)
    )));
  } catch (error) {
    console.error('Erro ao listar metas', error.code || error.message);
    res.status(500).json({ error: 'Não foi possível carregar as metas' });
  }
};

exports.createGoal = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const { nome, descricao, dataInicio, dataLimite, finalidade, contaId, observacoes } = req.body;
  const idempotencyKey = req.body.idempotencyKey || req.get('Idempotency-Key');
  let targetCents;
  try {
    targetCents = toCents(req.body.valorAlvo);
    parseIsoDate(dataInicio);
    parseIsoDate(dataLimite);
  } catch {
    return res.status(400).json({ error: 'Valor-alvo ou datas inválidos' });
  }
  if (!nome?.trim() || targetCents <= 0 || dataLimite < dataInicio) {
    return res.status(400).json({ error: 'Informe nome, valor positivo e um prazo válido' });
  }
  if (!idempotencyKey) return res.status(400).json({ error: 'Chave de idempotência obrigatória' });

  try {
    const created = await withTransaction(async (connection) => {
      const [existing] = await connection.query('SELECT id FROM goals WHERE idempotency_key = ? AND usuario_id = ?', [idempotencyKey, usuarioId]);
      if (existing.length) return { goalId: existing[0].id, duplicate: true, planSummary: null };
      const [result] = await connection.query(
        `INSERT INTO goals
         (nome, descricao, valor_alvo, data_inicio, data_limite, finalidade, conta_id, observacoes, idempotency_key, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome.trim(), descricao || null, decimal(targetCents), dataInicio, dataLimite, finalidade || null, contaId || null, observacoes || null, idempotencyKey, usuarioId]
      );
      let planSummary = null;
      if (req.body.plano) {
        const [goalRows] = await connection.query('SELECT * FROM goals WHERE id = ?', [result.insertId]);
        const plan = req.body.plano;
        const planIdempotencyKey = plan.idempotencyKey || `${idempotencyKey}:plan`;
        if (plan.dataInicio < dataInicio || plan.dataLimite > dataLimite) {
          const error = new Error('O plano deve respeitar o início e o prazo da meta');
          error.status = 400;
          throw error;
        }
        const { schedule, progress } = contributionSchedule(goalRows[0], [], plan);
        if (schedule.length === 0) {
          const error = new Error('A meta já está concluída ou o plano não possui períodos');
          error.status = 400;
          throw error;
        }
        const fixedAmountCents = plan.valorFixo === undefined ? null : toCents(plan.valorFixo);
        const [planResult] = await connection.query(
          `INSERT INTO contribution_plans
           (goal_id, metodo, frequencia, data_inicio, data_limite, dia_preferencial,
            valor_fixo, incremento_bps, valores_personalizados, status, idempotency_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
          [result.insertId, plan.metodo, plan.frequencia, plan.dataInicio, plan.dataLimite,
            plan.diaPreferencial || null, fixedAmountCents === null ? null : decimal(fixedAmountCents),
            Number(plan.incrementoBps || 0), Array.isArray(plan.valoresPersonalizados) ? JSON.stringify(plan.valoresPersonalizados) : null,
            planIdempotencyKey]
        );
        await persistSchedule(connection, planResult.insertId, result.insertId, schedule);
        const totalScheduledCents = schedule.reduce((sum, item) => sum + item.amountCents, 0);
        planSummary = {
          id: planResult.insertId,
          ocorrencias: schedule.length,
          totalPlanejadoCentavos: totalScheduledCents,
          restanteAPlanejarCentavos: Math.max(0, progress.remainingCents - totalScheduledCents),
        };
      }
      return { goalId: result.insertId, planSummary };
    });
    res.status(created.duplicate ? 200 : 201).json({ ...(await getGoalRows(created.goalId, usuarioId)), plano: created.planSummary, duplicado: created.duplicate || false });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível criar a meta' });
  }
};

exports.updateGoal = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const goalId = Number(req.params.goalId);
  const { nome, descricao, dataInicio, dataLimite, finalidade, contaId, observacoes } = req.body;
  let targetCents;
  try {
    targetCents = toCents(req.body.valorAlvo);
    parseIsoDate(dataInicio);
    parseIsoDate(dataLimite);
  } catch {
    return res.status(400).json({ error: 'Valor-alvo ou datas inválidos' });
  }
  if (!nome?.trim() || targetCents <= 0 || dataLimite < dataInicio) {
    return res.status(400).json({ error: 'Informe nome, valor positivo e um prazo válido' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE goals SET nome = ?, descricao = ?, valor_alvo = ?, data_inicio = ?, data_limite = ?,
       finalidade = ?, conta_id = ?, observacoes = ? WHERE id = ?`,
      [nome.trim(), descricao || null, decimal(targetCents), dataInicio, dataLimite, finalidade || null, contaId || null, observacoes || null, goalId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Meta não encontrada' });
    res.json(await getGoalRows(goalId, usuarioId));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível atualizar a meta' });
  }
};

exports.updateGoalStatus = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const allowed = ['active', 'paused', 'completed', 'archived', 'cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Situação inválida' });

  try {
    const goal = await getGoalRows(Number(req.params.goalId), usuarioId);
    if (!goal) return res.status(404).json({ error: 'Meta não encontrada' });
    if (req.body.status === 'completed' && goal.accumulatedCents < goal.valorAlvoCentavos) {
      return res.status(400).json({ error: 'A meta só pode ser concluída ao atingir o valor-alvo' });
    }
    await pool.query('UPDATE goals SET status = ? WHERE id = ? AND usuario_id = ?', [req.body.status, req.params.goalId, usuarioId]);
    if (req.body.status !== 'active') {
      await pool.query("UPDATE contribution_plans SET status = 'paused' WHERE goal_id = ? AND status = 'active'", [req.params.goalId]);
    }
    res.json(await getGoalRows(Number(req.params.goalId), usuarioId));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível alterar a situação da meta' });
  }
};


exports.deleteGoal = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const goalId = Number(req.params.goalId);

  try {
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query('SELECT id FROM goals WHERE id = ? AND usuario_id = ? FOR UPDATE', [goalId, usuarioId]);
      if (rows.length === 0) {
        const error = new Error('Meta não encontrada');
        error.status = 404;
        throw error;
      }

      await connection.query('UPDATE internal_transfers SET goal_id = NULL WHERE goal_id = ?', [goalId]);
      await connection.query('UPDATE goal_movements SET reverses_movement_id = NULL WHERE goal_id = ?', [goalId]);
      await connection.query('DELETE FROM goal_movements WHERE goal_id = ?', [goalId]);
      await connection.query('DELETE FROM contribution_occurrences WHERE goal_id = ?', [goalId]);
      await connection.query('DELETE FROM contribution_plans WHERE goal_id = ?', [goalId]);
      await connection.query('DELETE FROM goals WHERE id = ? AND usuario_id = ?', [goalId, usuarioId]);

      return { success: true, deletedGoalId: goalId };
    });

    res.json(result);
  } catch (error) {
    console.error('Erro ao excluir meta:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível excluir a meta' });
  }
};

exports.resetGoal = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const goalId = Number(req.params.goalId);

  try {
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query('SELECT id FROM goals WHERE id = ? AND usuario_id = ? FOR UPDATE', [goalId, usuarioId]);
      if (rows.length === 0) {
        const error = new Error('Meta não encontrada');
        error.status = 404;
        throw error;
      }

      await connection.query('UPDATE internal_transfers SET goal_id = NULL WHERE goal_id = ?', [goalId]);
      await connection.query('UPDATE goal_movements SET reverses_movement_id = NULL WHERE goal_id = ?', [goalId]);
      await connection.query('DELETE FROM goal_movements WHERE goal_id = ?', [goalId]);
      await connection.query('DELETE FROM contribution_occurrences WHERE goal_id = ?', [goalId]);
      await connection.query('DELETE FROM contribution_plans WHERE goal_id = ?', [goalId]);
      await connection.query("UPDATE goals SET status = 'active' WHERE id = ? AND usuario_id = ?", [goalId, usuarioId]);

      return { success: true, resetGoalId: goalId };
    });

    res.json(result);
  } catch (error) {
    console.error('Erro ao reiniciar meta:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível reiniciar a meta' });
  }
};

exports.deleteGoalPlan = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const goalId = Number(req.params.goalId);

  try {
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query('SELECT id FROM goals WHERE id = ? AND usuario_id = ? FOR UPDATE', [goalId, usuarioId]);
      if (rows.length === 0) {
        const error = new Error('Meta não encontrada');
        error.status = 404;
        throw error;
      }

      await connection.query('DELETE FROM contribution_occurrences WHERE goal_id = ?', [goalId]);
      await connection.query('DELETE FROM contribution_plans WHERE goal_id = ?', [goalId]);

      return { success: true, goalId };
    });

    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível excluir o plano da meta' });
  }
};

exports.clearAllGoals = async (req, res) => {
  const usuarioId = req.user?.id || 1;

  try {
    await withTransaction(async (connection) => {
      const [userGoals] = await connection.query('SELECT id FROM goals WHERE usuario_id = ?', [usuarioId]);
      const goalIds = userGoals.map((g) => g.id);

      if (goalIds.length > 0) {
        await connection.query('UPDATE internal_transfers SET goal_id = NULL WHERE goal_id IN (?)', [goalIds]);
        await connection.query('UPDATE goal_movements SET reverses_movement_id = NULL WHERE goal_id IN (?)', [goalIds]);
        await connection.query('DELETE FROM goal_movements WHERE goal_id IN (?)', [goalIds]);
        await connection.query('DELETE FROM contribution_occurrences WHERE goal_id IN (?)', [goalIds]);
        await connection.query('DELETE FROM contribution_plans WHERE goal_id IN (?)', [goalIds]);
        await connection.query('DELETE FROM goals WHERE usuario_id = ?', [usuarioId]);
      }
    });

    res.json({ success: true, message: 'Todas as metas foram excluídas com sucesso.' });
  } catch (error) {
    console.error('Erro ao limpar metas:', error.message);
    res.status(500).json({ error: 'Não foi possível limpar as metas' });
  }
};

exports.listGoalMovements = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const goal = await getGoalRows(Number(req.params.goalId), usuarioId);
    if (!goal) return res.status(404).json({ error: 'Meta não encontrada' });
    const [rows] = await pool.query('SELECT * FROM goal_movements WHERE goal_id = ? ORDER BY data DESC, id DESC', [req.params.goalId]);
    res.json(rows.map(mapMovement));
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar o histórico da meta' });
  }
};

exports.createGoalMovement = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const goalId = Number(req.params.goalId);
  const { tipo, modalidade, data, contaOrigemId, contaDestinoId, observacao, idempotencyKey, occurrenceId } = req.body;
  const occurrenceKey = req.params.occurrenceId || occurrenceId;
  const requestKey = idempotencyKey || req.get('Idempotency-Key');
  let amountCents;
  try {
    amountCents = toCents(req.body.valor);
    parseIsoDate(data);
  } catch {
    return res.status(400).json({ error: 'Valor ou data inválidos' });
  }

  if (!['contribution', 'withdrawal', 'adjustment'].includes(tipo)
    || !['virtual', 'transfer', 'adjustment'].includes(modalidade)
    || (tipo !== 'adjustment' && amountCents <= 0)
    || (tipo === 'adjustment' && (amountCents === 0 || modalidade !== 'adjustment'))
    || (modalidade === 'transfer' && (!contaOrigemId || !contaDestinoId))) {
    return res.status(400).json({ error: 'Movimentação de meta inválida' });
  }
  if (!requestKey) return res.status(400).json({ error: 'Chave de idempotência obrigatória' });

  try {
    const result = await withTransaction(async (connection) => {
      const [goalRows] = await connection.query('SELECT * FROM goals WHERE id = ? AND usuario_id = ? FOR UPDATE', [goalId, usuarioId]);
      const goal = goalRows[0];
      if (!goal) {
        const error = new Error('Meta não encontrada');
        error.status = 404;
        throw error;
      }
      if (goal.status !== 'active' && tipo === 'contribution') {
        const error = new Error('A meta precisa estar ativa para receber contribuições');
        error.status = 409;
        throw error;
      }

      const movementRows = await getGoalMovements(connection, goalId);
      const progress = calculateGoalProgress({
        targetCents: money(goal.valor_alvo),
        movements: movementRows.map(movementInput),
      });
      const effect = tipo === 'withdrawal' ? -amountCents : amountCents;
      if (progress.accumulatedCents + effect < 0) {
        const error = new Error('A movimentação não pode deixar o acumulado negativo');
        error.status = 400;
        throw error;
      }

      let occurrence;
      if (occurrenceKey) {
        const [occurrenceRows] = await connection.query(
          'SELECT * FROM contribution_occurrences WHERE id = ? AND goal_id = ? FOR UPDATE',
          [occurrenceKey, goalId]
        );
        occurrence = occurrenceRows[0];
        const remaining = occurrence
          ? money(occurrence.valor_planejado) - money(occurrence.valor_contribuido)
          : 0;
        if (!occurrence || !['pending', 'partial', 'overdue', 'deferred'].includes(occurrence.status)
          || tipo !== 'contribution' || amountCents > remaining) {
          const error = new Error('Contribuição incompatível com a ocorrência planejada');
          error.status = 400;
          throw error;
        }
      }

      let transferId = null;
      if (modalidade === 'transfer') {
          transferId = await registerInternalTransfer(connection, {
          originId: Number(contaOrigemId),
          destinationId: Number(contaDestinoId),
          amountCents,
          date: data,
          description: observacao || `Movimentação da meta ${goal.nome}`,
          goalId,
            idempotencyKey: requestKey,
            usuarioId,
        });
      }

      const [insert] = await connection.query(
        `INSERT INTO goal_movements
         (goal_id, occurrence_id, tipo, modalidade, valor, data, conta_origem_id, conta_destino_id,
          transfer_id, idempotency_key, observacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [goalId, occurrence?.id || null, tipo, modalidade, decimal(amountCents), data,
          contaOrigemId || null, contaDestinoId || null, transferId, requestKey, observacao || null]
      );

      if (occurrence) {
        const contributed = money(occurrence.valor_contribuido) + amountCents;
        const planned = money(occurrence.valor_planejado);
        await connection.query(
          'UPDATE contribution_occurrences SET valor_contribuido = ?, status = ? WHERE id = ?',
          [decimal(contributed), contributed >= planned ? 'complete' : 'partial', occurrence.id]
        );
      }
      return { id: insert.insertId, transferId, valorCentavos: amountCents, modalidade };
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(200).json({ duplicado: true });
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível registrar a movimentação' });
  }
};

exports.reverseGoalMovement = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const goalId = Number(req.params.goalId);
  const movementId = Number(req.params.movementId);
  const { data, observacao, idempotencyKey } = req.body;
  const requestKey = idempotencyKey || req.get('Idempotency-Key');
  if (!requestKey) return res.status(400).json({ error: 'Chave de idempotência obrigatória' });
  try {
    parseIsoDate(data || today());
  } catch {
    return res.status(400).json({ error: 'Data da reversão inválida' });
  }

  try {
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query(
        'SELECT m.* FROM goal_movements m JOIN goals g ON g.id = m.goal_id WHERE m.id = ? AND m.goal_id = ? AND g.usuario_id = ? FOR UPDATE',
        [movementId, goalId, usuarioId]
      );
      const original = rows[0];
      if (!original || original.tipo === 'reversal') {
        const error = new Error('Movimentação original não encontrada');
        error.status = 404;
        throw error;
      }
      const [reversals] = await connection.query(
        'SELECT id FROM goal_movements WHERE reverses_movement_id = ?',
        [movementId]
      );
      if (reversals.length) {
        const error = new Error('Movimentação já foi revertida');
        error.status = 409;
        throw error;
      }

      let reversalTransferId = null;
      if (original.transfer_id) {
        const [transfers] = await connection.query('SELECT * FROM internal_transfers WHERE id = ? AND usuario_id = ? FOR UPDATE', [original.transfer_id, usuarioId]);
        const transfer = transfers[0];
        reversalTransferId = await registerInternalTransfer(connection, {
          originId: transfer.conta_destino_id,
          destinationId: transfer.conta_origem_id,
          amountCents: money(transfer.valor),
          date: data || today(),
          description: `Reversão da transferência ${transfer.id}`,
          goalId,
          idempotencyKey: requestKey,
        });
      }

      const [insert] = await connection.query(
        `INSERT INTO goal_movements
         (goal_id, tipo, modalidade, valor, data, transfer_id, reverses_movement_id, idempotency_key, observacao)
         VALUES (?, 'reversal', ?, ?, ?, ?, ?, ?, ?)`,
        [goalId, original.modalidade, original.valor, data || today(), reversalTransferId,
          movementId, requestKey, observacao || `Reversão da movimentação ${movementId}`]
      );
      return { id: insert.insertId, reversalOf: movementId };
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(200).json({ duplicado: true });
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível reverter a movimentação' });
  }
};

exports.listPlans = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  try {
    const goal = await getGoalRows(Number(req.params.goalId), usuarioId);
    if (!goal) return res.status(404).json({ error: 'Meta não encontrada' });
    const [rows] = await pool.query('SELECT * FROM contribution_plans WHERE goal_id = ? ORDER BY id DESC', [req.params.goalId]);
    const [occurrences] = await pool.query(
      'SELECT * FROM contribution_occurrences WHERE goal_id = ? ORDER BY data_prevista, id',
      [req.params.goalId]
    );
    const currentDate = today();
    res.json({
      plans: rows.map((row) => ({
        id: row.id,
        goalId: row.goal_id,
        metodo: row.metodo,
        frequencia: row.frequencia,
        dataInicio: parseIsoDate(row.data_inicio),
        dataLimite: parseIsoDate(row.data_limite),
        diaPreferencial: row.dia_preferencial,
        valorFixoCentavos: row.valor_fixo === null ? null : money(row.valor_fixo),
        incrementoBps: row.incremento_bps,
        status: row.status,
      })),
      occurrences: occurrences.map((row) => ({
        id: row.id,
        planId: row.plan_id,
        goalId: row.goal_id,
        data: parseIsoDate(row.data_prevista),
        valorPlanejadoCentavos: money(row.valor_planejado),
        valorContribuidoCentavos: money(row.valor_contribuido),
        valorRestanteCentavos: Math.max(0, money(row.valor_planejado) - money(row.valor_contribuido)),
        status: row.status === 'pending' && parseIsoDate(row.data_prevista) < currentDate ? 'overdue' : row.status,
        ajusteManual: Boolean(row.ajuste_manual),
        observacao: row.observacao,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar o plano de contribuições' });
  }
};

exports.createPlan = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const goalId = Number(req.params.goalId);
  const idempotencyKey = req.body.idempotencyKey || req.get('Idempotency-Key');
  if (!idempotencyKey) return res.status(400).json({ error: 'Chave de idempotência obrigatória' });
  try {
    const result = await withTransaction(async (connection) => {
      const [existing] = await connection.query('SELECT id FROM contribution_plans WHERE idempotency_key = ?', [idempotencyKey]);
      if (existing.length) return { id: existing[0].id, goalId, duplicate: true, ocorrencias: 0, totalPlanejadoCentavos: 0, restanteAPlanejarCentavos: 0, schedule: [] };
      const [goalRows] = await connection.query('SELECT * FROM goals WHERE id = ? AND usuario_id = ? FOR UPDATE', [goalId, usuarioId]);
      const goal = goalRows[0];
      if (!goal || goal.status !== 'active') {
        const error = new Error('Apenas metas ativas podem receber um plano');
        error.status = goal ? 409 : 404;
        throw error;
      }
      const movements = await getGoalMovements(connection, goalId);
      const { schedule, progress } = contributionSchedule(goal, movements, req.body);
      if (schedule.length === 0) {
        const error = new Error('A meta já atingiu o valor-alvo');
        error.status = 400;
        throw error;
      }
      const body = req.body;
      const fixedAmountCents = body.valorFixo === undefined ? null : toCents(body.valorFixo);
      const [insert] = await connection.query(
        `INSERT INTO contribution_plans
         (goal_id, metodo, frequencia, data_inicio, data_limite, dia_preferencial,
          valor_fixo, incremento_bps, valores_personalizados, status, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [goalId, body.metodo, body.frequencia, body.dataInicio, body.dataLimite,
          body.diaPreferencial || null, fixedAmountCents === null ? null : decimal(fixedAmountCents),
          Number(body.incrementoBps || 0), Array.isArray(body.valoresPersonalizados) ? JSON.stringify(body.valoresPersonalizados) : null,
          idempotencyKey]
      );
      await persistSchedule(connection, insert.insertId, goalId, schedule);
      await connection.query(
        "UPDATE contribution_plans SET status = 'paused' WHERE goal_id = ? AND id <> ? AND status = 'active'",
        [goalId, insert.insertId]
      );
      const totalScheduledCents = schedule.reduce((sum, item) => sum + item.amountCents, 0);
      return {
        id: insert.insertId,
        goalId,
        ocorrencias: schedule.length,
        totalPlanejadoCentavos: totalScheduledCents,
        restanteAPlanejarCentavos: Math.max(0, progress.remainingCents - totalScheduledCents),
        schedule,
      };
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível criar o plano' });
  }
};

exports.replan = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  const goalId = Number(req.params.goalId);
  const planId = Number(req.params.planId);
  try {
    const result = await withTransaction(async (connection) => {
      const [goalRows] = await connection.query('SELECT * FROM goals WHERE id = ? AND usuario_id = ? FOR UPDATE', [goalId, usuarioId]);
      const goal = goalRows[0];
      const [planRows] = await connection.query(
        'SELECT * FROM contribution_plans WHERE id = ? AND goal_id = ? FOR UPDATE',
        [planId, goalId]
      );
      if (!goal || !planRows[0]) {
        const error = new Error('Meta ou plano não encontrado');
        error.status = 404;
        throw error;
      }
      if (goal.status !== 'active') {
        const error = new Error('Reative a meta antes de replanejar');
        error.status = 409;
        throw error;
      }

      const body = req.body;
      const movements = await getGoalMovements(connection, goalId);
      const { schedule, progress } = contributionSchedule(goal, movements, body);
      const fixedAmountCents = body.valorFixo === undefined ? null : toCents(body.valorFixo);
      await connection.query(
        `UPDATE contribution_plans SET metodo = ?, frequencia = ?, data_inicio = ?, data_limite = ?,
         dia_preferencial = ?, valor_fixo = ?, incremento_bps = ?, valores_personalizados = ?, status = 'active'
         WHERE id = ?`,
        [body.metodo, body.frequencia, body.dataInicio, body.dataLimite, body.diaPreferencial || null,
          fixedAmountCents === null ? null : decimal(fixedAmountCents), Number(body.incrementoBps || 0),
          Array.isArray(body.valoresPersonalizados) ? JSON.stringify(body.valoresPersonalizados) : null, planId]
      );

      const [existing] = await connection.query(
        `SELECT * FROM contribution_occurrences WHERE plan_id = ? AND status IN ('pending','deferred')
         AND (status = 'deferred' OR data_prevista >= CURRENT_DATE)
         ORDER BY data_prevista FOR UPDATE`,
        [planId]
      );
      const manualDates = new Set(existing
        .filter((row) => row.ajuste_manual)
        .map((row) => parseIsoDate(row.data_prevista)));
      const deferredDates = new Set(existing
        .filter((row) => row.status === 'deferred')
        .map((row) => parseIsoDate(row.data_prevista)));
      const byDate = new Map(existing
        .filter((row) => row.status === 'pending' && !row.ajuste_manual && money(row.valor_contribuido) === 0)
        .map((row) => [parseIsoDate(row.data_prevista), row]));
      const applicableSchedule = schedule.filter((item) => !manualDates.has(item.date) && !deferredDates.has(item.date));
      const usedIds = new Set();
      for (const item of applicableSchedule) {
        const old = byDate.get(item.date);
        if (old) {
          await connection.query(
            `UPDATE contribution_occurrences SET valor_planejado = ?, status = 'pending', observacao = NULL
             WHERE id = ?`,
            [decimal(item.amountCents), old.id]
          );
          usedIds.add(old.id);
        } else {
          await connection.query(
            `INSERT INTO contribution_occurrences
             (plan_id, goal_id, data_prevista, valor_planejado, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [planId, goalId, item.date, decimal(item.amountCents)]
          );
        }
      }
      for (const row of existing) {
        if (row.status === 'pending' && !row.ajuste_manual && money(row.valor_contribuido) === 0 && !usedIds.has(row.id)) {
          await connection.query("UPDATE contribution_occurrences SET status = 'cancelled' WHERE id = ?", [row.id]);
        }
      }
      const totalScheduledCents = applicableSchedule.reduce((sum, item) => sum + item.amountCents, 0);
      return {
        id: planId,
        ocorrencias: applicableSchedule.length,
        totalPlanejadoCentavos: totalScheduledCents,
        restanteAPlanejarCentavos: Math.max(0, progress.remainingCents - totalScheduledCents),
      };
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Não foi possível replanejar' });
  }
};

exports.updatePlanStatus = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  if (!['active', 'paused', 'cancelled'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Situação inválida' });
  }
  try {
    const [result] = await pool.query(
      'UPDATE contribution_plans cp JOIN goals g ON g.id = cp.goal_id SET cp.status = ? WHERE cp.id = ? AND cp.goal_id = ? AND g.usuario_id = ?',
      [req.body.status, req.params.planId, req.params.goalId, usuarioId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Plano não encontrado' });
    res.json({ success: true, status: req.body.status });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível atualizar o plano' });
  }
};

exports.deferOccurrence = async (req, res) => {
  const usuarioId = req.user?.id || 1;
  let newDate;
  try {
    newDate = parseIsoDate(req.body.newDate);
  } catch {
    return res.status(400).json({ error: 'Nova data inválida' });
  }

  try {
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.query(
        `SELECT * FROM contribution_occurrences WHERE id = ? AND goal_id = ? FOR UPDATE`,
        [req.params.occurrenceId, req.params.goalId]
      );
      const occurrence = rows[0];
      if (!occurrence || !['pending', 'partial', 'overdue'].includes(occurrence.status)) {
        const error = new Error('Ocorrência não pode ser adiada');
        error.status = 409;
        throw error;
      }
      await connection.query("UPDATE contribution_occurrences SET status = 'deferred' WHERE id = ?", [occurrence.id]);
      const remainingCents = money(occurrence.valor_planejado) - money(occurrence.valor_contribuido);
      const [insert] = await connection.query(
        `INSERT INTO contribution_occurrences
         (plan_id, goal_id, data_prevista, valor_planejado, valor_contribuido, status, ajuste_manual, observacao)
         VALUES (?, ?, ?, ?, ?, 'pending', 1, ?)`,
        [occurrence.plan_id, occurrence.goal_id, newDate, decimal(remainingCents), '0.00', `Adiada da ocorrência ${occurrence.id}`]
      );
      return { id: insert.insertId, deferredFrom: occurrence.id, data: newDate, valorCentavos: remainingCents };
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({ error: error.message || 'Data já possui uma ocorrência do plano' });
  }
};

exports.skipOccurrence = async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE contribution_occurrences SET status = 'skipped'
       WHERE id = ? AND goal_id = ? AND status IN ('pending','partial','overdue')`,
      [req.params.occurrenceId, req.params.goalId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Ocorrência não encontrada ou encerrada' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível ignorar a ocorrência' });
  }
};