import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, TOKEN_STORAGE_KEY, User } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, senha: string) => Promise<void>;
  register: (nome: string, email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Valida o token salvo ao iniciar o app
  useEffect(() => {
    let active = true;

    async function loadUserFromToken() {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!storedToken) {
        if (active) setIsLoading(false);
        return;
      }

      try {
        const response = await authApi.me();
        if (active) {
          setUser(response.data.user);
          setToken(storedToken);
        }
      } catch (error) {
        if (active) {
          logout();
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadUserFromToken();

    // Ouve evento global disparado quando o backend retorna 401
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      active = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [logout]);

  const login = async (email: string, senha: string) => {
    const response = await authApi.login({ email, senha });
    const { token: newToken, user: userData } = response.data;

    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(userData);
  };

  const register = async (nome: string, email: string, senha: string) => {
    const response = await authApi.register({ nome, email, senha });
    const { token: newToken, user: userData } = response.data;

    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(userData);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}
