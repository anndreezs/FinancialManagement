const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function toCents(value) {
  const match = String(value ?? '').trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new TypeError('Valor monetário inválido');

  const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(cents)) throw new RangeError('Valor monetário fora do limite');
  return match[1] === '-' ? -cents : cents;
}

function centsToDecimal(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('Centavos inválidos');
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

function parseIsoDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Data inválida');
    return value.toISOString().slice(0, 10);
  }

  const date = String(value ?? '').slice(0, 10);
  if (!isoDatePattern.test(date)) throw new TypeError('Data inválida');

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (parsed.toISOString().slice(0, 10) !== date) throw new TypeError('Data inválida');
  return date;
}

function addDays(date, days) {
  const parsed = new Date(`${parseIsoDate(date)}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function addMonths(date, months, preferredDay) {
  const [year, month] = parseIsoDate(date).split('-').map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(preferredDay, lastDay);
  return `${targetMonth.getUTCFullYear()}-${String(targetMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getCardCycleRange(date, closingDay) {
  const transactionDate = parseIsoDate(date);
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    throw new TypeError('Dia de fechamento inválido');
  }

  const [year, month] = transactionDate.split('-').map(Number);
  const closingThisMonth = addMonths(`${year}-${String(month).padStart(2, '0')}-01`, 0, closingDay);
  if (transactionDate > closingThisMonth) {
    const nextClosing = addMonths(closingThisMonth, 1, closingDay);
    return { startDate: addDays(closingThisMonth, 1), endDate: nextClosing };
  }

  const previousClosing = addMonths(closingThisMonth, -1, closingDay);
  return { startDate: addDays(previousClosing, 1), endDate: closingThisMonth };
}

function createMonthlyReport({ transactions, month, year }) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw new TypeError('Período inválido');
  }

  let totalIncomeCents = 0;
  let totalExpenseCents = 0;
  let transactionCount = 0;
  let negativeValueCount = 0;
  const categories = new Map();
  const expenses = [];

  for (const transaction of transactions) {
    let date;
    try {
      date = parseIsoDate(transaction.data);
    } catch {
      continue;
    }

    const [transactionYear, transactionMonth] = date.split('-').map(Number);
    if (transactionYear !== year || transactionMonth !== month) continue;

    let amountCents;
    try {
      amountCents = toCents(transaction.valor);
    } catch {
      continue;
    }

    if (amountCents < 0) {
      negativeValueCount += 1;
      amountCents = Math.abs(amountCents);
    }

    const type = String(transaction.tipo).toLowerCase();
    if (type !== 'entrada' && type !== 'saida') continue;

    transactionCount += 1;
    const categoryName = transaction.categoria_nome || transaction.categoria || 'Sem categoria';
    const category = categories.get(categoryName) || {
      categoria: categoryName,
      receitasCentavos: 0,
      despesasCentavos: 0,
      quantidade: 0,
    };
    category.quantidade += 1;

    if (type === 'entrada') {
      totalIncomeCents += amountCents;
      category.receitasCentavos += amountCents;
    } else {
      totalExpenseCents += amountCents;
      category.despesasCentavos += amountCents;
      expenses.push({
        id: transaction.id,
        descricao: transaction.descricao,
        data: date,
        valorCentavos: amountCents,
        categoria: categoryName,
      });
    }

    categories.set(categoryName, category);
  }

  const categoryRows = [...categories.values()]
    .map((category) => ({
      ...category,
      percentualDespesas: totalExpenseCents === 0
        ? null
        : Math.round(category.despesasCentavos * 10000 / totalExpenseCents) / 100,
    }))
    .sort((left, right) => right.despesasCentavos - left.despesasCentavos);
  const netCents = totalIncomeCents - totalExpenseCents;

  return {
    month,
    year,
    totalIncomeCents,
    totalExpenseCents,
    netCents,
    transactionCount,
    averageExpenseCents: expenses.length === 0 ? null : Math.round(totalExpenseCents / expenses.length),
    largestExpense: expenses.sort((left, right) => right.valorCentavos - left.valorCentavos)[0] || null,
    largestExpenseCategory: categoryRows.find((category) => category.despesasCentavos > 0)?.categoria || null,
    savingsRatePercent: totalIncomeCents === 0
      ? null
      : Math.round(netCents * 10000 / totalIncomeCents) / 100,
    categories: categoryRows,
    integrityWarnings: negativeValueCount === 0 ? [] : [`${negativeValueCount} transação(ões) tinham valor negativo e foram interpretadas pela magnitude.`],
  };
}

function calculateSafeBalance({
  saldoAtualCentavos,
  reservasVirtuaisCentavos = 0,
  percentualBps = 7000,
  inicio,
  horizonteDias,
  entradas = [],
  compromissos = [],
}) {
  if (!Number.isSafeInteger(saldoAtualCentavos) || !Number.isSafeInteger(reservasVirtuaisCentavos)) {
    throw new TypeError('Saldos devem ser informados em centavos inteiros');
  }
  if (!Number.isInteger(percentualBps) || percentualBps < 0 || percentualBps > 10000) {
    throw new TypeError('Percentual de segurança inválido');
  }
  if (!Number.isInteger(horizonteDias) || horizonteDias < 1 || horizonteDias > 366) {
    throw new TypeError('Horizonte inválido');
  }

  const start = parseIsoDate(inicio);
  const end = addDays(start, horizonteDias - 1);
  const events = [];
  const seen = new Set();

  const appendEvents = (records, kind) => {
    for (const record of records) {
      if (record.id !== undefined) {
        const identity = `${kind}:${record.id}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
      }

      if (kind === 'income' && (record.confirmed !== true || record.status !== 'confirmed')) continue;
      if (kind === 'commitment' && record.status !== 'pending') continue;

      const amountCents = record.amountCents;
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) continue;

      let date;
      try {
        date = parseIsoDate(record.date);
      } catch {
        continue;
      }
      if (kind === 'income' && date < start) continue;
      if (date > end) continue;
      if (date < start) date = start;

      events.push({
        id: record.id ?? null,
        date,
        kind,
        amountCents,
        description: record.description || '',
        priority: kind === 'commitment' ? 0 : 1,
      });
    }
  };

  appendEvents(compromissos, 'commitment');
  appendEvents(entradas, 'income');
  events.sort((left, right) => left.date.localeCompare(right.date) || left.priority - right.priority);

  let projectedCents = saldoAtualCentavos - reservasVirtuaisCentavos;
  let lowestProjectedCents = projectedCents;
  let lowestBalanceDate = start;
  let eligibleIncomeCents = 0;
  let pendingCommitmentCents = 0;

  for (const event of events) {
    if (event.kind === 'income') {
      projectedCents += event.amountCents;
      eligibleIncomeCents += event.amountCents;
    } else {
      projectedCents -= event.amountCents;
      pendingCommitmentCents += event.amountCents;
    }

    if (projectedCents < lowestProjectedCents) {
      lowestProjectedCents = projectedCents;
      lowestBalanceDate = event.date;
    }
  }

  const safeBalanceCents = projectedCents <= 0
    ? 0
    : Math.round(projectedCents * percentualBps / 10000);

  return {
    start,
    end,
    saldoAtualCentavos,
    entradasElegiveisCentavos: eligibleIncomeCents,
    compromissosPendentesCentavos: pendingCommitmentCents,
    reservasVirtuaisCentavos,
    saldoResidualCentavos: projectedCents,
    saldoSeguroCentavos: safeBalanceCents,
    menorSaldoProjetadoCentavos: lowestProjectedCents,
    dataMenorSaldo: lowestBalanceDate,
    riscoInsuficiencia: lowestProjectedCents < 0,
    events,
  };
}

function calculateGoalProgress({ targetCents, movements }) {
  if (!Number.isSafeInteger(targetCents) || targetCents <= 0) {
    throw new TypeError('Meta deve ter valor-alvo positivo');
  }

  const byId = new Map(movements.map((movement) => [String(movement.id), movement]));
  const effects = new Map();
  const reversed = new Set();
  let accumulatedCents = 0;

  for (const movement of movements) {
    if (movement.status !== undefined && movement.status !== 'posted') continue;

    let effectCents;
    if (movement.type === 'contribution' || movement.type === 'withdrawal') {
      if (!Number.isSafeInteger(movement.amountCents) || movement.amountCents <= 0) continue;
      effectCents = movement.type === 'contribution' ? movement.amountCents : -movement.amountCents;
    } else if (movement.type === 'adjustment') {
      if (!Number.isSafeInteger(movement.amountCents)) continue;
      effectCents = movement.amountCents;
    } else if (movement.type === 'reversal') {
      const originalId = String(movement.reversesMovementId);
      const original = byId.get(originalId);
      const originalEffect = effects.get(originalId);
      if (!original || originalEffect === undefined || reversed.has(originalId)) continue;
      effectCents = -originalEffect;
      reversed.add(originalId);
    } else {
      continue;
    }

    effects.set(String(movement.id), effectCents);
    accumulatedCents += effectCents;
  }

  return {
    accumulatedCents,
    remainingCents: Math.max(0, targetCents - accumulatedCents),
    excessCents: Math.max(0, accumulatedCents - targetCents),
    progressPercent: Math.min(100, Math.max(0, Math.round(accumulatedCents * 10000 / targetCents) / 100)),
  };
}

function buildContributionSchedule({
  remainingCents,
  startDate,
  dueDate,
  frequency,
  preferredDay,
  method = 'calculated',
  fixedAmountCents,
  customAmountsCents,
  incrementBps = 0,
}) {
  if (!Number.isSafeInteger(remainingCents) || remainingCents < 0) {
    throw new TypeError('Valor restante inválido');
  }

  const start = parseIsoDate(startDate);
  const due = parseIsoDate(dueDate);
  if (due < start) throw new TypeError('Prazo anterior ao início do plano');
  if (frequency !== 'weekly' && frequency !== 'monthly') throw new TypeError('Frequência inválida');
  if (remainingCents === 0) return [];

  const day = preferredDay ?? Number(start.slice(8, 10));
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new TypeError('Dia preferencial inválido');
  if (!['fixed', 'calculated', 'custom', 'progressive'].includes(method)) throw new TypeError('Método inválido');
  if (method === 'fixed' && (!Number.isSafeInteger(fixedAmountCents) || fixedAmountCents <= 0)) {
    throw new TypeError('Valor fixo inválido');
  }
  if (method === 'progressive'
    && (!Number.isSafeInteger(fixedAmountCents) || fixedAmountCents <= 0
      || !Number.isInteger(incrementBps) || incrementBps < 0 || incrementBps > 10000)) {
    throw new TypeError('Configuração progressiva inválida');
  }

  const dates = [];
  let date = start;
  while (date <= due) {
    dates.push(date);
    if (dates.length > 520) throw new RangeError('Plano excede o limite de ocorrências suportado');
    const nextDate = frequency === 'weekly'
      ? addDays(date, 7)
      : addMonths(start, dates.length, day);
    if (nextDate <= date) throw new RangeError('A programação não avançou');
    date = nextDate;
  }

  if (dates.length === 0) throw new TypeError('O prazo não comporta contribuições');
  if (method === 'custom'
    && (!Array.isArray(customAmountsCents) || customAmountsCents.length !== dates.length
      || customAmountsCents.some((amount) => !Number.isSafeInteger(amount) || amount <= 0))) {
    throw new TypeError('Informe um valor positivo para cada período personalizado');
  }

  let allocatedCents = 0;

  const schedule = [];
  for (let index = 0; index < dates.length && allocatedCents < remainingCents; index += 1) {
    let amountCents;
    if (method === 'calculated') {
      amountCents = index === dates.length - 1
        ? remainingCents - allocatedCents
        : Math.floor(remainingCents / dates.length);
      if (index === dates.length - 1) amountCents = remainingCents - allocatedCents;
    } else if (method === 'custom') {
      amountCents = customAmountsCents[index];
    } else if (method === 'progressive') {
      amountCents = Math.round(fixedAmountCents * ((10000 + incrementBps) / 10000) ** index);
    } else {
      amountCents = fixedAmountCents;
    }

    amountCents = Math.min(amountCents, remainingCents - allocatedCents);
    if (amountCents <= 0) throw new TypeError('A contribuição calculada precisa ser positiva');
    allocatedCents += amountCents;
    schedule.push({ date: dates[index], amountCents });
  }

  return schedule;
}

module.exports = {
  addDays,
  addMonths,
  buildContributionSchedule,
  calculateGoalProgress,
  calculateSafeBalance,
  centsToDecimal,
  createMonthlyReport,
  getCardCycleRange,
  parseIsoDate,
  toCents,
};