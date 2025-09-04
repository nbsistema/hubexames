import { supabase, UserProfile, AppUser } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  profile: UserProfile;
}

export const authService = {
  async signIn(email: string, password: string): Promise<{ user: AuthUser | null; error: string | null }> {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        return { user: null, error: authError.message };
      }

      if (!authData.user) {
        return { user: null, error: 'Usuário não encontrado' };
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (userError) {
        return { user: null, error: 'Erro ao buscar dados do usuário' };
      }

      return {
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          profile: userData.profile,
        },
        error: null,
      };
    } catch (error) {
      return { user: null, error: 'Erro interno do sistema' };
    }
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return null;

      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error || !userData) return null;

      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        profile: userData.profile,
      };
    } catch {
      return null;
    }
  },

  async resetPassword(email: string): Promise<{ error: string | null }> {
    try {
      // Usar a URL de produção
      const redirectUrl = 'https://hub-exames.netlify.app/reset-password';
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      return { error: error?.message || null };
    } catch {
      return { error: 'Erro interno do sistema' };
    }
  },

  async createUser(email: string, name: string, profile: UserProfile): Promise<{ error: string | null }> {
    try {
      // Usar signUp para todos os usuários para garantir compatibilidade
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: 'nb@123',
        options: {
          data: {
            name: name,
            profile: profile
          }
        }
      });

      if (authError || !authData.user) {
        return { error: authError?.message || 'Erro ao criar usuário' };
      }

      // Aguardar um pouco para garantir que o usuário foi criado
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Criar perfil do usuário na tabela users
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: authData.user.id,
          email,
          name,
          profile,
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        console.error('Erro ao criar perfil:', profileError);
        return { error: 'Erro ao criar perfil do usuário' };
      }

      return { error: null };
    } catch (error) {
      console.error('Erro na criação do usuário:', error);
      return { error: 'Erro interno do sistema' };
    }
  },

  async createFirstAdmin(email: string, name: string, password: string): Promise<{ error: string | null }> {
    try {
      // Verificar se já existe admin
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('profile', 'admin');
        
      if (count && count > 0) {
        return { error: 'Já existe um administrador no sistema' };
      }

      // Criar usuário com signUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            profile: 'admin'
          }
        }
      });

      if (authError || !authData.user) {
        return { error: authError?.message || 'Erro ao criar usuário' };
      }

      // Aguardar para garantir que o usuário foi criado
      await new Promise(resolve => setTimeout(resolve, 1000));

      return { error: null };
    } catch (error) {
      console.error('Erro na criação do admin:', error);
      return { error: 'Erro interno do sistema' };
    }
  },

};
