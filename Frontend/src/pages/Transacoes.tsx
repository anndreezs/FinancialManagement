import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  transacoesApi,
  categoriasApi,
  contasApi,
  cartoesApi,
} from '@/lib/api';
import type { Transacao, Categoria, Conta, Cartao } from '@/lib/api';

import { toast } from 'sonner';
import { usePeriodo } from '@/hooks/usePeriodo';

/* ================= SCHEMA ================= */
const schema = z.object({
  descricao: z.string().min(1),
  valor: z.string().min(1),
  data: z.string().min(1),
  tipo: z.enum(['RECEITA', 'DESPESA']),
  categoriaId: z.number(),
  formaPagamento: z.enum([
    'DINHEIRO',
    'DEBITO',
    'CREDITO',
    'PIX',
    'TRANSFERENCIA',
  ]),
  contaId: z.number().optional(),
  cartaoId: z.number().optional(),
});

type FormData = z.infer<typeof schema>;

/* ================= HELPERS ================= */
const parseData = (data: string) => {
  const partes = data.slice(0, 10).split('-');
  if (partes.length !== 3) return null;

  const [primeira, mesParte, terceira] = partes;
  const ano = Number(primeira.length === 4 ? primeira : terceira);
  const mes = Number(mesParte);
  const dia = Number(primeira.length === 4 ? terceira : primeira);

  if (!ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
};

const formatarData = (data: string) => {
  const partes = parseData(data);
  if (!partes) return data;
  return `${String(partes.dia).padStart(2, '0')}/${String(partes.mes).padStart(2, '0')}/${partes.ano}`;
};

const formaPagamentoLabel = (forma: string) => {
  const map: Record<string, string> = {
    PIX: 'PIX',
    DINHEIRO: 'Dinheiro',
    DEBITO: 'Débito',
    CREDITO: 'Crédito',
    TRANSFERENCIA: 'Transferência',
  };
  return map[forma] ?? forma;
};

const getContaNome = (contas: Conta[], id?: number | null) =>
  contas.find((c) => c.id === id)?.nome ?? '-';

const getCartaoNome = (cartoes: Cartao[], id?: number | null) =>
  cartoes.find((c) => c.id === id)?.nome ?? '-';

const normalizarTipo = (tipo: unknown): 'RECEITA' | 'DESPESA' =>
  String(tipo).toUpperCase() === 'RECEITA' ? 'RECEITA' : 'DESPESA';

/* ================= COMPONENT ================= */
/* ================= COMPONENT ================= */
export default function Transacoes() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [todasTransacoes, setTodasTransacoes] = useState<Transacao[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [open, setOpen] = useState(false);
  const [transactionRequestKey, setTransactionRequestKey] = useState(() => crypto.randomUUID());

  const { mes, ano, setMes, setAno } = usePeriodo();
  const [todosPeriodos, setTodosPeriodos] = useState(true);

  /* 🔥 FILTRO POR CONTA */
  const [contaFiltro, setContaFiltro] = useState<string>('TODAS');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: 'DESPESA',
      formaPagamento: 'PIX',
    },
  });

  const tipo = watch('tipo');
  const formaPagamento = watch('formaPagamento');
  const contaId = watch('contaId');
  const cartaoId = watch('cartaoId');
  const categoriaId = watch('categoriaId');

  /* ================= LOAD ================= */
  useEffect(() => {
  Promise.all([
    transacoesApi.list(),
    categoriasApi.list(),
    contasApi.list(),
    cartoesApi.list(),
  ]).then(([tRes, cRes, contasRes, cartoesRes]) => {
    const normalizadas = tRes.data.map((t) => ({
      ...t,
      valor: Number(t.valor),
      tipo: normalizarTipo(t.tipo),
    }));

    setTodasTransacoes(normalizadas);
    setTransacoes(normalizadas);

    setCategorias(cRes.data);
    setContas(contasRes.data);
    setCartoes(cartoesRes.data);
  });
}, []);



  /* ================= FILTRO PERÍODO + CONTA ================= */
  useEffect(() => {
    let filtradas = todasTransacoes.filter((t) => {
      if (todosPeriodos) return true;
      const data = parseData(t.data);
      return data?.mes === mes && data.ano === ano;
    });

    /* FILTRO POR CONTA */
    if (contaFiltro !== 'TODAS') {
      filtradas = filtradas.filter(
        (t) => String(t.contaId) === contaFiltro
      );
    }

    setTransacoes(filtradas);
  }, [mes, ano, contaFiltro, todasTransacoes, todosPeriodos]);


  /* ================= RESET DEPENDENTE ================= */
  useEffect(() => {
    if (formaPagamento === 'CREDITO') {
      setValue('contaId', undefined);
    } else {
      setValue('cartaoId', undefined);
    }
  }, [formaPagamento, setValue]);

  /* ================= CREATE ================= */
  const onSubmit = async (form: FormData) => {
    try {
      const payload = {
        descricao: form.descricao,
        valor: Number(form.valor),
        data: form.data,
        tipo: form.tipo,
        categoriaId: form.categoriaId,
        formaPagamento: form.formaPagamento,
        contaId:
          form.formaPagamento !== 'CREDITO'
            ? form.contaId
            : undefined,
        cartaoId:
          form.formaPagamento === 'CREDITO'
            ? form.cartaoId
            : undefined,
        idempotencyKey: transactionRequestKey,
      };

      const res = await transacoesApi.create(payload);

      const novaTransacao: Transacao = {
        id: res.data.id,
        descricao: form.descricao,
        valor: Number(form.valor),
        data: form.data.split('-').reverse().join('-'),
        tipo: form.tipo,
        categoriaId: form.categoriaId,
        formaPagamento: form.formaPagamento,
        contaId: form.formaPagamento !== 'CREDITO' ? form.contaId : undefined,
        cartaoId: form.formaPagamento === 'CREDITO' ? form.cartaoId : undefined,
      };
      setTodasTransacoes((prev) => [novaTransacao, ...prev]);
      setTodosPeriodos(true);

      if (res.data.excedeLimitePessoal) {
        toast.warning('A compra ultrapassou o limite pessoal configurado para este cartão.');
      }
      res.data.alertas?.forEach((alerta: { mensagem: string }) => toast.warning(alerta.mensagem));
      toast.success('Transação criada');

      setTransactionRequestKey(crypto.randomUUID());
      setOpen(false);
      reset({
        descricao: '',
        valor: '',
        data: '',
        tipo: 'DESPESA',
        categoriaId: undefined,
        formaPagamento: 'PIX',
        contaId: undefined,
        cartaoId: undefined,
      });
    } catch {
      toast.error('Erro ao criar transação');
    }
  };

  /* ================= DELETE ================= */
  const remove = async (id: number) => {
    await transacoesApi.delete(id);
    setTransacoes((prev) => prev.filter((t) => t.id !== id));
    toast.success('Transação removida');
  };

  /* ================= FILTRO ================= */
  const transacoesFiltradas = useMemo(() => {
    if (contaFiltro === 'TODAS') return transacoes;
    return transacoes.filter(
      (t) => t.contaId === Number(contaFiltro)
    );
  }, [transacoes, contaFiltro]);

  /* ================= RENDER ================= */
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Transações</h1>

        <Dialog open={open} onOpenChange={(nextOpen) => {
          if (nextOpen) setTransactionRequestKey(crypto.randomUUID());
          setOpen(nextOpen);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Transação</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Select value={tipo} onValueChange={(v) => setValue('tipo', v as FormData['tipo'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESPESA">Despesa</SelectItem>
                  <SelectItem value="RECEITA">Receita</SelectItem>
                </SelectContent>
              </Select>

              <Input placeholder="Descrição" {...register('descricao')} />
              <Input type="number" min="0.01" step="0.01" placeholder="Valor" {...register('valor')} />
              <Input type="date" {...register('data')} />

              <Select
                value={categoriaId ? String(categoriaId) : ''}
                onValueChange={(v) => setValue('categoriaId', Number(v))}
              >
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {categorias.filter(c => c.tipo === tipo).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={formaPagamento} onValueChange={(v) => setValue('formaPagamento', v as FormData['formaPagamento'])}>
                <SelectTrigger><SelectValue placeholder="Forma de pagamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                  <SelectItem value="DEBITO">Débito</SelectItem>
                  <SelectItem value="CREDITO">Crédito</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                </SelectContent>
              </Select>

              {formaPagamento !== 'CREDITO' && (
                <Select
                  value={contaId ? String(contaId) : ''}
                  onValueChange={(v) => setValue('contaId', Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                  <SelectContent>
                    {contas.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {formaPagamento === 'CREDITO' && (
                <Select
                  value={cartaoId ? String(cartaoId) : ''}
                  onValueChange={(v) => setValue('cartaoId', Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Cartão" /></SelectTrigger>
                  <SelectContent>
                    {cartoes.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      
          <div className="flex flex-wrap gap-2">
	   <Select value={contaFiltro} onValueChange={setContaFiltro}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Filtrar por conta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TODAS">Todas as contas</SelectItem>
          {contas.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
            <Button
              type="button"
              size="sm"
              variant={todosPeriodos ? 'secondary' : 'outline'}
              onClick={() => setTodosPeriodos((todos) => !todos)}
            >
              Todos os períodos
            </Button>
            <Select value={String(mes)} onValueChange={v => { setMes(Number(v)); setTodosPeriodos(false); }}>
              <SelectTrigger className="w-[120px]" disabled={todosPeriodos}>
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }).map((_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(ano)} onValueChange={v => { setAno(Number(v)); setTodosPeriodos(false); }}>
              <SelectTrigger className="w-[120px]" disabled={todosPeriodos}>
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {[ano - 1, ano, ano + 1].map(a => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select> </div>


      <AnimatePresence>
        {transacoesFiltradas.map((t) => {
          const isReceita = t.tipo === 'RECEITA';

          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-between items-center rounded-lg bg-muted/40 p-4"
            >
              <div className="flex gap-3">
                {isReceita
                  ? <ArrowUpRight className="text-green-600" />
                  : <ArrowDownRight className="text-red-600" />
                }
                <div>
                  <p className="font-medium">{t.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatarData(t.data)} • {formaPagamentoLabel(t.formaPagamento)} •{' '}
                    {t.formaPagamento === 'CREDITO'
                      ? `Cartão: ${getCartaoNome(cartoes, t.cartaoId)}`
                      : `Conta: ${getContaNome(contas, t.contaId)}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={isReceita ? 'text-green-600' : 'text-red-600'}>
                  {isReceita ? '+' : '-'} R$ {t.valor.toFixed(2)}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost">
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => remove(t.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
