import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail, User as UserIcon, Wallet, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const destination = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !senha) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (isRegister) {
      if (!nome.trim() || nome.trim().length < 2) {
        toast.error('O nome deve ter pelo menos 2 caracteres');
        return;
      }
      if (senha.length < 6) {
        toast.error('A senha deve ter pelo menos 6 caracteres');
        return;
      }
      if (senha !== confirmarSenha) {
        toast.error('As senhas não coincidem');
        return;
      }
    }

    try {
      setLoading(true);
      if (isRegister) {
        await register(nome.trim(), email.trim(), senha);
        toast.success('Conta criada com sucesso! Seja bem-vindo(a).');
      } else {
        await login(email.trim(), senha);
        toast.success('Login realizado com sucesso!');
      }
      navigate(destination, { replace: true });
    } catch (error) {
      const msg = getApiErrorMessage(error, isRegister ? 'Erro ao criar conta' : 'E-mail ou senha incorretos');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-background via-background/95 to-muted/40 p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-xl"
      >
        {/* Cabeçalho */}
        <div className="border-b border-border/50 bg-gradient-to-b from-primary/10 to-transparent p-6 sm:p-8 text-center">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"
          >
            <Wallet className="h-7 w-7" />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Gestão Financeira
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
            {isRegister
              ? 'Cadastre seu usuário para começar a controlar seus recursos'
              : 'Entre com suas credenciais para acessar o painel'}
          </p>

          {/* Abas Alternadoras */}
          <div className="mt-6 flex rounded-xl bg-muted/60 p-1 border border-border/40">
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
              }}
              className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-medium transition-all ${
                !isRegister
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
              }}
              className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-medium transition-all ${
                isRegister
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Criar Conta
            </button>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
          <AnimatePresence mode="wait">
            {isRegister && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5"
              >
                <Label htmlFor="nome" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nome Completo
                </Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Seu nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="pl-9 h-11"
                    disabled={loading}
                    autoComplete="name"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              E-mail
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-11"
                disabled={loading}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="senha" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Senha
              </Label>
              {isRegister && (
                <span className="text-[11px] text-muted-foreground">Mínimo 6 caracteres</span>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="senha"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="pl-9 pr-10 h-11"
                disabled={loading}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {isRegister && (
              <motion.div
                key="confirm-password-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5"
              >
                <Label htmlFor="confirmarSenha" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Confirmar Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmarSenha"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Repita a senha"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    className="pl-9 h-11"
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            className="w-full h-11 text-sm font-semibold tracking-wide transition-all shadow-md shadow-primary/20 mt-2"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <>
                {isRegister ? 'Finalizar Cadastro' : 'Entrar no Sistema'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <div className="text-center pt-2">
            <p className="text-xs text-muted-foreground">
              {isRegister ? 'Já tem uma conta?' : 'Ainda não possui conta?'}{' '}
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="font-semibold text-primary hover:underline ml-1"
                disabled={loading}
              >
                {isRegister ? 'Faça login' : 'Cadastre-se'}
              </button>
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
