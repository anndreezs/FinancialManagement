import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { financialApi, contasApi, categoriasApi, getApiErrorMessage } from '@/lib/api';
import type { Conta, Categoria, FinanceSettings, InternalTransfer, PlannedMovement } from '@/lib/api';
import { toast } from 'sonner';

const formatMoney = (cents: number | null | undefined) => {
  if (cents === null || cents === undefined) return 'R$ 0,00';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface ProjectionEvent {
  id: string | number;
  date: string;
  kind: 'income' | 'commitment';
  amountCents: number;
  description: string;
  origem: string;
}

interface Projection {
  start: string;
  end: string;
  saldoAtualCentavos: number;
  entradasElegiveisCentavos: number;
  compromissosPendentesCentavos: number;
  reservasVirtuaisCentavos: number;
  saldoResidualCentavos: number;
  saldoSeguroCentavos: number;
  menorSaldoProjetadoCentavos: number;
  dataMenorSaldo: string;
  riscoInsuficiencia: boolean;
  events: ProjectionEvent[];
}

interface PlanningData {
  configuracoes: FinanceSettings;
  projecao: Projection;
  projecaoComPlanos: {
    saldoResidualCentavos: number;
    saldoSeguroCentavos: number;
    menorSaldoProjetadoCentavos: number;
    dataMenorSaldo: string;
    riscoInsuficiencia: boolean;
    contribuicoesPlanejadasCentavos: number;
  };
  avisos: string[];
}

export default function Planejamento() {
  const [settings, setSettings] = useState<FinanceSettings>({
    percentualSeguro: 70,
    horizonteDias: 30,
    alertasPercentuais: [50, 70, 80, 90, 100],
  });
  const [planning, setPlanning] = useState<PlanningData | null>(null);
  const [movements, setMovements] = useState<PlannedMovement[]>([]);
  const [transfers, setTransfers] = useState<InternalTransfer[]>([]);
  const [accounts, setAccounts] = useState<Conta[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modais de ação
  const [newMovementOpen, setNewMovementOpen] = useState(false);
  const [movementKind, setMovementKind] = useState<'income' | 'commitment'>('commitment');
  const [transferOpen, setTransferOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settlingMovement, setSettlingMovement] = useState<PlannedMovement | null>(null);

  // Modais de exclusão e reset
  const [movementToDelete, setMovementToDelete] = useState<PlannedMovement | null>(null);
  const [deleteMovementDialogOpen, setDeleteMovementDialogOpen] = useState(false);
  const [resetPlanningDialogOpen, setResetPlanningDialogOpen] = useState(false);

  // Formulário de novo lançamento previsto
  const [formDescricao, setFormDescricao] = useState('');
  const [formValor, setFormValor] = useState('');
  const [formData, setFormData] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCategoriaId, setFormCategoriaId] = useState<string>('none');
  const [formContaId, setFormContaId] = useState<string>('none');
  const [formStatusIncome, setFormStatusIncome] = useState<'confirmed' | 'estimated'>('confirmed');

  // Formulário de liquidação/efetivação
  const [settleAccountId, setSettleAccountId] = useState('');
  const [settleMethod, setSettleMethod] = useState('pix');

  // Formulário de transferência
  const [transfOrigem, setTransfOrigem] = useState('');
  const [transfDestino, setTransfDestino] = useState('');
  const [transfValor, setTransfValor] = useState('');
  const [transfData, setTransfData] = useState(() => new Date().toISOString().slice(0, 10));
  const [transfDesc, setTransfDesc] = useState('');

  const refreshData = useCallback(async (horizonte?: number) => {
    try {
      setLoading(true);
      const [settingsRes, planningRes, movementsRes, accountsRes, categoriesRes, transfersRes] = await Promise.all([
        financialApi.settings(),
        financialApi.planning(horizonte),
        financialApi.plannedMovements(),
        contasApi.list(),
        categoriasApi.list(),
        financialApi.transfers(),
      ]);

      setSettings(settingsRes.data);
      setPlanning(planningRes.data);
      setMovements(movementsRes.data);
      setAccounts(accountsRes.data.map((c) => ({ ...c, saldo: Number(c.saldo) })));
      setCategories(categoriesRes.data);
      setTransfers(transfersRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar dados do planejamento financeiro');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Alterar horizonte rápido
  const handleHorizonChange = async (days: number) => {
    try {
      await financialApi.updateSettings({ ...settings, horizonteDias: days });
      setSettings((prev) => ({ ...prev, horizonteDias: days }));
      await refreshData(days);
      toast.success(`Projeção recalculada para os próximos ${days} dias`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao alterar período da projeção'));
    }
  };

  // Salvar configurações
  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      await financialApi.updateSettings(settings);
      toast.success('Configurações de segurança atualizadas com sucesso');
      setSettingsOpen(false);
      await refreshData(settings.horizonteDias);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao atualizar configurações'));
    } finally {
      setSaving(false);
    }
  };

  // Criar lançamento previsto
  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(formValor.replace(',', '.'));
    if (!formDescricao.trim() || !Number.isFinite(val) || val <= 0 || !formData) {
      toast.error('Informe descrição, valor positivo e data válida');
      return;
    }

    try {
      setSaving(true);
      await financialApi.createPlannedMovement({
        tipo: movementKind,
        descricao: formDescricao.trim(),
        valor: val,
        data: formData,
        status: movementKind === 'income' ? formStatusIncome : 'pending',
        categoriaId: formCategoriaId !== 'none' ? Number(formCategoriaId) : undefined,
        contaId: formContaId !== 'none' ? Number(formContaId) : undefined,
        idempotencyKey: crypto.randomUUID(),
      });

      toast.success(
        movementKind === 'income'
          ? 'Receita futura adicionada ao planejamento! 📈'
          : 'Conta a pagar cadastrada no planejamento! 📉'
      );

      setNewMovementOpen(false);
      setFormDescricao('');
      setFormValor('');
      setFormCategoriaId('none');
      setFormContaId('none');
      await refreshData(settings.horizonteDias);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao criar lançamento previsto'));
    } finally {
      setSaving(false);
    }
  };

  // Efetivar previsão como transação real
  const handleSettleMovement = async () => {
    if (!settlingMovement || !settleAccountId) {
      toast.error('Selecione a conta bancária para efetivar a transação');
      return;
    }

    try {
      setSaving(true);
      await financialApi.settlePlannedMovement(settlingMovement.id, {
        contaId: Number(settleAccountId),
        formaPagamento: settleMethod,
        idempotencyKey: crypto.randomUUID(),
      });

      toast.success('Lançamento efetivado! O saldo da sua conta foi atualizado.');
      setSettlingMovement(null);
      await refreshData(settings.horizonteDias);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível efetivar o lançamento'));
    } finally {
      setSaving(false);
    }
  };

  // Excluir lançamento previsto definitivamente
  const handleConfirmDeleteMovement = async () => {
    if (!movementToDelete) return;
    try {
      setSaving(true);
      await financialApi.deletePlannedMovement(movementToDelete.id);
      toast.success('Lançamento previsto excluído com sucesso');
      setDeleteMovementDialogOpen(false);
      setMovementToDelete(null);
      await refreshData(settings.horizonteDias);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao excluir previsão'));
    } finally {
      setSaving(false);
    }
  };

  // Resetar Planejamento Completo (Começar do Zero)
  const handleConfirmResetPlanning = async () => {
    try {
      setSaving(true);
      await financialApi.resetPlanning();
      toast.success('Planejamento zerado com sucesso! Você pode recomeçar do zero.');
      setResetPlanningDialogOpen(false);
      await refreshData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao resetar planejamento'));
    } finally {
      setSaving(false);
    }
  };

  // Criar transferência interna
  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(transfValor.replace(',', '.'));
    if (!transfOrigem || !transfDestino || transfOrigem === transfDestino || !Number.isFinite(val) || val <= 0) {
      toast.error('Selecione contas de origem e destino diferentes e informe um valor positivo');
      return;
    }

    try {
      setSaving(true);
      await financialApi.createTransfer({
        contaOrigemId: Number(transfOrigem),
        contaDestinoId: Number(transfDestino),
        valor: val,
        data: transfData,
        descricao: transfDesc.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      });

      toast.success('Transferência realizada com sucesso!');
      setTransferOpen(false);
      setTransfValor('');
      setTransfDesc('');
      await refreshData(settings.horizonteDias);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao realizar transferência'));
    } finally {
      setSaving(false);
    }
  };

  const projection = planning?.projecao;
  const activeMovements = movements.filter((m) => ['confirmed', 'estimated', 'pending'].includes(m.status));

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Planejamento & Saldo Seguro</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Previsão inteligente do seu caixa para os próximos dias, para você gastar sem risco de ficar no vermelho.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor rápido de horizonte */}
          <Select
            value={String(settings.horizonteDias)}
            onValueChange={(val) => handleHorizonChange(Number(val))}
          >
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">Próximos 15 dias</SelectItem>
              <SelectItem value="30">Próximos 30 dias</SelectItem>
              <SelectItem value="60">Próximos 60 dias</SelectItem>
              <SelectItem value="90">Próximos 90 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setTransferOpen(true)}
            className="h-9 text-xs gap-1.5"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Transferir
          </Button>

          {activeMovements.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetPlanningDialogOpen(true)}
              className="h-9 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Limpar todos os lançamentos do planejamento e recomeçar do zero"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Recomeçar do Zero
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => {
              setMovementKind('commitment');
              setNewMovementOpen(true);
            }}
            className="h-9 text-xs gap-1.5 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Lançamento
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            title="Configurações de Segurança"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Alerta de Insuficiência / Risco de Negativo */}
      {projection?.riscoInsuficiencia && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">Atenção: Risco de saldo negativo projetado!</p>
            <p className="text-xs sm:text-sm mt-0.5 opacity-90">
              Pelos compromissos previstos, seu saldo poderá atingir{' '}
              <strong className="font-bold underline">{formatMoney(projection.menorSaldoProjetadoCentavos)}</strong> em{' '}
              {new Date(`${projection.dataMenorSaldo}T00:00:00`).toLocaleDateString('pt-BR')}. Planeje antecipar receitas ou postergar pagamentos.
            </p>
          </div>
        </div>
      )}

      {/* Cards de Métricas Principais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Saldo Hoje */}
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Saldo Total Hoje</span>
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-foreground">
            {formatMoney(projection?.saldoAtualCentavos ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Disponível em todas as suas contas bancárias</p>
        </div>

        {/* Card 2: Contas e Dívidas Previstas */}
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Contas no Período</span>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-destructive">
            - {formatMoney(projection?.compromissosPendentesCentavos ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Dívidas e compromissos até {settings.horizonteDias} dias
          </p>
        </div>

        {/* Card 3: Entradas Confirmadas */}
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Receitas Previstas</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            + {formatMoney(projection?.entradasElegiveisCentavos ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Rendimentos e salários confirmados no período
          </p>
        </div>

        {/* Card 4: Saldo Seguro (Destaque Principal) */}
        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-primary mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Saldo Seguro Sugerido</span>
            <ShieldCheck className="h-4 w-4" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-primary">
            {formatMoney(projection?.saldoSeguroCentavos ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Margem de {settings.percentualSeguro}% sobre a sobra projetada ({formatMoney(projection?.saldoResidualCentavos ?? 0)})
          </p>
        </div>
      </div>

      {/* Grid Principal: Linha do Tempo e Ações */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna 1 & 2: Linha do Tempo dos Lançamentos Futuros */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Lançamentos Futuros & Contas Previstas
            </h2>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMovementKind('income');
                  setNewMovementOpen(true);
                }}
                className="h-8 text-xs text-emerald-600 dark:text-emerald-400"
              >
                + Receita Futura
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMovementKind('commitment');
                  setNewMovementOpen(true);
                }}
                className="h-8 text-xs text-destructive"
              >
                + Conta a Pagar
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden">
            {activeMovements.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <CheckCircle2 className="mx-auto h-8 w-8 text-primary/40 mb-2" />
                <p className="text-sm font-medium text-foreground">Nenhum compromisso pendente cadastrado</p>
                <p className="text-xs mt-1">Cadastre contas futuras ou salários para simular seu fluxo de caixa e planejar seus gastos.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {activeMovements.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-lg mt-0.5 ${
                          item.tipo === 'income'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {item.tipo === 'income' ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.descricao}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>
                            {new Date(`${item.data}T00:00:00`).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                          <span>•</span>
                          <span className="capitalize">
                            {item.tipo === 'income'
                              ? item.status === 'confirmed'
                                ? 'Receita Confirmada'
                                : 'Receita Estimada'
                              : 'Compromisso a Pagar'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <span
                        className={`text-sm font-bold ${
                          item.tipo === 'income' ? 'text-emerald-500' : 'text-foreground'
                        }`}
                      >
                        {item.tipo === 'income' ? '+' : '-'} {formatMoney(item.valorCentavos)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSettlingMovement(item);
                            setSettleAccountId(item.contaId ? String(item.contaId) : accounts[0]?.id ? String(accounts[0].id) : '');
                          }}
                          className="h-8 text-xs"
                          title="Marcar como efetivado e atualizar saldo bancário"
                        >
                          Efetivar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setMovementToDelete(item);
                            setDeleteMovementDialogOpen(true);
                          }}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Excluir lançamento previsto definitivamente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Histórico Recente de Transferências entre Contas */}
          {transfers.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transferências Recentes Entre Suas Contas
              </h3>
              <div className="rounded-xl border border-border/70 bg-card p-3 divide-y divide-border/40">
                {transfers.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 text-xs first:pt-1 last:pb-1">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      <span>
                        <strong className="font-semibold text-foreground">{t.contaOrigem}</strong>
                        {' → '}
                        <strong className="font-semibold text-foreground">{t.contaDestino}</strong>
                        {t.descricao && <span className="text-muted-foreground ml-1.5">({t.descricao})</span>}
                      </span>
                    </div>
                    <span className="font-semibold text-foreground">{formatMoney(t.valorCentavos)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna 3: Projeção Cronológica & Como Funciona */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Como o Saldo Seguro é Calculado?
          </h2>

          <div className="rounded-xl border border-border/80 bg-card p-5 space-y-4 text-xs sm:text-sm">
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-border/40">
                <span className="text-muted-foreground">Saldo Bancário Atual:</span>
                <span className="font-semibold">{formatMoney(projection?.saldoAtualCentavos ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-destructive">
                <span className="text-muted-foreground">Total a Pagar (Contas):</span>
                <span className="font-semibold">- {formatMoney(projection?.compromissosPendentesCentavos ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40 text-emerald-500">
                <span className="text-muted-foreground">Receitas Confirmadas:</span>
                <span className="font-semibold">+ {formatMoney(projection?.entradasElegiveisCentavos ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 font-bold text-foreground">
                <span>Sobra Líquida Projetada:</span>
                <span>{formatMoney(projection?.saldoResidualCentavos ?? 0)}</span>
              </div>
            </div>

            <div className="rounded-lg bg-primary/10 p-3 text-xs text-primary leading-relaxed border border-primary/20">
              💡 <strong>Regra de Ouro:</strong> O sistema aplica uma margem de segurança de{' '}
              <strong>{settings.percentualSeguro}%</strong> sobre o que sobrar, garantindo que você nunca gaste até o último centavo.
            </div>

            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>• Pior dia previsto no período: <strong>{projection?.dataMenorSaldo ? new Date(`${projection.dataMenorSaldo}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem sobressaltos'}</strong>.</p>
              <p>• Menor saldo da curva: <strong>{formatMoney(projection?.menorSaldoProjetadoCentavos ?? 0)}</strong>.</p>
            </div>
          </div>
        </div>
      </div>

      {/* DIÁLOGO: Confirmar Exclusão de Lançamento Previsto */}
      <Dialog open={deleteMovementDialogOpen} onOpenChange={setDeleteMovementDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Excluir Lançamento Previsto</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Deseja remover o lançamento <strong>"{movementToDelete?.descricao}"</strong> do planejamento?
              <br />
              <span className="text-xs text-muted-foreground mt-1 block">
                Esta previsão será excluída e o cálculo do seu Saldo Seguro será recalculado.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="ghost" onClick={() => setDeleteMovementDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteMovement} disabled={saving}>
              {saving ? 'Excluindo...' : 'Sim, Excluir Lançamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO: Confirmar Reset do Planejamento Completo */}
      <Dialog open={resetPlanningDialogOpen} onOpenChange={setResetPlanningDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" />
              <DialogTitle>Recomeçar Planejamento do Zero</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Deseja remover <strong>todos os lançamentos previstos</strong> e recomeçar seu planejamento financeiro do zero?
              <br />
              <span className="text-xs text-muted-foreground mt-1 block">
                Suas contas bancárias, saldos reais e transações já registradas não serão alteradas. Apenas as projeções futuras serão limpas.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="ghost" onClick={() => setResetPlanningDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmResetPlanning} disabled={saving}>
              {saving ? 'Resetando...' : 'Sim, Limpar e Recomeçar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 1: Novo Lançamento Previsto */}
      <Dialog open={newMovementOpen} onOpenChange={setNewMovementOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {movementKind === 'income' ? 'Nova Receita Futura' : 'Nova Conta a Pagar'}
            </DialogTitle>
            <DialogDescription>
              {movementKind === 'income'
                ? 'Preveja um salário, reembolso ou rendimento futuro para calcular sua sobra.'
                : 'Cadastre contas e compromissos futuros para antecipar seus débitos.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateMovement} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="mDesc">Descrição</Label>
              <Input
                id="mDesc"
                placeholder={movementKind === 'income' ? 'Ex: Salário da Empresa' : 'Ex: Aluguel do mês'}
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mValor">Valor (R$)</Label>
                <Input
                  id="mValor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={formValor}
                  onChange={(e) => setFormValor(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mData">Data Prevista</Label>
                <Input
                  id="mData"
                  type="date"
                  value={formData}
                  onChange={(e) => setFormData(e.target.value)}
                  required
                />
              </div>
            </div>

            {movementKind === 'income' && (
              <div className="space-y-1.5">
                <Label>Tipo de Certeza</Label>
                <Select
                  value={formStatusIncome}
                  onValueChange={(val: 'confirmed' | 'estimated') => setFormStatusIncome(val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmada (Já entra no Saldo Seguro)</SelectItem>
                    <SelectItem value="estimated">Estimada (Apenas projeção opcional)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={formCategoriaId} onValueChange={setFormCategoriaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Conta Vinculada</Label>
                <Select value={formContaId} onValueChange={setFormContaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem conta específica</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full mt-2" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Lançamento Previsto'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Efetivar Previsão */}
      <Dialog open={!!settlingMovement} onOpenChange={(open) => !open && setSettlingMovement(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Efetivar Lançamento Realizado</DialogTitle>
            <DialogDescription>
              Isso registrará a transação real e atualizará o saldo da conta bancária escolhida.
            </DialogDescription>
          </DialogHeader>

          {settlingMovement && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                <p className="font-semibold text-foreground">{settlingMovement.descricao}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valor: <strong>{formatMoney(settlingMovement.valorCentavos)}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Qual conta movimentou esse valor?</Label>
                <Select value={settleAccountId} onValueChange={setSettleAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta bancária" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.nome} (Saldo: {acc.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Forma de Pagamento</Label>
                <Select value={settleMethod} onValueChange={setSettleMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="debito">Cartão de Débito</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro em Espécie</SelectItem>
                    <SelectItem value="transferencia">Transferência Bancária</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSettleMovement} className="w-full mt-2" disabled={saving}>
                {saving ? 'Registrando...' : 'Confirmar e Atualizar Saldo'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Transferência entre Contas */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferência Entre Suas Contas</DialogTitle>
            <DialogDescription>
              Mova saldo de uma conta para outra sem gerar despesa ou receita no extrato.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTransfer} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Conta de Origem (Sai)</Label>
                <Select value={transfOrigem} onValueChange={setTransfOrigem}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Conta de Destino (Entra)</Label>
                <Select value={transfDestino} onValueChange={setTransfDestino}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tVal">Valor (R$)</Label>
                <Input
                  id="tVal"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={transfValor}
                  onChange={(e) => setTransfValor(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tData">Data</Label>
                <Input
                  id="tData"
                  type="date"
                  value={transfData}
                  onChange={(e) => setTransfData(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tDesc">Motivo / Descrição (Opcional)</Label>
              <Input
                id="tDesc"
                placeholder="Ex: Transferência para reserva"
                value={transfDesc}
                onChange={(e) => setTransfDesc(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full mt-2" disabled={saving}>
              {saving ? 'Transferindo...' : 'Efetuar Transferência'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Configurações de Segurança */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurações de Segurança Financeira</DialogTitle>
            <DialogDescription>
              Ajuste como o sistema calcula sua margem segura e os alertas de consumo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="cfgPercent">Margem do Saldo Seguro</Label>
                <span className="text-xs font-bold text-primary">{settings.percentualSeguro}%</span>
              </div>
              <Input
                id="cfgPercent"
                type="number"
                min="10"
                max="100"
                value={settings.percentualSeguro}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, percentualSeguro: Number(e.target.value) }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Ex: Se sobrar R$ 1.000 e a margem for 70%, o saldo seguro indicado para gastar será R$ 700.
              </p>
            </div>

            <Button onClick={handleSaveSettings} className="w-full mt-2" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Preferências'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
