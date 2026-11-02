import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CreditCard, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { DataCard } from '@/components/ui/data-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  cartoesApi,
  contasApi,
  transacoesApi,
  Cartao,
  Conta,
  Transacao,
  getApiErrorStatus,
} from '@/lib/api';

/* ================= SCHEMA ================= */
const cartaoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  limite: z.string().min(1, 'Limite é obrigatório'),
  fechamento: z.string().min(1, 'Dia de fechamento é obrigatório'),
  vencimento: z.string().min(1, 'Dia de vencimento é obrigatório'),
  contaId: z.string().min(1, 'Conta vinculada é obrigatória'),
  limitePessoal: z.string().optional(),
  cor: z.string().optional(),
});

type CartaoForm = z.infer<typeof cartaoSchema>;

const cardColors = [
  'from-purple-600 to-purple-900',
  'from-orange-500 to-orange-700',
  'from-cyan-500 to-cyan-700',
  'from-emerald-500 to-emerald-700',
];

/* ================= PERSISTÊNCIA DE CORES ================= */
const CARTAO_COLOR_KEY = 'cartao_colors';

const getStoredColors = (): Record<number, string> => {
  try {
    return JSON.parse(localStorage.getItem(CARTAO_COLOR_KEY) || '{}');
  } catch {
    return {};
  }
};

const saveStoredColors = (data: Record<number, string>) => {
  localStorage.setItem(CARTAO_COLOR_KEY, JSON.stringify(data));
};

