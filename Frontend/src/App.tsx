import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Contas = lazy(() => import('./pages/Contas'));
const Cartoes = lazy(() => import('./pages/Cartoes'));
const Categorias = lazy(() => import('./pages/Categorias'));
const Dividas = lazy(() => import('./pages/Dividas'));
const Transacoes = lazy(() => import('./pages/Transacoes'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const Planejamento = lazy(() => import('./pages/Planejamento'));
const Metas = lazy(() => import('./pages/Metas'));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div role="status" className="p-6 text-sm text-muted-foreground flex h-screen items-center justify-center">Carregando...</div>}>
            <Routes>
              {/* Rota pública de autenticação */}
              <Route path="/login" element={<Login />} />

              {/* Rotas protegidas por autenticação JWT */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/contas" element={<Contas />} />
                  <Route path="/cartoes" element={<Cartoes />} />
                  <Route path="/categorias" element={<Categorias />} />
                  <Route path="/dividas" element={<Dividas />} />
                  <Route path="/transacoes" element={<Transacoes />} />
                  <Route path="/relatorios" element={<Relatorios />} />
                  <Route path="/planejamento" element={<Planejamento />} />
                  <Route path="/metas" element={<Metas />} />
                </Route>
              </Route>

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
