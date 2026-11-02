import axios from 'axios';


const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'http://' + window.location.hostname + ':3000';
  }
  return 'http://localhost:3000';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

export const TOKEN_STORAGE_KEY = 'auth_token';

// Injeta automaticamente o token JWT no cabeçalho Authorization
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Trata erros de autenticação (401) globalmente
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const url = error.config?.url || '';
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string; message?: string } } }).response;
    return response?.data?.error || response?.data?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export function getApiErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
  return (error as { response?: { status?: number } }).response?.status;
}

/* =======================
   TYPES
======================= */

export interface User {
  id: number;
  nome: string;
  email: string;
  created_at?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export interface Conta {
  id: number;
  nome: string;
  tipo: string;
  saldo: number;
}

export interface Cartao {
  id: number;
  nome: string;
  limite: number;
  limite_disponivel: number;
  saldo_utilizado: number;
  fechamento: number;
  vencimento: number;
  conta_id: number;
  cor?: string | null;
  limite_pessoal?: number | null;
  gasto_ciclo?: number;
  ciclo_inicio?: string;
  ciclo_fim?: string;
}

export interface CartaoCreateDTO {
  nome: string;
  limite: number;
  fechamento: number;
  vencimento: number;
  contaId: number;
  cor?: string | null;
  limitePessoal?: number | null;
}

export interface CardPaymentDTO {
  contaId: number;
  valor: number;
  data?: string;
  idempotencyKey: string;
}

export interface Categoria {
  id: number;
  nome: string;
  tipo: 'RECEITA' | 'DESPESA';
  cor: string;
}

export interface Orcamento {
  id: number;
  categoriaId: number;
  valor: number;
  mes: number;
  ano: number;
}

export interface Transacao {
  id: number;
  descricao: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  data: string;
  categoriaId: number;
  formaPagamento: 'DINHEIRO' | 'DEBITO' | 'CREDITO' | 'PIX' | 'TRANSFERENCIA';
  contaId?: number;
  cartaoId?: number;
}


export interface AlertEvent {
  id: number;
  alert_key: string;
  tipo: string;
  entidade_id: number | null;
  mensagem: string;
  created_at: string;
  lido_em: string | null;
}

export interface AlertsResponse {
  unreadCount: number;
  alerts: AlertEvent[];
}

export interface Goal {
  id: number;
  nome: string;
  descricao: string | null;
  valorAlvoCentavos: number;
  dataInicio: string;
  dataLimite: string;
  finalidade: string | null;
  contaId: number | null;
  observacoes: string | null;
  status: 'active' | 'paused' | 'completed' | 'archived' | 'cancelled';
  accumulatedCents: number;
  remainingCents: number;
  excessCents: number;
  progressPercent: number;
  plano?: {
    id: number;
    ocorrencias: number;
    totalPlanejadoCentavos: number;
    restanteAPlanejarCentavos: number;
  } | null;
}

export interface GoalFormDTO {
  nome: string;
  descricao?: string;
  valorAlvo: number;
  dataInicio: string;
  dataLimite: string;
  finalidade?: string;
  contaId?: number | null;
  observacoes?: string;
  plano?: ContributionPlanDTO;
  idempotencyKey?: string;
}

export interface ContributionPlanDTO {
  metodo: 'fixed' | 'calculated' | 'custom' | 'progressive';
  frequencia: 'weekly' | 'monthly';
  dataInicio: string;
  dataLimite: string;
  diaPreferencial?: number;
  valorFixo?: number;
  incrementoBps?: number;
  valoresPersonalizados?: number[];
  idempotencyKey?: string;
}

export interface ContributionOccurrence {
  id: number;
  planId: number;
  goalId: number;
  data: string;
  valorPlanejadoCentavos: number;
  valorContribuidoCentavos: number;
  valorRestanteCentavos: number;
  status: 'pending' | 'partial' | 'complete' | 'overdue' | 'deferred' | 'skipped' | 'cancelled';
  ajusteManual: boolean;
}

export interface FinanceSettings {
  percentualSeguro: number;
  horizonteDias: number;
  alertasPercentuais: number[];
}

export interface PlannedMovement {
  id: number;
  tipo: 'income' | 'commitment';
  descricao: string;
  valorCentavos: number;
  data: string;
  status: 'confirmed' | 'estimated' | 'pending' | 'paid' | 'cancelled';
  categoriaId: number | null;
  contaId: number | null;
}

export interface InternalTransfer {
  id: number;
  valorCentavos: number;
  data: string;
  descricao: string | null;
  contaOrigem: string;
  contaDestino: string;
  goalId: number | null;
}

export interface MonthlyReport {
  periodo: { mes: number; ano: number; diasComparados: number };
  resumo: {
    receitasCentavos: number;
    despesasCentavos: number;
    resultadoCentavos: number;
    saldoInicialCentavos: number | null;
    saldoFinalCentavos: number | null;
    saldoHistoricoIndisponivel: boolean;
    quantidadeTransacoes: number;
    despesaMediaCentavos: number | null;
    maiorDespesa: { descricao: string; data: string; valorCentavos: number } | null;
    categoriaMaiorDespesa: string | null;
    taxaPoupancaPercentual: number | null;
    contribuicoesMetasCentavos: number;
  };
  comparacao: {
    receitasVariacaoCentavos: number;
    despesasVariacaoCentavos: number;
    resultadoVariacaoCentavos: number;
    resultadoVariacaoPercentual: number | null;
    periodoAnteriorComparadoAteDia: number;
  };
  categorias: Array<{
    nome: string;
    receitasCentavos: number;
    despesasCentavos: number;
    percentualDespesas: number | null;
    quantidade: number;
    transacoes: Array<{
      id: number;
      categoria: string;
      data: string;
      descricao: string;
      tipo: string;
      valorCentavos: number;
      conta?: string | null;
      cartao?: string | null;
      formaPagamento?: string;
    }>;
  }>;
  avisos: string[];
}

/* =======================
   🔥 DÍVIDAS
======================= */
export interface DividaView {
  id: number;
  descricao: string;
  valor: number;
  status: 'pendente' | 'paga' | 'atrasada';
  categoriaId: number;
  tipoDivida: 'FIXA' | 'PARCELADA';
  parcelaTotal?: number;
  parcelaAtual?: number;
  dataVencimento: string;
  createdAt?: string;
}

export interface DividaCreateDTO {
  descricao: string;
  valor: number;
  categoriaId: number;
  tipoDivida: 'FIXA' | 'PARCELADA';
  parcelaTotal?: number;
  dataVencimento: string;
}

export interface DividaPagamentoDTO {
  valor: number;
  formaPagamento: 'DINHEIRO' | 'DEBITO' | 'CREDITO' | 'PIX' | 'TRANSFERENCIA';
  contaId?: number;
  cartaoId?: number;
}

/* =======================
   SALDOS / RELATÓRIOS
======================= */
export interface SaldoGeral {
  totalContas: number;
  totalCartoes: number;
  saldoGeral: number;
}

export interface ContaSaldo {
  id: number;
  nome: string;
  saldo: number;
}

export interface CartaoSaldo {
  id: number;
  nome: string;
  limite: number;
  usado: number;
  disponivel: number;
}

/* =======================
   APIs
======================= */
export const contasApi = {
  list: () => api.get<Conta[]>('/contas'),

  create: (data: Omit<Conta, 'id'>) =>
    api.post<Conta>('/contas', data),

  update: (id: number, data: Omit<Conta, 'id'>) =>
    api.put<Conta>(`/contas/${id}`, data),

  delete: (id: number) =>
    api.delete(`/contas/${id}`),
};

export const cartoesApi = {
  list: () => api.get<Cartao[]>('/cartoes'),

  create: (data: CartaoCreateDTO) =>
    api.post<Cartao>('/cartoes', data),

  update: (id: number, data: CartaoCreateDTO) =>
    api.put<Cartao>(`/cartoes/${id}`, data),

  delete: (id: number) =>
    api.delete(`/cartoes/${id}`),
  
  pagar: (id: number, data: CardPaymentDTO) =>
    api.patch(`/cartoes/${id}/pagar`, data),

};

export const categoriasApi = {
  list: () => api.get<Categoria[]>('/categorias'),

  create: (data: Omit<Categoria, 'id'>) =>
    api.post<Categoria>('/categorias', data),

  delete: (id: number) =>
    api.delete(`/categorias/${id}`),
};

export const orcamentosApi = {
  list: () => api.get<Orcamento[]>('/orcamentos'),

  create: (data: Omit<Orcamento, 'id'>) =>
    api.post<Orcamento>('/orcamentos', data),
};

/* =======================
   🔥 DÍVIDAS API
======================= */
export const dividasApi = {
  list: (mes?: number, ano?: number) =>
    api.get<DividaView[]>('/dividas', {
      params: { mes, ano },
    }),

  create: (data: DividaCreateDTO) => {
    const payload = {
      descricao: data.descricao,
      valor: data.valor,
      categoria_id: data.categoriaId,
      tipo_divida: data.tipoDivida.toLowerCase(),
      parcela_total: data.parcelaTotal ?? null,
      data_vencimento: data.dataVencimento,
    };

    return api.post<DividaView>('/dividas', payload);
  },

  pagar: (id: number, data: DividaPagamentoDTO) => {
    const payload = {
      valor: data.valor,
      forma_pagamento: data.formaPagamento,
      conta_id: data.contaId ?? null,
      cartao_id: data.cartaoId ?? null,
    };

    return api.patch(`/dividas/${id}/pagar`, payload);
  },

  delete: (id: number) =>
    api.delete(`/dividas/${id}`),
};

/* =======================
   🔥 TRANSAÇÕES (CRÍTICO)
======================= */
export const transacoesApi = {
  list: () => api.get<Transacao[]>('/transacoes'),

  delete: (id: number) =>
    api.delete(`/transacoes/${id}`),

  create: (data: Omit<Transacao, 'id'> & { idempotencyKey?: string }) => {
    const payload = {
      descricao: data.descricao,
      valor: data.valor,
      tipo: data.tipo,
      data: data.data,
      forma_pagamento: data.formaPagamento,
      categoria_id: data.categoriaId,
      conta_id: data.contaId ?? null,
      cartao_id: data.cartaoId ?? null,
      idempotencyKey: data.idempotencyKey,
    };

    return api.post<{
      id: number;
      duplicado?: boolean;
      excedeLimitePessoal?: boolean;
      alertas?: Array<{ mensagem: string }>;
    }>('/transacoes', payload);
  },
};

export const financialApi = {
  alerts: () => api.get<AlertsResponse>('/financeiro/alerts'),
  markAlertRead: (id: number) => api.patch(`/financeiro/alerts/${id}/read`),
  dismissAlert: (id: number) => api.patch(`/financeiro/alerts/${id}/dismiss`),
  markAllAlertsRead: () => api.post('/financeiro/alerts/read-all'),

  settings: () => api.get<FinanceSettings>('/financeiro/settings'),
  updateSettings: (data: FinanceSettings) => api.put<FinanceSettings>('/financeiro/settings', data),
  planning: (horizonDays?: number) => api.get('/financeiro/planning', { params: { horizonDays } }),
  monthlyReport: (month: number, year: number, filters?: {
    tipo?: 'entrada' | 'saida';
    categoriaId?: number;
    contaId?: number;
    cartaoId?: number;
  }) => api.get<MonthlyReport>('/financeiro/reports/monthly', { params: { month, year, ...filters } }),
  trend: (months: 6 | 12 | 24, month?: number, year?: number, filters?: {
    tipo?: 'entrada' | 'saida';
    categoriaId?: number;
    contaId?: number;
    cartaoId?: number;
  }) => api.get('/financeiro/reports/trend', { params: { months, month, year, ...filters } }),
  plannedMovements: () => api.get<PlannedMovement[]>('/financeiro/planned-movements'),
  createPlannedMovement: (data: Omit<PlannedMovement, 'id' | 'valorCentavos'> & { valor: number; idempotencyKey: string }) =>
    api.post('/financeiro/planned-movements', data),
  settlePlannedMovement: (id: number, data: { contaId: number; formaPagamento: string; idempotencyKey: string }) =>
    api.patch(`/financeiro/planned-movements/${id}/settle`, data),
  cancelPlannedMovement: (id: number) => api.patch(`/financeiro/planned-movements/${id}/cancel`),
  deletePlannedMovement: (id: number) => api.delete(`/financeiro/planned-movements/${id}`),
  clearPlannedMovements: (status?: string) => api.delete('/financeiro/planned-movements', { params: { status } }),
  resetPlanning: () => api.post('/financeiro/planning/reset'),
  transfers: () => api.get<InternalTransfer[]>('/financeiro/transfers'),
  createTransfer: (data: {
    contaOrigemId: number;
    contaDestinoId: number;
    valor: number;
    data: string;
    descricao?: string;
    idempotencyKey: string;
  }) => api.post('/financeiro/transfers', data),
};

export const goalsApi = {
  list: () => api.get<Goal[]>('/metas'),
  create: (data: GoalFormDTO) => api.post<Goal>('/metas', data),
  update: (id: number, data: GoalFormDTO) => api.put<Goal>(`/metas/${id}`, data),
  delete: (id: number) => api.delete(`/metas/${id}`),
  reset: (id: number) => api.post(`/metas/${id}/reset`),
  deletePlan: (id: number) => api.delete(`/metas/${id}/plans`),
  clearAll: () => api.delete('/metas'),
  setStatus: (id: number, status: Goal['status']) => api.patch(`/metas/${id}/status`, { status }),
  movements: (id: number) => api.get(`/metas/${id}/movements`),
  contribute: (id: number, data: {
    tipo: 'contribution' | 'withdrawal' | 'adjustment';
    modalidade: 'virtual' | 'transfer' | 'adjustment';
    valor: number;
    data: string;
    contaOrigemId?: number;
    contaDestinoId?: number;
    occurrenceId?: number;
    idempotencyKey: string;
    observacao?: string;
  }) => api.post(`/metas/${id}/movements`, data),
  reverseMovement: (id: number, movementId: number, data: { data: string; idempotencyKey: string }) =>
    api.post(`/metas/${id}/movements/${movementId}/reverse`, data),
  plans: (id: number) => api.get(`/metas/${id}/plans`),
  createPlan: (id: number, data: ContributionPlanDTO) => api.post(`/metas/${id}/plans`, data),
  replan: (id: number, planId: number, data: ContributionPlanDTO) =>
    api.put(`/metas/${id}/plans/${planId}/replan`, data),
  setPlanStatus: (id: number, planId: number, status: 'active' | 'paused' | 'cancelled') =>
    api.patch(`/metas/${id}/plans/${planId}/status`, { status }),
  contributeToOccurrence: (goalId: number, occurrenceId: number, data: Parameters<typeof goalsApi.contribute>[1]) =>
    api.post(`/metas/${goalId}/occurrences/${occurrenceId}/contribute`, data),
  deferOccurrence: (goalId: number, occurrenceId: number, newDate: string) =>
    api.post(`/metas/${goalId}/occurrences/${occurrenceId}/defer`, { newDate }),
  skipOccurrence: (goalId: number, occurrenceId: number) =>
    api.post(`/metas/${goalId}/occurrences/${occurrenceId}/skip`),
};

export const relatoriosApi = {
  saldoGeral: () =>
    api.get<SaldoGeral>('/relatorios/saldo-geral'),

  saldoContas: () =>
    api.get<ContaSaldo[]>('/relatorios/saldo-contas'),

  saldoCartoes: () =>
    api.get<CartaoSaldo[]>('/relatorios/saldo-cartoes'),
};


export const authApi = {
  login: (data: { email: string; senha: string }) =>
    api.post<AuthResponse>('/auth/login', data),
  register: (data: { nome: string; email: string; senha: string }) =>
    api.post<AuthResponse>('/auth/register', data),
  me: () =>
    api.get<{ user: User }>('/auth/me'),
};

export default api;
