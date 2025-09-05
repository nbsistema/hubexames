import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService, AuthUser } from '../lib/auth';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log('🔄 Inicializando autenticação...');
        const currentUser = await authService.getCurrentUser();
        if (currentUser) {
          console.log('✅ Usuário encontrado:', currentUser);
        } else {
          console.log('ℹ️ Nenhum usuário logado');
        }
        setUser(currentUser);
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('🔐 Context: Iniciando login...');
    const { user: authUser, error } = await authService.signIn(email, password);
    if (authUser) {
      console.log('✅ Context: Login bem-sucedido, atualizando estado');
      setUser(authUser);
    } else {
      console.log('❌ Context: Falha no login');
    }
    return { error };
  };

  const signOut = async () => {
    console.log('🚪 Context: Fazendo logout...');
    await authService.signOut();
    setUser(null);
    console.log('✅ Context: Logout concluído');
  };

  const resetPassword = async (email: string) => {
    console.log('🔄 Context: Iniciando reset de senha...');
    return await authService.resetPassword(email);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}