const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildContributionSchedule,
  calculateGoalProgress,
  calculateSafeBalance,
  centsToDecimal,
  createMonthlyReport,
  getCardCycleRange,
  toCents,
} = require('../services/financialDomain');

test('converts decimal amounts to integer cents without floating-point sums', () => {
  assert.equal(toCents('10.10'), 1010);
  assert.equal(toCents('-0.35'), -35);
  assert.equal(centsToDecimal(1010), '10.10');
  assert.throws(() => toCents('1.001'), TypeError);
});

test('monthly report separates income, expenses, and neutral movements', () => {
  const report = createMonthlyReport({
    month: 10,
    year: 2026,
    transactions: [
      { id: 1, tipo: 'entrada', valor: '2500.00', data: '2026-10-01', categoria_nome: 'Salário' },
      { id: 2, tipo: 'saida', valor: '10.10', data: '2026-10-02', categoria_nome: 'Mercado' },
      { id: 3, tipo: 'saida', valor: '5.90', data: '2026-10-03' },
      { id: 4, tipo: 'transferencia', valor: '100.00', data: '2026-10-04' },
      { id: 5, tipo: 'pagamento_fatura', valor: '50.00', data: '2026-10-05' },
    ],
  });

  assert.equal(report.totalIncomeCents, 250000);
  assert.equal(report.totalExpenseCents, 1600);
  assert.equal(report.netCents, 248400);
  assert.equal(report.transactionCount, 3);
  assert.equal(report.categories.find((category) => category.categoria === 'Sem categoria').despesasCentavos, 590);
});

test('safe balance finds a chronological low point and excludes unconfirmed income', () => {
  const projection = calculateSafeBalance({
    saldoAtualCentavos: 100000,
    percentualBps: 7000,
    inicio: '2026-10-01',
    horizonteDias: 30,
    compromissos: [
      { id: 'rent', date: '2026-10-02', amountCents: 80000, status: 'pending' },
      { id: 'paid', date: '2026-10-03', amountCents: 5000, status: 'paid' },
    ],
    entradas: [
      { id: 'salary', date: '2026-10-10', amountCents: 150000, status: 'confirmed', confirmed: true },
      { id: 'estimate', date: '2026-10-05', amountCents: 1000000, status: 'estimated', confirmed: false },
    ],
  });

  assert.equal(projection.menorSaldoProjetadoCentavos, 20000);
  assert.equal(projection.dataMenorSaldo, '2026-10-02');
  assert.equal(projection.saldoResidualCentavos, 170000);
  assert.equal(projection.saldoSeguroCentavos, 119000);
  assert.equal(projection.riscoInsuficiencia, false);
});

test('goal progress reverses movements and reports remaining/excess separately', () => {
  const progress = calculateGoalProgress({
    targetCents: 20000,
    movements: [
      { id: 1, type: 'contribution', amountCents: 20000, status: 'posted' },
      { id: 2, type: 'withdrawal', amountCents: 5000, status: 'posted' },
      { id: 3, type: 'reversal', reversesMovementId: 2, status: 'posted' },
    ],
  });

  assert.deepEqual(progress, {
    accumulatedCents: 20000,
    remainingCents: 0,
    excessCents: 0,
    progressPercent: 100,
  });
});

test('monthly contribution plan clamps leap-year dates and allocates remainder exactly', () => {
  const schedule = buildContributionSchedule({
    remainingCents: 10000,
    startDate: '2028-01-31',
    dueDate: '2028-03-31',
    frequency: 'monthly',
    preferredDay: 31,
  });

  assert.deepEqual(schedule, [
    { date: '2028-01-31', amountCents: 3333 },
    { date: '2028-02-29', amountCents: 3333 },
    { date: '2028-03-31', amountCents: 3334 },
  ]);
});

test('fixed, custom, and progressive contribution plans preserve their policies', () => {
  const common = {
    remainingCents: 2500,
    startDate: '2026-01-01',
    dueDate: '2026-03-01',
    frequency: 'monthly',
    preferredDay: 1,
  };

  assert.deepEqual(buildContributionSchedule({ ...common, method: 'fixed', fixedAmountCents: 1000 }), [
    { date: '2026-01-01', amountCents: 1000 },
    { date: '2026-02-01', amountCents: 1000 },
    { date: '2026-03-01', amountCents: 500 },
  ]);
  assert.deepEqual(buildContributionSchedule({
    ...common,
    method: 'custom',
    customAmountsCents: [500, 1000, 1000],
  }).map((entry) => entry.amountCents), [500, 1000, 1000]);
  assert.deepEqual(buildContributionSchedule({
    ...common,
    method: 'progressive',
    fixedAmountCents: 500,
    incrementBps: 10000,
  }).map((entry) => entry.amountCents), [500, 1000, 1000]);
});

test('card cycle follows close date and clamps closing days in short months', () => {
  assert.deepEqual(getCardCycleRange('2026-10-12', 4), {
    startDate: '2026-10-05',
    endDate: '2026-11-04',
  });
  assert.deepEqual(getCardCycleRange('2028-02-15', 31), {
    startDate: '2028-02-01',
    endDate: '2028-02-29',
  });
  assert.deepEqual(getCardCycleRange('2026-10-02', 4), {
    startDate: '2026-09-05',
    endDate: '2026-10-04',
  });
});

test('safe balance uses an inclusive N-day horizon and excludes overdue income', () => {
  const projection = calculateSafeBalance({
    saldoAtualCentavos: 10000,
    percentualBps: 7000,
    inicio: '2026-10-01',
    horizonteDias: 7,
    entradas: [
      { id: 'late-income', date: '2026-09-30', amountCents: 50000, status: 'confirmed', confirmed: true },
      { id: 'outside-income', date: '2026-10-08', amountCents: 80000, status: 'confirmed', confirmed: true },
    ],
    compromissos: [
      { id: 'inside', date: '2026-10-07', amountCents: 1000, status: 'pending' },
      { id: 'outside', date: '2026-10-08', amountCents: 7000, status: 'pending' },
    ],
  });

  assert.equal(projection.end, '2026-10-07');
  assert.equal(projection.entradasElegiveisCentavos, 0);
  assert.equal(projection.compromissosPendentesCentavos, 1000);
  assert.equal(projection.saldoResidualCentavos, 9000);
});