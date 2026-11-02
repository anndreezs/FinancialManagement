import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { DataCard } from '@/components/ui/data-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { financialApi, categoriasApi, contasApi, cartoesApi } from '@/lib/api';
import type { Categoria, Conta, Cartao, MonthlyReport } from '@/lib/api';
import { toast } from 'sonner';

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, index, 1))
);

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? 'Indisponível'
    : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const monthLabel = (month: number, year: number) =>
  `${monthNames[month - 1]} ${year}`;

export default function Relatorios() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [trendMonths, setTrendMonths] = useState<6 | 12 | 24>(6);
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [cardFilter, setCardFilter] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [trend, setTrend] = useState<Array<{
    mes: number;
    ano: number;
    receitasCentavos: number;
    despesasCentavos: number;
    resultadoCentavos: number;
  }>>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [accounts, setAccounts] = useState<Conta[]>([]);
  const [cards, setCards] = useState<Cartao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const filters = {
      tipo: typeFilter === 'all' ? undefined : typeFilter as 'entrada' | 'saida',
      categoriaId: categoryFilter === 'all' ? undefined : Number(categoryFilter),
      contaId: accountFilter === 'all' ? undefined : Number(accountFilter),
      cartaoId: cardFilter === 'all' ? undefined : Number(cardFilter),
    };

    Promise.all([
      financialApi.monthlyReport(month, year, filters),
      financialApi.trend(trendMonths, month, year, filters),
      categoriasApi.list(),
      contasApi.list(),
      cartoesApi.list(),
    ]).then(([reportResponse, trendResponse, categoriesResponse, accountsResponse, cardsResponse]) => {
      if (!active) return;
      setReport(reportResponse.data);
      setTrend(trendResponse.data.meses || []);
      setCategories(categoriesResponse.data);
      setAccounts(accountsResponse.data);
      setCards(cardsResponse.data);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Não foi possível carregar o relatório. Confira a API e tente novamente.');
      setLoading(false);
      toast.error('Falha ao carregar relatórios');
    });

    return () => { active = false; };
  }, [month, year, trendMonths, typeFilter, categoryFilter, accountFilter, cardFilter]);

  const categoryRows = useMemo(() => report?.categorias ?? [], [report]);
  const detailTransactions = useMemo(() => {
    const rows = categoryRows.flatMap((category) => category.transacoes);
    return selectedCategory ? rows.filter((row) => row.categoria === selectedCategory) : rows;
  }, [categoryRows, selectedCategory]);

  const chartData = categoryRows
    .filter((category) => category.despesasCentavos > 0)
    .map((category) => ({ nome: category.nome, despesas: category.despesasCentavos / 100 }));
  const trendChartData = trend.map((item) => ({
    label: monthLabel(item.mes, item.ano),
    receitas: item.receitasCentavos / 100,
    despesas: item.despesasCentavos / 100,
  }));

  const handleExport = () => window.print();

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-xl font-semibold">Relatórios e análises</h2>
          <p className="text-sm text-muted-foreground">Movimentações efetivadas; previsões e reservas são apresentadas separadamente.</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="gap-2">
          <Printer className="h-4 w-4" /> Exportar PDF
        </Button>
      </div>

      <DataCard title={`Período · ${monthLabel(month, year)}`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 no-print">
          <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{monthNames.map((name, index) => <SelectItem key={name} value={String(index + 1)}>{name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: Math.max(1, now.getFullYear() - 2019 + 2) }, (_, index) => 2020 + index).map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="Movimentação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="entrada">Receitas</SelectItem>
              <SelectItem value="saida">Despesas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cardFilter} onValueChange={setCardFilter}>
            <SelectTrigger><SelectValue placeholder="Cartão" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cartões</SelectItem>
              {cards.map((card) => <SelectItem key={card.id} value={String(card.id)}>{card.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="mt-3 hidden text-sm font-semibold print:block">{monthLabel(month, year)}</p>
        {loading && <p className="mt-4 text-sm text-muted-foreground">Carregando relatório...</p>}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </DataCard>

      {report && !loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DataCard title="Receitas"><p className="text-2xl font-semibold text-emerald-500">{money(report.resumo.receitasCentavos)}</p></DataCard>
            <DataCard title="Despesas"><p className="text-2xl font-semibold text-destructive">{money(report.resumo.despesasCentavos)}</p></DataCard>
            <DataCard title="Resultado realizado"><p className="text-2xl font-semibold">{money(report.resumo.resultadoCentavos)}</p></DataCard>
            <DataCard title="Taxa de poupança"><p className="text-2xl font-semibold">{report.resumo.taxaPoupancaPercentual === null ? 'Não aplicável' : `${report.resumo.taxaPoupancaPercentual.toLocaleString('pt-BR')}%`}</p></DataCard>
          </div>

          <DataCard title="Comparação com período equivalente">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Variação de receitas</p><p className="font-semibold">{money(report.comparacao.receitasVariacaoCentavos)}</p></div>
              <div><p className="text-xs text-muted-foreground">Variação de despesas</p><p className="font-semibold">{money(report.comparacao.despesasVariacaoCentavos)}</p></div>
              <div><p className="text-xs text-muted-foreground">Variação do resultado</p><p className="font-semibold">{money(report.comparacao.resultadoVariacaoCentavos)}</p></div>
              <div><p className="text-xs text-muted-foreground">Variação percentual do resultado</p><p className="font-semibold">{report.comparacao.resultadoVariacaoPercentual === null ? 'Sem base anterior' : `${report.comparacao.resultadoVariacaoPercentual.toLocaleString('pt-BR')}%`}</p></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">A comparação usa até o dia {report.periodo.diasComparados} em ambos os períodos. Saldos de abertura/fechamento históricos não são inferidos.</p>
          </DataCard>

          <DataCard title="Outros indicadores realizados">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Quantidade de transações</p><p className="font-semibold">{report.resumo.quantidadeTransacoes}</p></div>
              <div><p className="text-xs text-muted-foreground">Despesa média</p><p className="font-semibold">{money(report.resumo.despesaMediaCentavos)}</p></div>
              <div><p className="text-xs text-muted-foreground">Maior despesa</p><p className="font-semibold">{report.resumo.maiorDespesa ? money(report.resumo.maiorDespesa.valorCentavos) : 'Sem despesas'}</p></div>
              <div><p className="text-xs text-muted-foreground">Categoria de maior despesa</p><p className="font-semibold">{report.resumo.categoriaMaiorDespesa || 'Sem categoria'}</p></div>
            </div>
          </DataCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <DataCard title="Despesas por categoria">
              {chartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem despesas categorizadas no período.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="nome" angle={-25} textAnchor="end" interval={0} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                      <YAxis tickFormatter={(value) => `R$ ${value}`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => money(Math.round(value * 100))} />
                      <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </DataCard>

            <DataCard title="Evolução mensal">
              <div className="mb-3 flex justify-end no-print">
                <Select value={String(trendMonths)} onValueChange={(value) => setTrendMonths(Number(value) as 6 | 12 | 24)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 meses</SelectItem>
                    <SelectItem value="12">12 meses</SelectItem>
                    <SelectItem value="24">24 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {trend.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem histórico disponível.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendChartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <YAxis tickFormatter={(value) => `R$ ${value}`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => money(Math.round(value * 100))} />
                      <Legend />
                      <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" />
                      <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </DataCard>
          </div>

          <DataCard title="Categorias e transações">
            {categoryRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Não há movimentações para os filtros escolhidos.</p>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Categoria</th><th>Despesas</th><th>% despesas</th><th>Receitas</th><th>Movimentações</th></tr></thead>
                    <tbody>
                      {categoryRows.map((category) => (
                        <tr key={category.nome} className="border-b last:border-0">
                          <td className="py-2"><button className="text-left font-medium hover:underline" onClick={() => setSelectedCategory(selectedCategory === category.nome ? null : category.nome)}>{category.nome}</button></td>
                          <td>{money(category.despesasCentavos)}</td>
                          <td>{category.percentualDespesas === null ? 'Não aplicável' : `${category.percentualDespesas.toLocaleString('pt-BR')}%`}</td>
                          <td>{money(category.receitasCentavos)}</td>
                          <td>{category.quantidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">{selectedCategory ? `Movimentações · ${selectedCategory}` : 'Movimentações do período'}</h3>
                    {selectedCategory && <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)}>Limpar categoria</Button>}
                  </div>
                  {detailTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
                      <div>
                        <p className="font-medium">{transaction.descricao || 'Sem descrição'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(`${transaction.data}T00:00:00`).toLocaleDateString('pt-BR')} · {transaction.conta || transaction.cartao || 'Origem não informada'} · {transaction.formaPagamento || ''}</p>
                      </div>
                      <span className={transaction.tipo === 'entrada' ? 'text-emerald-500' : 'text-destructive'}>{money(transaction.valorCentavos)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DataCard>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Contribuições para metas no período: {money(report.resumo.contribuicoesMetasCentavos)}. Não são despesas de consumo.</p>
            {report.avisos.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        </>
      )}
    </div>
  );
}