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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      return { error: error?.message || null };
    } catch {
      return { error: 'Erro interno do sistema' };
    }
  },

  async createUser(email: string, name: string, profile: UserProfile): Promise<{ error: string | null }> {
    try {
      // Para admin inicial, usar signUp normal, para outros usar admin.createUser
      let authData, authError;
      
      if (profile === 'admin') {
        // Verificar se é o primeiro admin
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact' })
          .eq('profile', 'admin');
          
        if (count === 0) {
          // Primeiro admin - usar signUp
          const result = await supabase.auth.signUp({
            email,
            password: 'nb@123',
          });
          authData = result.data;
          authError = result.error;
        } else {
          // Admin subsequente - usar admin.createUser
          const result = await supabase.auth.admin.createUser({
            email,
            password: 'nb@123',
            email_confirm: true,
          });
          authData = result.data;
          authError = result.error;
        }
      } else {
        // Outros perfis - usar admin.createUser
        const result = await supabase.auth.admin.createUser({
          email,
          password: 'nb@123',
          email_confirm: true,
        });
        authData = result.data;
        authError = result.error;
      }

      if (authError || !authData.user) {
        return { error: authError?.message || 'Erro ao criar usuário' };
      }

      // Create user profile
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          name,
          profile,
        });

      if (profileError) {
        return { error: profileError.message };
      }

      return { error: null };
    } catch {
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
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            name: name,
            profile: 'admin'
          }
        }
      });

      if (authError || !authData.user) {
        return { error: authError?.message || 'Erro ao criar usuário' };
      }

      // Aguardar um pouco para garantir que o trigger foi executado
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verificar se o usuário foi criado corretamente
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (userError || !userData) {
        return { error: 'Usuário criado mas perfil não foi configurado corretamente' };
      }

      return { error: null };
    } catch {
      return { error: 'Erro interno do sistema' };
    }
  },
};
