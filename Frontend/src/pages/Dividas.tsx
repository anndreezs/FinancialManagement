import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  CreditCard,
  MoreVertical,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { DataCard } from '@/components/ui/data-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

import {
  categoriasApi,
  contasApi,
  cartoesApi,
  transacoesApi,
  dividasApi,
} from '@/lib/api';

import type { Categoria, Conta, Cartao, DividaView } from '@/lib/api';
import { toast } from 'sonner';

/* ================= SCHEMA ================= */
const dividaSchema = z.object({
  descricao: z.string().min(1),
  valor: z.string().min(1),
  categoriaId: z.number(),
  tipoDivida: z.enum(['FIXA', 'PARCELADA']),
  parcelaTotal: z.number().optional(),
  dataVencimento: z.string().min(1),
});

type DividaForm = z.infer<typeof dividaSchema>;

interface Divida {
  id: number;
  descricao: string;
  valor: number;
  pago: number;
  categoria: string;
  categoriaId: number;
  cor: string;
  status: 'ABERTA' | 'PAGA';
  tipoDivida: 'FIXA' | 'PARCELADA';
  parcelaAtual: number;
  parcelaTotal: number;
}

/* ================= MAPPER ================= */
const mapDividaViewToDivida = (
  d: DividaView,
  categorias: Categoria[]
): Divida => {
  const categoria = categorias.find(c => c.id === d.categoriaId);

  return {
    id: d.id,
    descricao: d.descricao,
    valor: Number(d.valor),
    pago: d.status === 'paga' ? Number(d.valor) : 0,
    categoria: categoria?.nome ?? '',
    categoriaId: d.categoriaId,
    cor: categoria?.cor ?? '#ccc',
    status: d.status === 'paga' ? 'PAGA' : 'ABERTA',
    tipoDivida: d.tipoDivida ?? 'FIXA',
    parcelaAtual: d.parcelaAtual ?? 1,
    parcelaTotal: d.parcelaTotal ?? 1,
  };
};

