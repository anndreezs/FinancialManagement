import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Wallet, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { DataCard } from '@/components/ui/data-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from 'sonner';
import { contasApi, Conta } from '@/lib/api';

/* ================= SCHEMA ================= */
const contaSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  tipo: z.string().min(1, 'Tipo é obrigatório'),
  saldo: z.string().min(1, 'Saldo é obrigatório'),
});

type ContaForm = z.infer<typeof contaSchema>;

const tiposConta = [
  { value: 'CORRENTE', label: 'Conta Corrente' },
  { value: 'POUPANCA', label: 'Poupança' },
  { value: 'INVESTIMENTO', label: 'Investimento' },
  { value: 'CARTEIRA', label: 'Carteira' },
];

export default function Contas() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState('');
  const [contaEditando, setContaEditando] = useState<Conta | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ContaForm>({
    resolver: zodResolver(contaSchema),
  });

  /* ================= LOAD ================= */
  useEffect(() => {
    fetchContas();
  }, []);

  const fetchContas = async () => {
    try {
      const res = await contasApi.list();
      setContas(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar contas');
    }
  };

  /* ================= SUBMIT ================= */
  const onSubmit = async (data: ContaForm) => {
    try {
      const payload = {
        nome: data.nome,
        tipo: selectedTipo,
        saldo: parseFloat(data.saldo.replace(',', '.')),
      };

      if (contaEditando) {
        const res = await contasApi.update(contaEditando.id, payload);
        setContas((prev) =>
          prev.map((c) => (c.id === contaEditando.id ? res.data : c))
        );
        toast.success('Conta atualizada com sucesso!');
      } else {
        const res = await contasApi.create(payload);
        setContas((prev) => [...prev, res.data]);
        toast.success('Conta criada com sucesso!');
      }

      setIsDialogOpen(false);
      setContaEditando(null);
      setSelectedTipo('');
      reset();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar conta');
    }
  };

  /* ================= DELETE ================= */
  const handleDelete = async (id: number) => {
    try {
      await contasApi.delete(id);
      setContas((prev) => prev.filter((c) => c.id !== id));
      toast.success('Conta excluída com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir conta');
    }
  };

  /* ================= EDIT ================= */
  const handleEdit = (conta: Conta) => {
    setContaEditando(conta);
    setIsDialogOpen(true);
    setSelectedTipo(conta.tipo);

    reset({
      nome: conta.nome,
      tipo: conta.tipo,
      saldo: conta.saldo.toString(),
    });
  };

  const getTipoLabel = (tipo: string) =>
    tiposConta.find((t) => t.value === tipo)?.label || tipo;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <DataCard
        title="Suas Contas"
        action={
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                reset();
                setSelectedTipo('');
                setContaEditando(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Conta
              </Button>
            </DialogTrigger>

            <DialogContent className="border-border bg-card">
              <DialogHeader>
                <DialogTitle>
                  {contaEditando ? 'Editar Conta' : 'Adicionar Conta'}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input {...register('nome')} />
                </div>

                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={selectedTipo}
                    onValueChange={(val) => {
                      setSelectedTipo(val);
                      setValue('tipo', val, { shouldValidate: true });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposConta.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Saldo</Label>
                  <Input {...register('saldo')} />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {contas.map((conta) => (
              <motion.div key={conta.id} className="rounded-xl border p-4">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">{conta.nome}</p>
                    <p className="text-xs">{getTipoLabel(conta.tipo)}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(conta)}>
                        <Pencil className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(conta.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="mt-4 text-2xl font-bold">
                  R$ {conta.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </DataCard>
    </motion.div>
  );
}
