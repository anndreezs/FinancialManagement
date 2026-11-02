import { categoriasApi, Categoria } from '@/lib/api';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { DataCard } from '@/components/ui/data-card';
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

const categoriaSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(50),
  cor: z.string().min(1, 'Cor é obrigatória'),
});

type CategoriaForm = z.infer<typeof categoriaSchema>;

const cores = [
  { value: '#10b981', label: 'Verde' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#f59e0b', label: 'Laranja' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#8b5cf6', label: 'Roxo' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#06b6d4', label: 'Ciano' },
];

export default function Categorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<'RECEITA' | 'DESPESA'>('DESPESA');
  const [selectedCor, setSelectedCor] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CategoriaForm>({
    resolver: zodResolver(categoriaSchema),
  });

  useEffect(() => {
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      const res = await categoriasApi.list();
      setCategorias(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar categorias');
    }
  };

  const onSubmit = async (data: CategoriaForm) => {
    try {
      const payload = {
        nome: data.nome,
        tipo: selectedTipo,
        cor: data.cor,
      };
      const res = await categoriasApi.create(payload);
      setCategorias((prev) => [...prev, res.data]);
      setIsDialogOpen(false);
      reset();
      setSelectedCor('');
      toast.success('Categoria criada com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao criar categoria');
    }
  };

  const handleDelete = async (id: number) => {
      try {
        await categoriasApi.delete(id);
        setCategorias((prev) => prev.filter((c) => c.id !== id));
        toast.success('Categoria excluída com sucesso!');
      } catch (err) {
        console.error(err);
        toast.error('Erro ao excluir categoria');
      }
    };

  const receitas = categorias.filter((c) => c.tipo === 'RECEITA');
  const despesas = categorias.filter((c) => c.tipo === 'DESPESA');

return (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="space-y-6"
  >
    <div className="flex justify-end">
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Categoria
          </Button>
        </DialogTrigger>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Adicionar Categoria</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <input type="hidden" {...register('cor')} />
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                placeholder="Ex: Alimentação"
                {...register('nome')}
                className="bg-input border-border"
              />
              {errors.nome && (
                <p className="text-xs text-destructive">{errors.nome.message}</p>
              )}
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={selectedTipo}
                onValueChange={(v) => setSelectedTipo(v as 'RECEITA' | 'DESPESA')}
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  <SelectItem value="DESPESA">Despesa</SelectItem>
                  <SelectItem value="RECEITA">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cor */}
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {cores.map((cor) => (
                  <button
                    key={cor.value}
                    type="button"
                    onClick={() => {
                      setSelectedCor(cor.value);      
                      setValue('cor', cor.value);     
                    }}  
                    className={`h-8 w-8 rounded-full transition-all ${
                      selectedCor === cor.value
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: cor.value }}
                    title={cor.label}
                  />
                ))}
              </div>
            </div>

            

            {/* Botões */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                Criar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>

    {/* Listas */}
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Despesas */}
      <DataCard title="Despesas">
        {despesas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma categoria de despesa
          </p>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {despesas.map((categoria, index) => (
                <motion.div
                  key={categoria.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: categoria.cor }}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {categoria.nome}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="border-border bg-popover">
                      <DropdownMenuItem className="gap-2">
                        <Pencil className="h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 text-destructive focus:text-destructive"
                        onClick={() => handleDelete(categoria.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </DataCard>

      {/* Receitas */}
      <DataCard title="Receitas">
        {receitas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma categoria de receita
          </p>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {receitas.map((categoria, index) => (
                <motion.div
                  key={categoria.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: categoria.cor }}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {categoria.nome}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="border-border bg-popover">
                      <DropdownMenuItem className="gap-2">
                        <Pencil className="h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 text-destructive focus:text-destructive"
                        onClick={() => handleDelete(categoria.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </DataCard>
    </div>
  </motion.div>
);
};