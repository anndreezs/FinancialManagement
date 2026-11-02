import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Menu,
  Bell,
  LogOut,
  CheckCheck,
  Check,
  X,
  AlertTriangle,
  CreditCard,
  Wallet,
  Calendar,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { financialApi, AlertEvent } from '@/lib/api';

interface TopBarProps {
  title: string;
  onMenuClick: () => void;
}

function formatAlertDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getAlertIcon(tipo: string) {
  switch (tipo?.toLowerCase()) {
    case 'card_limit':
    case 'cartao':
      return <CreditCard className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
    case 'safe_balance':
    case 'saldo':
      return <Wallet className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
    case 'debt_due':
    case 'divida':
      return <Calendar className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
  }
}

export function TopBar({ title, onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await financialApi.alerts();
      setAlerts(res.data.alerts || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      // Ignora erro se estiver offline ou sem dados
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    // Atualiza periodicamente a cada 45 segundos
    const interval = setInterval(fetchAlerts, 45000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkRead = async (id: number) => {
    try {
      await financialApi.markAlertRead(id);
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, lido_em: new Date().toISOString() } : a))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Erro ao marcar notificação como lida', err);
    }
  };

  const handleDismiss = async (id: number) => {
    try {
      await financialApi.dismissAlert(id);
      const target = alerts.find((a) => a.id === id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      if (target && !target.lido_em) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Erro ao descartar notificação', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await financialApi.markAllAlertsRead();
      setAlerts((prev) =>
        prev.map((a) => ({ ...a, lido_em: a.lido_em || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Erro ao marcar todas como lidas', err);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
          title="Alternar Menu"
        >
          <Menu className="h-5 w-5" />
        </motion.button>
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          key={title}
          className="text-xl font-semibold text-foreground truncate max-w-[200px] sm:max-w-none"
        >
          {title}
        </motion.h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {user && (
          <span className="hidden sm:inline-block text-xs text-muted-foreground mr-1">
            Olá, <strong className="text-foreground">{user.nome.split(' ')[0]}</strong>
          </span>
        )}

        {/* Central de Notificações Popover */}
        <div className="relative" ref={dropdownRef}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen((prev) => !prev)}
            className={`relative flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
              isOpen
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            title="Central de Notificações"
            aria-expanded={isOpen}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </motion.button>

          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
              >
                {/* Cabeçalho */}
                <div className="flex items-center justify-between border-b border-border p-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Notificações</span>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-primary/20 text-primary text-[11px] font-medium px-2 py-0.5">
                        {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={fetchAlerts}
                      disabled={loading}
                      title="Atualizar"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline px-1.5 py-0.5"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Ler todas
                      </button>
                    )}
                  </div>
                </div>

                {/* Lista de Alertas */}
                <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
                  {alerts.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground px-4">
                      <div className="flex justify-center mb-2">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                          <Check className="h-5 w-5 text-emerald-500" />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-foreground">Tudo em dia!</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Nenhum alerta pendente no momento.
                      </p>
                    </div>
                  ) : (
                    alerts.map((alert) => {
                      const isUnread = !alert.lido_em;
                      return (
                        <div
                          key={alert.id}
                          className={`flex items-start gap-3 p-3 transition-colors ${
                            isUnread ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                          }`}
                        >
                          {getAlertIcon(alert.tipo)}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-xs leading-snug break-words ${
                                isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'
                              }`}
                            >
                              {alert.mensagem}
                            </p>
                            <span className="text-[10px] text-muted-foreground/80 mt-1 block">
                              {formatAlertDate(alert.created_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isUnread && (
                              <button
                                onClick={() => handleMarkRead(alert.id)}
                                title="Marcar como lida"
                                className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDismiss(alert.id)}
                              title="Descartar"
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Rodapé informativo */}
                <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-primary" />
                    <span>Alertas por e-mail suportados</span>
                  </span>
                  <span className="text-[10px] opacity-75">Central Ativa</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={logout}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Sair da conta"
        >
          <LogOut className="h-5 w-5" />
        </motion.button>
      </div>
    </header>
  );
}
