import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  CreditCard,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatCard } from '@/components/ui/stat-card';
import { DataCard } from '@/components/ui/data-card';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  transacoesApi,
  contasApi,
  cartoesApi,
  financialApi,
} from '@/lib/api';
import type { Conta, Transacao, Cartao } from '@/lib/api';

import { usePeriodo } from '@/hooks/usePeriodo';

/* ================= ANIMATION ================= */
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

/* ================= HELPERS ================= */
const parseDate = (data: string): Date => {
  if (data.includes('-')) {
    const parts = data.split('-');
    if (parts[0].length === 2) {
      const [dia, mes, ano] = parts;
      return new Date(Number(ano), Number(mes) - 1, Number(dia));
    }
    return new Date(data);
  }
  return new Date(data);
};

export default function Dashboard() {
  const [todasTransacoes, setTodasTransacoes] = useState<Transacao[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [resumoMensal, setResumoMensal] = useState<{ receitasCentavos: number; despesasCentavos: number } | null>(null);

  const { mes, ano, setMes, setAno } = usePeriodo();

  const [contaSelecionada, setContaSelecionada] = useState('TOTAL');
  const [cartaoSelecionado, setCartaoSelecionado] = useState('TOTAL');

  /* ================= LOAD ================= */
  useEffect(() => {
    async function load() {
      const [tRes, cRes, cartRes] = await Promise.all([
        transacoesApi.list(),
        contasApi.list(),
        cartoesApi.list(),
      ]);

      const transacoesNormalizadas = tRes.data.map((t) => ({
        ...t,
        valor: Number(t.valor),
      }));

      setTodasTransacoes(transacoesNormalizadas);
      setTransacoes(transacoesNormalizadas);

      setContas(
        cRes.data.map((c) => ({
          ...c,
          saldo: Number(c.saldo),
        }))
      );

      setCartoes(
        cartRes.data.map((c) => ({
          ...c,
          limite: Number(c.limite),
        }))
      );
    }

    load();
  }, []);

  /* ================= FILTRO PERÍODO ================= */
  useEffect(() => {
    const filtradas = todasTransacoes.filter((t) => {
      const data = parseDate(t.data);
      return (
        data.getMonth() + 1 === mes &&
        data.getFullYear() === ano
      );
    });

    setTransacoes(filtradas);
  }, [mes, ano, todasTransacoes]);

  useEffect(() => {
    let active = true;
    financialApi.monthlyReport(mes, ano).then((response) => {
      if (active) setResumoMensal(response.data.resumo);
    }).catch(() => {
      if (active) setResumoMensal(null);
    });
    return () => { active = false; };
  }, [mes, ano]);

  /* ================= SALDO CONTAS ================= */
  const saldoExibido = useMemo(() => {
    if (contaSelecionada === 'TOTAL') {
      return contas.reduce((acc, c) => acc + c.saldo, 0);
    }

    const conta = contas.find(
      (c) => c.id === Number(contaSelecionada)
    );

    return conta?.saldo ?? 0;
  }, [contas, contaSelecionada]);

  /* ================= SALDO CARTÕES ================= */
const saldoCartaoExibido = useMemo(() => {
  if (cartaoSelecionado === 'TOTAL') {
    return cartoes.reduce(
      (acc, c) => acc + Number(c.limite_disponivel),
      0
    );
  }

  const cartao = cartoes.find(
    (c) => c.id === Number(cartaoSelecionado)
  );

  return Number(cartao?.limite_disponivel ?? 0);
}, [cartoes, cartaoSelecionado]);


  /* ================= TRANSACOES ================= */
  const totalReceitas = (resumoMensal?.receitasCentavos ?? 0) / 100;
  const totalDespesas = (resumoMensal?.despesasCentavos ?? 0) / 100;

  const recentTransactions = [...transacoes]
    .sort(
      (a, b) =>
        +parseDate(b.data) -
        +parseDate(a.data)
    )
    .slice(0, 4);

  const formatMoney = (v: number) =>
    v.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      

      {/* ================= STATS ================= */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Saldo"
          value={formatMoney(saldoExibido)}
          icon={Wallet}
          action={
            <Select
              value={contaSelecionada}
              onValueChange={setContaSelecionada}
            >
              <SelectTrigger className="h-7 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TOTAL">
                  Saldo Total
                </SelectItem>
                {contas.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={String(c.id)}
                  >
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
<StatCard
          title="Cartões"
          value={formatMoney(saldoCartaoExibido)}
          icon={CreditCard}
          action={
            <Select
              value={cartaoSelecionado}
              onValueChange={setCartaoSelecionado}
            >
              <SelectTrigger className="h-7 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TOTAL">
                  Total cartões
                </SelectItem>
                {cartoes.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={String(c.id)}
                  >
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <StatCard
          title="Receitas"
          value={formatMoney(totalReceitas)}
          icon={TrendingUp}
          variant="success"
        />

        <StatCard
          title="Despesas"
          value={formatMoney(totalDespesas)}
          icon={TrendingDown}
          variant="danger"
        />

        
      </div>

{/* ================= FILTRO MÊS / ANO ================= */}
      <div className="flex gap-3">
        <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-[120px]">
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

        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {[ano - 1, ano, ano + 1].map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ================= RECENTES ================= */}
      <DataCard
        title="Transações Recentes"
        action={
          <Link
            to="/transacoes"
            className="text-xs text-primary hover:underline"
          >
            Ver todas
          </Link>
        }
      >
        <div className="space-y-3">
          {recentTransactions.map((t) => {
            const isReceita = t.tipo === 'RECEITA';
            return (
              <div
                key={t.id}
                className="flex justify-between rounded-lg bg-muted/30 p-3"
              >
                <div className="flex gap-3">
                  {isReceita ? (
                    <ArrowUpRight className="text-green-600" />
                  ) : (
                    <ArrowDownRight className="text-red-600" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {t.descricao}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {parseDate(t.data).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <span
                  className={`font-semibold ${
                    isReceita
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {isReceita ? '+' : '-'}
                  {formatMoney(t.valor)}
                </span>
              </div>
            );
          })}
        </div>
      </DataCard>
    </motion.div>
  );
}
