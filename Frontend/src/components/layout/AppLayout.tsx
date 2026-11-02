import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/contas': 'Contas',
  '/cartoes': 'Cartões',
  '/categorias': 'Categorias',
  '/dividas': 'Dívidas',
  '/orcamentos': 'Orçamentos',
  '/transacoes': 'Transações',
  '/relatorios': 'Relatórios e análises',
  '/planejamento': 'Planejamento financeiro',
  '/metas': 'Metas financeiras',
};

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    window.matchMedia('(min-width: 1024px)').matches
  );
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Dashboard';

  // Fecha o menu no celular ao navegar entre telas
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar title={title} onMenuClick={() => setSidebarOpen((prev) => !prev)} />
        
        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