export default function Cartoes() {
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cartaoEditando, setCartaoEditando] = useState<Cartao | null>(null);
  const [cartaoParaPagar, setCartaoParaPagar] = useState<Cartao | null>(null);
  const [contaPagamentoId, setContaPagamentoId] = useState('');
  const [valorPagamento, setValorPagamento] = useState('');
  const [pagando, setPagando] = useState(false);
  const [paymentRequestKey, setPaymentRequestKey] = useState(() => crypto.randomUUID());

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CartaoForm>({
    resolver: zodResolver(cartaoSchema),
    defaultValues: {
      cor: cardColors[0],
    },
  });

  /* ================= PAGAR CARTÃO ================= */
  const handlePagarCartao = (id: number) => {
    const cartao = cartoes.find((item) => item.id === id);
    if (!cartao) return;
    setCartaoParaPagar(cartao);
    setContaPagamentoId(String(cartao.conta_id || contas[0]?.id || ''));
    setValorPagamento(cartao.saldo_utilizado.toFixed(2));
    setPaymentRequestKey(crypto.randomUUID());
  };

  const confirmarPagamento = async () => {
    if (!cartaoParaPagar) return;
    const valor = Number(valorPagamento.replace(',', '.'));
    const contaId = Number(contaPagamentoId);
    if (!Number.isFinite(valor) || valor <= 0 || valor > cartaoParaPagar.saldo_utilizado || !contaId) {
      toast.error('Informe uma conta e um valor válido dentro da fatura pendente');
      return;
    }

    try {
      setPagando(true);
      await cartoesApi.pagar(cartaoParaPagar.id, {
        contaId,
        valor,
        idempotencyKey: paymentRequestKey,
      });
      const valorPago = Math.round(valor * 100) / 100;
      setCartoes((prev) =>
        prev.map((c) =>
          c.id === cartaoParaPagar.id
            ? {
                ...c,
                saldo_utilizado: c.saldo_utilizado - valorPago,
                limite_disponivel: c.limite_disponivel + valorPago,
              }
            : c
        )
      );
      setContas((prev) => prev.map((c) => c.id === contaId ? { ...c, saldo: c.saldo - valorPago } : c));
      setCartaoParaPagar(null);
      setPaymentRequestKey(crypto.randomUUID());
      toast.success('Pagamento registrado sem duplicar a despesa da compra');
    } catch {
      toast.error('Não foi possível pagar a fatura; confira o saldo da conta');
    } finally {
      setPagando(false);
    }
  };

  /* ================= LOAD ================= */
  useEffect(() => {
    fetchCartoes();
    fetchContas();
    fetchTransacoes();
  }, []);

  const fetchCartoes = async () => {
    try {
      const res = await cartoesApi.list();
      const lista = res.data || [];

      const storedColors = getStoredColors();
      const hidratado = await Promise.all(lista.map(async (c, index) => {
        const cor = c.cor ?? storedColors[c.id] ?? cardColors[index % cardColors.length];

        if (!c.cor) {
          await cartoesApi.update(c.id, {
            nome: c.nome,
            limite: Number(c.limite),
            fechamento: Number(c.fechamento),
            vencimento: Number(c.vencimento),
            contaId: Number(c.conta_id),
            cor,
            limitePessoal: c.limite_pessoal ?? null,
          });
        }

        storedColors[c.id] = cor;
        return {
          ...c,
          limite: Number(c.limite),
          limite_disponivel: Number(c.limite_disponivel),
          saldo_utilizado: Number(c.saldo_utilizado),
          limite_pessoal: c.limite_pessoal === null || c.limite_pessoal === undefined
            ? null
            : Number(c.limite_pessoal),
          gasto_ciclo: Number(c.gasto_ciclo || 0),
          cor,
        };
      }));

      saveStoredColors(storedColors);
      setCartoes(hidratado);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar cartões');
    }
  };

  const fetchContas = async () => {
    try {
      const res = await contasApi.list();
      setContas(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar contas');
    }
  };

  const fetchTransacoes = async () => {
    try {
      const res = await transacoesApi.list();
      setTransacoes(
        (res.data || []).map((t) => ({
          ...t,
          valor: Number(t.valor),
        }))
      );
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar transações');
    }
  };

  /* ================= USO POR CARTÃO ================= */
  const usoPorCartao = useMemo(() => {
    const map = new Map<number, number>();

    transacoes
      .filter((t) => t.formaPagamento === 'CREDITO')
      .forEach((t) => {
        if (t.cartaoId) {
          map.set(t.cartaoId, (map.get(t.cartaoId) || 0) + t.valor);
        }
      });

    return map;
  }, [transacoes]);

  /* ================= SUBMIT ================= */
  const onSubmit = async (data: CartaoForm) => {
    try {
      const corSelecionada = data.cor ?? cardColors[cartoes.length % cardColors.length];
      const payload = {
        nome: data.nome,
        limite: parseFloat(data.limite.replace(',', '.')),
        fechamento: parseInt(data.fechamento),
        vencimento: parseInt(data.vencimento),
        contaId: parseInt(data.contaId),
        limitePessoal: data.limitePessoal?.trim()
          ? parseFloat(data.limitePessoal.replace(',', '.'))
          : null,
        cor: corSelecionada,
      };

      const storedColors = getStoredColors();

      if (cartaoEditando) {
        await cartoesApi.update(cartaoEditando.id, payload);

        storedColors[cartaoEditando.id] = corSelecionada;
        saveStoredColors(storedColors);

        setCartoes((prev) =>
          prev.map((c) =>
            c.id === cartaoEditando.id
              ? {
                  ...c,
                  ...payload,
                  conta_id: payload.contaId,
                  limite_pessoal: payload.limitePessoal,
                  gasto_ciclo: Number(c.gasto_ciclo || 0),
                  limite_disponivel:
                    payload.limite - c.saldo_utilizado,
                  cor: corSelecionada,
                }
              : c
          )
        );

        toast.success('Cartão atualizado com sucesso!');
      } else {
        const res = await cartoesApi.create(payload);

        storedColors[res.data.id] = res.data.cor ?? corSelecionada;

        saveStoredColors(storedColors);

        setCartoes((prev) => [
          ...prev,
          {
            ...res.data,
            gasto_ciclo: 0,
            cor: storedColors[res.data.id],
          },
        ]);

        toast.success('Cartão adicionado com sucesso!');
      }

      setIsDialogOpen(false);
      setCartaoEditando(null);
      reset();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar cartão');
    }
  };

  /* ================= EDITAR ================= */
  const handleEdit = (cartao: Cartao) => {
    setCartaoEditando(cartao);
    setIsDialogOpen(true);

    reset({
      nome: cartao.nome,
      limite: String(cartao.limite),
      fechamento: String(cartao.fechamento),
      vencimento: String(cartao.vencimento),
      contaId: String(cartao.conta_id),
      limitePessoal: cartao.limite_pessoal == null ? '' : String(cartao.limite_pessoal),
      cor: cartao.cor ?? '',
    });
  };

  /* ================= EXCLUIR ================= */
  const handleDelete = async (id: number) => {
    try {
      await cartoesApi.delete(id);

      const storedColors = getStoredColors();
      delete storedColors[id];
      saveStoredColors(storedColors);

      setCartoes((prev) => prev.filter((c) => c.id !== id));
      toast.success('Cartão excluído com sucesso!');
    } catch (err: unknown) {
      console.error(err);

      if (getApiErrorStatus(err) === 400) {
        toast.error('Cartão existe transação salva');
        return;
      }

      toast.error('Erro ao excluir cartão');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <DataCard
        title="Seus Cartões"
        action={
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                reset();
                setCartaoEditando(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Cartão
              </Button>
            </DialogTrigger>

            <DialogContent className="border-border bg-card">
              <DialogHeader>
                <DialogTitle>
                  {cartaoEditando ? 'Editar Cartão' : 'Adicionar Cartão'}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Cartão</Label>
                  <Input id="nome" {...register('nome')} />
                  {errors.nome && (
                    <p className="text-xs text-destructive">
                      {errors.nome.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="limite">Limite</Label>
                  <Input id="limite" {...register('limite')} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="limitePessoal">Limite pessoal (opcional)</Label>
                  <Input id="limitePessoal" type="number" min="0.01" step="0.01" {...register('limitePessoal')} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fechamento">Dia Fechamento</Label>
                    <Input
                      id="fechamento"
                      type="number"
                      {...register('fechamento')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vencimento">Dia Vencimento</Label>
                    <Input
                      id="vencimento"
                      type="number"
                      {...register('vencimento')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contaId">Conta vinculada</Label>
                  <select
                    id="contaId"
                    {...register('contaId')}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  >
                    <option value="">Selecione uma conta</option>
                    {contas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Cor do cartão</Label>
                  <div className="flex gap-2 flex-wrap">
                    {cardColors.map((color) => (
                      <label key={color}>
                        <input
                          type="radio"
                          value={color}
                          {...register('cor')}
                          className="hidden"
                        />
                        <div
                          className={`h-8 w-12 rounded-md bg-gradient-to-br ${color}
                          ${
                            watch('cor') === color
                              ? 'ring-2 ring-primary'
                              : 'opacity-80'
                          }`}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? 'Salvando...'
                      : cartaoEditando
                      ? 'Salvar'
                      : 'Adicionar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      >
        {cartoes.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Nenhum cartão cadastrado"
            description="Adicione seu primeiro cartão de crédito para controlar seus gastos."
            action={{
              label: 'Adicionar Cartão',
              onClick: () => setIsDialogOpen(true),
            }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {cartoes.map((cartao, index) => {
                const usado = cartao.saldo_utilizado;
                const disponivel = cartao.limite_disponivel;
                const percentUsed =
                  cartao.limite > 0
                    ? (usado / cartao.limite) * 100
                    : 0;
                const limitePessoal = Number(cartao.limite_pessoal || 0);
                const gastoCiclo = Number(cartao.gasto_ciclo || 0);
                const percentPessoal = limitePessoal > 0
                  ? Math.min(100, (gastoCiclo / limitePessoal) * 100)
                  : 0;

                return (
                  <motion.div
                    key={cartao.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative overflow-hidden rounded-2xl"
                  >
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${
                        cartao.cor ??
                        cardColors[index % cardColors.length]
                      } opacity-90`}
                    />

                    <div className="relative p-5">
                       <div className="flex items-start justify-between">
    <CreditCard className="h-8 w-8 text-white/80" />

    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleEdit(cartao)}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </DropdownMenuItem>

        {cartao.saldo_utilizado > 0 && (
          <DropdownMenuItem
            onClick={() => handlePagarCartao(cartao.id)}
          >
            💰 Pagar
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          className="text-destructive"
          onClick={() => handleDelete(cartao.id)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>

                      <div className="mt-8">
                        <p className="text-lg font-semibold text-white">
                          {cartao.nome}
                        </p>
                        <p className="text-sm text-white/70">
                          Fecha dia {cartao.fechamento} · Vence dia{' '}
                          {cartao.vencimento}
                        </p>
                      </div>

                      <div className="mt-6 space-y-3">
                        <div className="flex justify-between text-white">
                          <span className="text-xs">Usado</span>
                          <span>
                            R${' '}
                            {usado.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>

                        <Progress
                          value={percentUsed}
                          className="h-2 bg-white/20 [&>div]:bg-white"
                        />

                        <div className="flex justify-between text-white font-semibold">
                          <span className="text-xs">Disponível</span>
                          <span>
                            R${' '}
                            {disponivel.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>

                        {limitePessoal > 0 && (
                          <div className="space-y-2 border-t border-white/20 pt-3 text-white">
                            <div className="flex justify-between gap-2 text-xs">
                              <span>Gasto no ciclo / limite pessoal</span>
                              <span>R$ {gastoCiclo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ {limitePessoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <Progress value={percentPessoal} className="h-2 bg-white/20 [&>div]:bg-amber-300" />
                            {gastoCiclo > limitePessoal && (
                              <p className="text-xs font-semibold text-amber-100">
                                Acima do limite pessoal em R$ {(gastoCiclo - limitePessoal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            )}
                            <p className="text-[11px] text-white/70">{cartao.ciclo_inicio ? `Ciclo ${new Date(`${cartao.ciclo_inicio}T00:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${cartao.ciclo_fim}T00:00:00`).toLocaleDateString('pt-BR')}` : 'Compras do ciclo atual; pagamento de fatura não reduz este indicador.'}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </DataCard>

      <Dialog open={Boolean(cartaoParaPagar)} onOpenChange={(open) => { if (!open) setCartaoParaPagar(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar fatura{cartaoParaPagar ? ` · ${cartaoParaPagar.nome}` : ''}</DialogTitle>
          </DialogHeader>
          {cartaoParaPagar && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compras já registradas continuam como despesas. Este pagamento só liquida o saldo do cartão e debita a conta escolhida.
              </p>
              <div className="space-y-2">
                <Label htmlFor="contaPagamento">Conta de pagamento</Label>
                <select
                  id="contaPagamento"
                  value={contaPagamentoId}
                  onChange={(event) => setContaPagamentoId(event.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                >
                  <option value="">Selecione uma conta</option>
                  {contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="valorPagamento">Valor do pagamento</Label>
                <Input
                  id="valorPagamento"
                  type="number"
                  min="0.01"
                  max={cartaoParaPagar.saldo_utilizado}
                  step="0.01"
                  value={valorPagamento}
                  onChange={(event) => setValorPagamento(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Pendente: R$ {cartaoParaPagar.saldo_utilizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <Button className="w-full" disabled={pagando} onClick={confirmarPagamento}>
                {pagando ? 'Registrando...' : 'Confirmar pagamento'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