/* ================= COMPONENT ================= */
export default function Dividas() {
  const [dividas, setDividas] = useState<Divida[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);

  const hoje = new Date();
  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [todosPeriodos, setTodosPeriodos] = useState(true);

  const [openCreate, setOpenCreate] = useState(false);
  const [openPagar, setOpenPagar] = useState(false);
  const [dividaSelecionada, setDividaSelecionada] = useState<Divida | null>(null);

  const [formaPagamentoSelecionada, setFormaPagamentoSelecionada] =
  useState<
    | 'DINHEIRO'
    | 'DEBITO'
    | 'CREDITO'
    | 'PIX'
    | 'TRANSFERENCIA'
    | ''
  >('');
  const [contaSelecionada, setContaSelecionada] = useState<number | null>(null);
  const [cartaoSelecionado, setCartaoSelecionado] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm<DividaForm>({
    resolver: zodResolver(dividaSchema),
    defaultValues: {
      tipoDivida: 'FIXA',
    },
  });

  const tipoDivida = watch('tipoDivida');

  /* ================= LOAD ================= */
  useEffect(() => {
    Promise.all([
      dividasApi.list(
        todosPeriodos ? undefined : mesSelecionado,
        todosPeriodos ? undefined : anoSelecionado
      ),
      categoriasApi.list(),
      contasApi.list(),
      cartoesApi.list(),
    ]).then(([dRes, cRes, contasRes, cartoesRes]) => {
      setCategorias(cRes.data);
      setContas(contasRes.data);
      setCartoes(cartoesRes.data);

      setDividas(
        dRes.data.map(d => mapDividaViewToDivida(d, cRes.data))
      );
    });
  }, [mesSelecionado, anoSelecionado, todosPeriodos]);

  /* ================= CREATE ================= */
  const criarDivida = async (form: DividaForm) => {
    try {
      const res = await dividasApi.create({
        descricao: form.descricao,
        valor: Number(form.valor),
        categoriaId: form.categoriaId,
        tipoDivida: form.tipoDivida,
        parcelaTotal: form.tipoDivida === 'PARCELADA' ? form.parcelaTotal : 1,
        dataVencimento: form.dataVencimento,
      });

      setDividas(prev => [
        ...prev,
        mapDividaViewToDivida(res.data, categorias),
      ]);

      toast.success('Dívida criada');
      setOpenCreate(false);
      reset();
    } catch {
      toast.error('Erro ao criar dívida');
    }
  };

  /* ================= DELETE ================= */
  const remover = async (id: number) => {
    await dividasApi.delete(id);
    setDividas(prev => prev.filter(d => d.id !== id));
    toast.success('Dívida removida');
  };

  /* ================= PAGAR ================= */
  const pagarDivida = async (contaId?: number, cartaoId?: number) => {
  if (!dividaSelecionada || !formaPagamentoSelecionada) return;

  try {
    await dividasApi.pagar(dividaSelecionada.id, {
      valor: dividaSelecionada.valor,
      formaPagamento: formaPagamentoSelecionada,
      contaId,
      cartaoId,
    });

    toast.success('Pagamento realizado');

    // Atualiza visualmente para PAGA
    setDividas(prev =>
      prev.map(d =>
        d.id === dividaSelecionada.id
          ? { ...d, status: 'PAGA' }
          : d
      )
    );

    setOpenPagar(false);
    setFormaPagamentoSelecionada('');
    setContaSelecionada(undefined);
    setCartaoSelecionado(undefined);
  } catch {
    toast.error('Erro ao pagar dívida');
  }
};


  /* ================= RENDER ================= */
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <DataCard
        title="Dívidas"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={todosPeriodos ? 'secondary' : 'outline'}
              onClick={() => setTodosPeriodos((todos) => !todos)}
            >
              Todos os períodos
            </Button>
            <Select value={String(mesSelecionado)} onValueChange={v => { setMesSelecionado(Number(v)); setTodosPeriodos(false); }}>
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

            <Select value={String(anoSelecionado)} onValueChange={v => { setAnoSelecionado(Number(v)); setTodosPeriodos(false); }}>
              <SelectTrigger className="w-[120px]" disabled={todosPeriodos}>
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {[anoSelecionado - 1, anoSelecionado, anoSelecionado + 1].map(a => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Dívida
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Dívida</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(criarDivida)} className="space-y-4">
                  <Input placeholder="Descrição" {...register('descricao')} />
                  <Input placeholder="Valor" {...register('valor')} />
                  <Input type="date" {...register('dataVencimento')} />

                  <Select onValueChange={v => setValue('tipoDivida', v as DividaForm['tipoDivida'])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo da dívida" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXA">Fixa</SelectItem>
                      <SelectItem value="PARCELADA">Parcelada</SelectItem>
                    </SelectContent>
                  </Select>

                  {tipoDivida === 'PARCELADA' && (
                    <Select onValueChange={v => setValue('parcelaTotal', Number(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Quantidade de parcelas" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }).map((_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {i + 1}x
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Select onValueChange={v => setValue('categoriaId', Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias
                        .filter(c => c.tipo === 'DESPESA')
                        .map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <Button className="w-full">Salvar</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      >
        {dividas.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Nenhuma dívida"
            description="Cadastre suas dívidas para manter controle."
          />
        ) : (
          <AnimatePresence>
            {dividas.map(d => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex justify-between items-center rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">{d.descricao}</p>
                  <p className="text-sm text-muted-foreground">
                    Valor: R$ {d.valor.toFixed(2)} •{' '}
                    {d.tipoDivida === 'PARCELADA'
                      ? `Parcelada (${d.parcelaAtual}/${d.parcelaTotal})`
                      : 'Fixa'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {d.status === 'ABERTA' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDividaSelecionada(d);
                        setOpenPagar(true);
                      }}
                    >
                      Pagar
                    </Button>
                  )}

                  {d.status === 'PAGA' && (
                    <CheckCircle className="text-green-600" />
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost">
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => remover(d.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </DataCard>

      <Dialog open={openPagar} onOpenChange={setOpenPagar}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Pagar Dívida</DialogTitle>
    </DialogHeader>

    {dividaSelecionada && (
      <div className="space-y-4">
        <p className="font-medium">{dividaSelecionada.descricao}</p>

        <p className="text-sm text-muted-foreground">
          {dividaSelecionada.tipoDivida === 'PARCELADA'
            ? `Parcela ${dividaSelecionada.parcelaAtual}/${dividaSelecionada.parcelaTotal}`
            : 'Dívida Fixa'}
        </p>

        {/* NOVO – forma de pagamento */}
        <Select onValueChange={v => setFormaPagamentoSelecionada(v as typeof formaPagamentoSelecionada)}>
          <SelectTrigger>
            <SelectValue placeholder="Forma de pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
            <SelectItem value="PIX">Pix</SelectItem>
            <SelectItem value="DEBITO">Débito</SelectItem>
            <SelectItem value="CREDITO">Crédito</SelectItem>
            <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
          </SelectContent>
        </Select>

        {/* CONTA OU CARTÃO */}
        {formaPagamentoSelecionada === 'CREDITO' ? (
          <Select onValueChange={v => setCartaoSelecionado(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Cartão" />
            </SelectTrigger>
            <SelectContent>
              {cartoes.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select onValueChange={v => setContaSelecionada(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Conta" />
            </SelectTrigger>
            <SelectContent>
              {contas.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* NOVO – botão explícito */}
        <Button
  className="w-full"
  onClick={() =>
    pagarDivida(contaSelecionada, cartaoSelecionado)
  }
>
  Confirmar Pagamento
</Button>
      </div>
    )}
  </DialogContent>
</Dialog>

    </motion.div>
  );
}
