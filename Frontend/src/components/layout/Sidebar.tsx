import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  Tags,
  PiggyBank,
  ArrowLeftRight,
  X,
  ChartNoAxesCombined,
  ShieldCheck,
  Target,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Wallet, label: 'Contas', path: '/contas' },
  { icon: CreditCard, label: 'Cartões', path: '/cartoes' },
  { icon: Tags, label: 'Categorias', path: '/categorias' },
  { icon: PiggyBank, label: 'Dívidas', path: '/dividas' },
  { icon: ArrowLeftRight, label: 'Transações', path: '/transacoes' },
  { icon: ChartNoAxesCombined, label: 'Relatórios', path: '/relatorios' },
  { icon: ShieldCheck, label: 'Planejamento', path: '/planejamento' },
  { icon: Target, label: 'Metas', path: '/metas' },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    onClose();
  };

  const renderNavContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <Wallet className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">Financeiro</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground lg:hidden"
          aria-label="Fechar menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={() => {
              if (window.innerWidth < 1024) {
                onClose();
              }
            }}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/15 text-primary font-semibold shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-5 w-5 shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Info & Logout */}
      <div className="border-t border-sidebar-border p-4 space-y-3">
        {user && (
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-2.5 border border-border/40">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-sm">
              {user.nome.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{user.nome}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair da conta</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="hidden h-screen flex-shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar lg:block"
          >
            {renderNavContent()}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
              if (window.innerWidth < 1024) {
                onClose();
              }
            }}
              className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="fixed inset-y-0 left-0 z-50 w-full max-w-xs border-r border-sidebar-border bg-sidebar lg:hidden"
            >
              {renderNavContent()}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
