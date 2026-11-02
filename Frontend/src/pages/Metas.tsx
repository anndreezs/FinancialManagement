import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  MoreVertical,
  Pause,
  PiggyBank,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { contasApi, goalsApi, getApiErrorMessage } from '@/lib/api';
import type { Conta, Goal } from '@/lib/api';
import { toast } from 'sonner';

const formatMoney = (cents: number | null | undefined) => {
  if (cents === null || cents === undefined || isNaN(cents)) return 'R$ 0,00';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface MovementView {
  id: number;
  tipo: string;
  modalidade: string;
  valorCentavos: number;
  data: string;
  contaOrigemId: number | null;
  contaDestinoId: number | null;
  occurrenceId: number | null;
  reversesMovementId: number | null;
  observacao: string | null;
}

export default function Metas() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Meta selecionada para visualização detalhada / histórico
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [movements, setMovements] = useState<MovementView[]>([]);

  // Modais de Criação / Edição / Movimentação
  const [createGoalOpen, setCreateGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementKind, setMovementKind] = useState<'contribution' | 'withdrawal'>('contribution');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Modais de Exclusão e Reset
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [goalToReset, setGoalToReset] = useState<Goal | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);

  // Formulário de Criação/Edição de Meta
  const [formNome, setFormNome] = useState('');
  const [formValorAlvo, setFormValorAlvo] = useState('');
  const [formDataLimite, setFormDataLimite] = useState('');
  const [formContaId, setFormContaId] = useState('none');
  const [formObservacoes, setFormObservacoes] = useState('');

  // Formulário de Movimentação (Guardar / Resgatar)
  const [movValor, setMovValor] = useState('');
  const [movData, setMovData] = useState(() => new Date().toISOString().slice(0, 10));
  const [movModalidade, setMovModalidade] = useState<'virtual' | 'transfer'>('virtual');
  const [movContaOrigem, setMovContaOrigem] = useState('');
  const [movContaDestino, setMovContaDestino] = useState('');
  const [movObs, setMovObs] = useState('');

  const loadData = async (goalToSelectId?: number) => {
    try {
      setLoading(true);
      const [goalsRes, accountsRes] = await Promise.all([goalsApi.list(), contasApi.list()]);
      const list = goalsRes.data || [];
      setGoals(list);
      setAccounts((accountsRes.data || []).map((c) => ({ ...c, saldo: Number(c.saldo) })));

      const nextSelected = goalToSelectId
        ? list.find((g) => g.id === goalToSelectId)
        : selectedGoal
        ? list.find((g) => g.id === selectedGoal.id)
        : list[0];

      setSelectedGoal(nextSelected || null);
      if (nextSelected) {
        try {
          const movRes = await goalsApi.movements(nextSelected.id);
          setMovements(movRes.data || []);
        } catch {
          setMovements([]);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar metas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Totalizadores consolidados
  const { totalAcumulado, totalAlvo, progressoGeral } = useMemo(() => {
    const totalAcum = goals.reduce((acc, g) => acc + (g.accumulatedCents || 0), 0);
    const totalTarget = goals.reduce((acc, g) => acc + (g.valorAlvoCentavos || 0), 0);
    const progresso = totalTarget > 0 ? Math.min(100, Math.round((totalAcum / totalTarget) * 100)) : 0;
    return { totalAcumulado: totalAcum, totalAlvo: totalTarget, progressoGeral: progresso };
  }, [goals]);

  // Abrir criação de meta
  const handleOpenCreate = () => {
    setEditingGoal(null);
    setFormNome('');
    setFormValorAlvo('');
    const defaultDate = new Date();
    defaultDate.setMonth(defaultDate.getMonth() + 6);
    setFormDataLimite(defaultDate.toISOString().slice(0, 10));
    setFormContaId('none');
    setFormObservacoes('');
    setCreateGoalOpen(true);
  };

  // Abrir edição
  const handleOpenEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormNome(goal.nome);
    setFormValorAlvo(((goal.valorAlvoCentavos || 0) / 100).toFixed(2));
    setFormDataLimite(goal.dataLimite);
    setFormContaId(goal.contaId ? String(goal.contaId) : 'none');
    setFormObservacoes(goal.observacoes || '');
    setCreateGoalOpen(true);
  };

  // Salvar Meta (Criar ou Atualizar)
  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const valorAlvoNum = Number(formValorAlvo.replace(',', '.'));
    if (!formNome.trim() || !Number.isFinite(valorAlvoNum) || valorAlvoNum <= 0 || !formDataLimite) {
      toast.error('Informe nome, valor positivo e data limite para a meta');
      return;
    }

    try {
      setSaving(true);
      const dataInicio = editingGoal ? editingGoal.dataInicio : new Date().toISOString().slice(0, 10);

      if (formDataLimite < dataInicio) {
        toast.error('A data limite não pode ser anterior à data de início');
        return;
      }

      const payload = {
        nome: formNome.trim(),
        valorAlvo: valorAlvoNum,
        dataInicio,
        dataLimite: formDataLimite,
        contaId: formContaId !== 'none' ? Number(formContaId) : null,
        observacoes: formObservacoes.trim() || undefined,
        idempotencyKey: editingGoal ? undefined : crypto.randomUUID(),
      };

      if (editingGoal) {
        await goalsApi.update(editingGoal.id, payload);
        toast.success('Meta atualizada com sucesso!');
        await loadData(editingGoal.id);
      } else {
        const res = await goalsApi.create(payload);
        toast.success('Nova meta criada com sucesso! 🎯');
        await loadData(res.data.id);
      }
      setCreateGoalOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao salvar meta'));
    } finally {
      setSaving(false);
    }
  };

  // Excluir Meta Individual
  const handleConfirmDelete = async () => {
    if (!goalToDelete) return;
    try {
      setSaving(true);
      await goalsApi.delete(goalToDelete.id);
      toast.success(`Meta "${goalToDelete.nome}" excluída com sucesso`);
      setDeleteDialogOpen(false);
      setGoalToDelete(null);
      await loadData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao excluir meta'));
    } finally {
      setSaving(false);
    }
  };

  // Reiniciar Meta do Zero (Zerar Aportes)
  const handleConfirmReset = async () => {
    if (!goalToReset) return;
    try {
      setSaving(true);
      await goalsApi.reset(goalToReset.id);
      toast.success(`Meta "${goalToReset.nome}" reiniciada do zero!`);
      setResetDialogOpen(false);
      setGoalToReset(null);
      await loadData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao reiniciar meta'));
    } finally {
      setSaving(false);
    }
  };

  // Excluir Todas as Metas (Recomeçar Geral)
  const handleConfirmClearAll = async () => {
    try {
      setSaving(true);
      await goalsApi.clearAll();
      toast.success('Todas as metas foram excluídas. Você pode recomeçar do zero!');
      setClearAllDialogOpen(false);
      await loadData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao excluir metas'));
    } finally {
      setSaving(false);
    }
  };

  // Abrir modal de aporte ou resgate
  const handleOpenMovement = (goal: Goal, type: 'contribution' | 'withdrawal') => {
    setSelectedGoal(goal);
    setMovementKind(type);
    setMovValor('');
    setMovData(new Date().toISOString().slice(0, 10));
    setMovObs('');
    setMovModalidade('virtual');
    setMovContaOrigem(accounts[0]?.id ? String(accounts[0].id) : '');
    setMovContaDestino(goal.contaId ? String(goal.contaId) : accounts[1]?.id ? String(accounts[1].id) : '');
    setMovementModalOpen(true);
  };

  // Salvar Aporte ou Retirada
  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal) return;

    const valorNum = Number(movValor.replace(',', '.'));
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    if (movementKind === 'withdrawal' && Math.round(valorNum * 100) > (selectedGoal.accumulatedCents || 0)) {
      toast.error('O valor do resgate não pode ser maior que o total acumulado');
      return;
    }

    if (movModalidade === 'transfer' && (!movContaOrigem || !movContaDestino || movContaOrigem === movContaDestino)) {
      toast.error('Para transferência bancária, selecione contas de origem e destino diferentes');
      return;
    }

    try {
      setSaving(true);
      await goalsApi.contribute(selectedGoal.id, {
        tipo: movementKind,
        modalidade: movModalidade,
        valor: valorNum,
        data: movData,
        contaOrigemId: movModalidade === 'transfer' ? Number(movContaOrigem) : undefined,
        contaDestinoId: movModalidade === 'transfer' ? Number(movContaDestino) : undefined,
        idempotencyKey: crypto.randomUUID(),
        observacao: movObs.trim() || undefined,
      });

      toast.success(
        movementKind === 'contribution'
          ? 'Aporte registrado! Você está mais perto do seu objetivo. 🚀'
          : 'Resgate registrado com sucesso.'
      );

      setMovementModalOpen(false);
      await loadData(selectedGoal.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao registrar movimentação na meta'));
    } finally {
      setSaving(false);
    }
  };

  // Alterar Status da Meta (Pausar / Retomar / Concluir)
  const handleStatusChange = async (goal: Goal, status: Goal['status']) => {
    try {
      await goalsApi.setStatus(goal.id, status);
      toast.success(
        status === 'paused'
          ? 'Meta pausada'
          : status === 'completed'
          ? 'Parabéns! Meta marcada como concluída! 🎉'
          : 'Meta reativada'
      );
      await loadData(goal.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao alterar situação da meta'));
    }
  };

  // Abrir Histórico de Movimentações
  const handleOpenHistory = async (goal: Goal) => {
    setSelectedGoal(goal);
    try {
      const movRes = await goalsApi.movements(goal.id);
      setMovements(movRes.data || []);
      setHistoryModalOpen(true);
    } catch {
      toast.error('Erro ao carregar histórico');
    }
  };

  // Reverter/Estornar movimentação
  const handleReverseMovement = async (movId: number) => {
    if (!selectedGoal || !window.confirm('Deseja estornar esta movimentação?')) return;
    try {
      await goalsApi.reverseMovement(selectedGoal.id, movId, {
        data: new Date().toISOString().slice(0, 10),
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success('Movimentação estornada com sucesso');
      const movRes = await goalsApi.movements(selectedGoal.id);
      setMovements(movRes.data || []);
      await loadData(selectedGoal.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao estornar movimentação'));
    }
  };

  // Estimativa mensal amigável para formulário de criação
  const estimativaMensal = useMemo(() => {
    const val = Number(formValorAlvo.replace(',', '.'));
    if (!formDataLimite || !Number.isFinite(val) || val <= 0) return null;
    const now = new Date();
    const target = new Date(`${formDataLimite}T00:00:00`);
    const diffMonths = Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
    const mensal = val / diffMonths;
    return { meses: diffMonths, valorMensal: mensal };
  }, [formValorAlvo, formDataLimite]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Metas & Objetivos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Defina objetivos, guarde dinheiro aos poucos e acompanhe seu progresso sem complicações.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {goals.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearAllDialogOpen(true)}
              className="h-9 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Excluir todas as metas e recomeçar do zero"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Recomeçar do Zero
            </Button>
          )}

          <Button onClick={handleOpenCreate} className="h-9 text-xs gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" />
            Nova Meta
          </Button>
        </div>
      </div>

      {/* Card de Progresso Global */}
      {goals.length > 0 && (
        <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Progresso Geral</span>
              <p className="text-3xl font-extrabold tracking-tight text-foreground mt-1">
                {formatMoney(totalAcumulado)}{' '}
                <span className="text-base font-normal text-muted-foreground">de {formatMoney(totalAlvo)}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Você já conquistou <strong>{progressoGeral}%</strong> de todas as suas metas combinadas.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <PiggyBank className="h-7 w-7" />
              </div>
            </div>
          </div>
          <Progress value={progressoGeral} className="mt-4 h-2.5 bg-muted" />
        </div>
      )}

      {/* Grid de Metas */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Carregando suas metas...</div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta cadastrada"
          description="Crie seu primeiro objetivo financeiro (ex: Reserva de Emergência, Férias, Carro) e comece a juntar dinheiro hoje."
          action={{ label: 'Criar Minha Primeira Meta', onClick: handleOpenCreate }}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const accumulated = goal.accumulatedCents || 0;
            const target = goal.valorAlvoCentavos || 0;
            const percent = goal.progressPercent ?? (target > 0 ? Math.min(100, Math.round((accumulated / target) * 100)) : 0);
            const isCompleted = accumulated >= target && target > 0;
            const isPaused = goal.status === 'paused';
            const remaining = goal.remainingCents ?? Math.max(0, target - accumulated);

            return (
              <div
                key={goal.id}
                className={`flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md ${
                  isCompleted
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : isPaused
                    ? 'border-border/60 opacity-80'
                    : 'border-border/80'
                }`}
              >
                <div>
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-base tracking-tight line-clamp-1">
                          {goal.nome}
                        </h3>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          Até {new Date(`${goal.dataLimite}T00:00:00`).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => handleOpenEdit(goal)}>
                          Editar informações
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenHistory(goal)}>
                          Ver histórico de movimentações
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {goal.status === 'active' ? (
                          <DropdownMenuItem onClick={() => handleStatusChange(goal, 'paused')}>
                            <Pause className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> Pausar meta
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleStatusChange(goal, 'active')}>
                            <Play className="h-3.5 w-3.5 mr-2 text-primary" /> Reativar meta
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setGoalToReset(goal);
                            setResetDialogOpen(true);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-2 text-amber-500" />
                          Reiniciar (Zerar Aportes)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setGoalToDelete(goal);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Excluir meta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Valores & Progresso */}
                  <div className="mt-5 space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xl font-extrabold text-foreground tracking-tight">
                        {formatMoney(accumulated)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        alvo: {formatMoney(target)}
                      </span>
                    </div>

                    <Progress
                      value={percent}
                      className={`h-2.5 ${isCompleted ? '[&>div]:bg-emerald-500' : ''}`}
                    />

                    <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-0.5">
                      <span className="font-medium text-foreground">{percent}% concluído</span>
                      <span>
                        {isCompleted
                          ? '🎉 Conquistado!'
                          : `Falta ${formatMoney(remaining)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botões de Ação Direta */}
                <div className="mt-5 pt-4 border-t border-border/50 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleOpenMovement(goal, 'contribution')}
                    className="flex-1 h-8 text-xs gap-1"
                    disabled={isCompleted}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenMovement(goal, 'withdrawal')}
                    className="h-8 text-xs px-2.5"
                    disabled={accumulated <= 0}
                    title="Resgatar valor guardado"
                  >
                    Resgatar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DIÁLOGO: Confirmar Exclusão de Meta */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        {deleteDialogOpen && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <DialogTitle>Excluir Meta</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                Tem certeza que deseja excluir a meta <strong>"{goalToDelete?.nome}"</strong>?
                <br />
                <span className="text-xs text-muted-foreground mt-1 block">
                  Esta ação apagará o objetivo e todo o histórico de aportes vinculado a ele.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={saving}>
                {saving ? 'Excluindo...' : 'Sim, Excluir Meta'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* DIÁLOGO: Confirmar Reinício (Zerar Aportes) */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        {resetDialogOpen && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2 text-amber-500">
                <RotateCcw className="h-5 w-5" />
                <DialogTitle>Reiniciar Meta do Zero</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                Deseja zerar todos os aportes e resgates da meta <strong>"{goalToReset?.nome}"</strong>?
                <br />
                <span className="text-xs text-muted-foreground mt-1 block">
                  A meta continuará existindo, mas o valor acumulado voltará para R$ 0,00 para você recomeçar do zero.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="ghost" onClick={() => setResetDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="default" className="bg-amber-600 hover:bg-amber-700" onClick={handleConfirmReset} disabled={saving}>
                {saving ? 'Reiniciando...' : 'Sim, Zerar Meta'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* DIÁLOGO: Confirmar Limpar Todas as Metas */}
      <Dialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
        {clearAllDialogOpen && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                <DialogTitle>Recomeçar Todas as Metas do Zero</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                Deseja apagar <strong>todas as suas metas cadastradas</strong>?
                <br />
                <span className="text-xs text-muted-foreground mt-1 block">
                  Suas contas bancárias e transações reais permanecerão intactas. Apenas os objetivos de metas serão apagados para você começar uma nova organização.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="ghost" onClick={() => setClearAllDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleConfirmClearAll} disabled={saving}>
                {saving ? 'Limpando...' : 'Sim, Apagar Tudo e Recomeçar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* MODAL 1: Criar / Editar Meta */}
      <Dialog open={createGoalOpen} onOpenChange={setCreateGoalOpen}>
        {createGoalOpen && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingGoal ? 'Editar Meta Financeira' : 'Criar Nova Meta Financeira'}</DialogTitle>
              <DialogDescription>
                Defina o nome do seu objetivo, quanto deseja juntar e a data limite.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveGoal} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="gNome">Nome da Meta</Label>
                <Input
                  id="gNome"
                  placeholder="Ex: Reserva de Emergência, Férias em Natal..."
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="gAlvo">Valor Alvo (R$)</Label>
                  <Input
                    id="gAlvo"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="5000,00"
                    value={formValorAlvo}
                    onChange={(e) => setFormValorAlvo(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="gLimite">Data Limite</Label>
                  <Input
                    id="gLimite"
                    type="date"
                    value={formDataLimite}
                    onChange={(e) => setFormDataLimite(e.target.value)}
                    required
                  />
                </div>
              </div>

              {estimativaMensal && (
                <div className="rounded-lg bg-primary/10 p-3 text-xs text-primary border border-primary/20 flex items-start gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Para atingir essa meta em <strong>{estimativaMensal.meses} meses</strong>, basta guardar cerca de{' '}
                    <strong>
                      {estimativaMensal.valorMensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>{' '}
                    por mês.
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Conta Bancária Vinculada (Opcional)</Label>
                <Select value={formContaId} onValueChange={setFormContaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione onde esse dinheiro fica" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma conta específica (Controle virtual)</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.nome} (Saldo: {acc.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Se você usa uma conta ou caixinha específica para essa meta, selecione-a aqui.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gObs">Observações (Opcional)</Label>
                <Input
                  id="gObs"
                  placeholder="Ex: Rendimentos do CDI, aportes mensais..."
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full mt-2" disabled={saving}>
                {saving ? 'Salvando...' : editingGoal ? 'Salvar Alterações' : 'Criar Meta 🎯'}
              </Button>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* MODAL 2: Aporte ou Resgate */}
      <Dialog open={movementModalOpen} onOpenChange={setMovementModalOpen}>
        {movementModalOpen && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {movementKind === 'contribution' ? `Guardar em: ${selectedGoal?.nome}` : `Resgatar de: ${selectedGoal?.nome}`}
              </DialogTitle>
              <DialogDescription>
                {movementKind === 'contribution'
                  ? 'Informe o valor que deseja somar à sua meta.'
                  : 'Informe o valor que deseja retirar do total acumulado nesta meta.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveMovement} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="movVal">Valor (R$)</Label>
                  <Input
                    id="movVal"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    value={movValor}
                    onChange={(e) => setMovValor(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="movD">Data</Label>
                  <Input
                    id="movD"
                    type="date"
                    value={movData}
                    onChange={(e) => setMovData(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Como você deseja registrar?</Label>
                <Select value={movModalidade} onValueChange={(val: 'virtual' | 'transfer') => setMovModalidade(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="virtual">Apenas controle virtual (Não altera saldo real das contas)</SelectItem>
                    <SelectItem value="transfer">Transferência bancária real entre contas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {movModalidade === 'transfer' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <div className="space-y-1.5">
                    <Label>De qual conta sai?</Label>
                    <Select value={movContaOrigem} onValueChange={setMovContaOrigem}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Para qual conta vai?</Label>
                    <Select value={movContaDestino} onValueChange={setMovContaDestino}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="movObsField">Observação (Opcional)</Label>
                <Input
                  id="movObsField"
                  placeholder="Ex: Sobra do 13º salário, rendimento..."
                  value={movObs}
                  onChange={(e) => setMovObs(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full mt-2" disabled={saving}>
                {saving ? 'Registrando...' : movementKind === 'contribution' ? 'Confirmar Aporte' : 'Confirmar Resgate'}
              </Button>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* MODAL 3: Histórico de Movimentações */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        {historyModalOpen && (
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Histórico de Aportes: {selectedGoal?.nome}</DialogTitle>
              <DialogDescription>
                Acompanhe todas as vezes em que você guardou ou resgatou dinheiro desta meta.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              {movements.length === 0 ? (
                <p className="text-center py-6 text-xs text-muted-foreground">Nenhuma movimentação registrada até o momento.</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {movements.map((m) => {
                    const isContribution = m.tipo === 'contribution';
                    const isReversal = m.tipo === 'reversal';

                    return (
                      <div key={m.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 text-xs">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`p-1.5 rounded-lg mt-0.5 ${
                              isContribution
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : isReversal
                                ? 'bg-amber-500/10 text-amber-500'
                                : 'bg-destructive/10 text-destructive'
                            }`}
                          >
                            {isContribution ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : isReversal ? (
                              <RotateCcw className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground capitalize">
                              {isContribution ? 'Aporte' : isReversal ? 'Estorno / Reversão' : 'Resgate'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(`${m.data}T00:00:00`).toLocaleDateString('pt-BR')} •{' '}
                              {m.modalidade === 'transfer' ? 'Transferência Bancária' : 'Reserva Virtual'}
                              {m.observacao && ` • ${m.observacao}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${
                              isContribution
                                ? 'text-emerald-500'
                                : isReversal
                                ? 'text-amber-500'
                                : 'text-destructive'
                            }`}
                          >
                            {isContribution ? '+' : '-'} {formatMoney(m.valorCentavos)}
                          </span>

                          {!isReversal && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleReverseMovement(m.id)}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Estornar movimentação"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
