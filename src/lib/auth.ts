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
      console.log('🔐 Tentando fazer login com:', email.trim().toLowerCase());
      
      // Validar entrada
      if (!email || !password) {
        return { user: null, error: 'Email e senha são obrigatórios' };
      }
      
      const normalizedEmail = email.trim().toLowerCase();
      
      // Validar formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return { user: null, error: 'Formato de email inválido' };
      }
      
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) {
        console.error('❌ Erro de autenticação:', authError.message);
        console.error('❌ Código do erro:', authError.status);
        console.error('❌ Detalhes completos:', authError);
        
        // Mapear erros específicos do Supabase para mensagens mais claras
        let errorMessage = 'Erro de autenticação';
        if (authError.message?.includes('Invalid login credentials') || authError.message?.includes('invalid_credentials')) {
          errorMessage = 'Email ou senha incorretos';
        } else if (authError.message?.includes('Email not confirmed')) {
          errorMessage = 'Email não confirmado';
        } else if (authError.message?.includes('Too many requests')) {
          errorMessage = 'Muitas tentativas. Tente novamente em alguns minutos';
        } else if (authError.status === 400) {
          errorMessage = 'Dados de login inválidos';
        } else if (authError.status === 500) {
          errorMessage = 'Erro interno do servidor. Tente novamente';
        } else {
          errorMessage = authError.message || 'Erro desconhecido';
        }
        
        return { user: null, error: errorMessage };
      }

      if (!authData.user) {
        console.error('❌ Usuário não encontrado após login');
        return { user: null, error: 'Usuário não encontrado' };
      }

      console.log('✅ Login realizado com sucesso, buscando dados do usuário...');

      // Buscar dados do usuário na tabela users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (userError) {
        console.error('❌ Erro ao buscar dados do usuário:', userError);
        console.error('❌ Código do erro:', userError.code);
        console.error('❌ Detalhes:', userError.details);
        
        // Se o usuário não existe na tabela users, mas existe na auth
        if (userError.code === 'PGRST116') {
          return { user: null, error: 'Perfil de usuário não encontrado. Entre em contato com o administrador.' };
        }
        
        return { user: null, error: 'Erro ao buscar dados do usuário' };
      }

      if (!userData) {
        console.error('❌ Dados do usuário não encontrados');
        return { user: null, error: 'Dados do usuário não encontrados' };
      }

      console.log('✅ Dados do usuário encontrados:', userData);

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
      console.error('❌ Erro interno no login:', error);
      return { user: null, error: 'Erro interno do sistema' };
    }
  },

  async signOut(): Promise<void> {
    try {
      console.log('🚪 Fazendo logout...');
      await supabase.auth.signOut();
      console.log('✅ Logout realizado com sucesso');
    } catch (error) {
      console.error('❌ Erro no logout:', error);
    }
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      console.log('👤 Verificando usuário atual...');
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        if (authError.message === 'Auth session missing!') {
          console.info('ℹ️ Nenhuma sessão ativa encontrada');
        } else {
          console.error('❌ Erro ao verificar usuário:', authError);
        }
        return null;
      }
      
      if (!user) {
        console.log('ℹ️ Nenhum usuário logado');
        return null;
      }

      console.log('✅ Usuário autenticado encontrado, buscando dados...');

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        console.error('❌ Erro ao buscar dados do usuário:', userError);
        return null;
      }

      console.log('✅ Dados do usuário carregados:', userData);

      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        profile: userData.profile,
      };
    } catch (error) {
      console.error('❌ Erro interno ao verificar usuário:', error);
      return null;
    }
  },

  async resetPassword(email: string): Promise<{ error: string | null }> {
    try {
      console.log('🔄 Enviando email de reset para:', email);
      
      const redirectUrl = window.location.origin + '/reset-password';
      
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.error('❌ Erro ao enviar email de reset:', error);
        return { error: error.message };
      }

      console.log('✅ Email de reset enviado com sucesso');
      return { error: null };
    } catch (error) {
      console.error('❌ Erro interno no reset de senha:', error);
      return { error: 'Erro interno do sistema' };
    }
  },

  async createUser(email: string, name: string, profile: UserProfile): Promise<{ error: string | null }> {
    try {
      console.log('👥 Criando usuário:', { email, name, profile });
      
      // Normalizar email
      const normalizedEmail = email.trim().toLowerCase();
      
      // Primeiro, criar o usuário na autenticação
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: 'nb@123',
        options: {
          emailRedirectTo: `${window.location.origin}/reset-password`,
          data: {
            name: name,
            profile: profile
          },
          // Desabilitar confirmação de email
          emailRedirectTo: undefined
        }
      });

      if (authError) {
        console.error('❌ Erro ao criar usuário na auth:', authError);
        
        let errorMessage = 'Erro ao criar usuário';
        if (authError.message.includes('User already registered')) {
          errorMessage = 'Este email já está cadastrado no sistema';
        } else {
          errorMessage = authError.message;
        }
        
        return { error: errorMessage };
      }

      if (!authData.user) {
        console.error('❌ Usuário não foi criado');
        return { error: 'Erro ao criar usuário' };
      }

      console.log('✅ Usuário criado na auth, criando perfil...');

      // Aguardar para garantir que o usuário foi criado
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Criar perfil do usuário na tabela users
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: normalizedEmail,
          name,
          profile,
        });

      if (profileError) {
        console.error('❌ Erro ao criar perfil:', profileError);
        
        // Se o perfil já existe, tentar atualizar
        if (profileError.code === '23505') { // Unique violation
          console.log('ℹ️ Perfil já existe, tentando atualizar...');
          const { error: updateError } = await supabase
            .from('users')
            .update({
              email: normalizedEmail,
              name,
              profile,
            })
            .eq('id', authData.user.id);
            
          if (updateError) {
            console.error('❌ Erro ao atualizar perfil:', updateError);
            return { error: 'Erro ao criar perfil do usuário' };
          }
        } else {
          return { error: 'Erro ao criar perfil do usuário' };
        }
      }

      console.log('✅ Usuário criado com sucesso');
      return { error: null };
    } catch (error) {
      console.error('❌ Erro interno na criação do usuário:', error);
      return { error: 'Erro interno do sistema' };
    }
  },

  async createFirstAdmin(email: string, name: string, password: string): Promise<{ error: string | null }> {
    try {
      console.log('👑 Criando primeiro administrador:', { email, name });
      
      // Normalizar email
      const normalizedEmail = email.trim().toLowerCase();
      
      // Validar entrada
      if (!normalizedEmail || !name.trim() || !password) {
        return { error: 'Todos os campos são obrigatórios' };
      }
      
      // Validar formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return { error: 'Formato de email inválido' };
      }
      
      // Validar senha
      if (password.length < 6) {
        return { error: 'A senha deve ter pelo menos 6 caracteres' };
      }
      
      // Verificar se já existe admin
      const { count, error: countError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('profile', 'admin');
        
      if (countError) {
        console.error('❌ Erro ao verificar admins existentes:', countError);
        console.error('❌ Código do erro:', countError.code);
        console.error('❌ Detalhes:', countError.details);
        return { error: 'Erro ao verificar sistema' };
      }
        
      if (count && count > 0) {
        console.log('ℹ️ Já existe administrador no sistema');
        return { error: 'Já existe um administrador no sistema' };
      }

      // Criar usuário com signUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: name,
            profile: 'admin'
          }
        }
      });

      if (authError) {
        console.error('❌ Erro ao criar admin na auth:', authError);
        console.error('❌ Código do erro:', authError.status);
        console.error('❌ Detalhes completos:', authError);
        
        let errorMessage = 'Erro ao criar administrador';
        if (authError.message?.includes('User already registered') || authError.message?.includes('already_registered')) {
          errorMessage = 'Este email já está cadastrado no sistema';
        } else if (authError.message?.includes('Password should be at least')) {
          errorMessage = 'A senha deve ter pelo menos 6 caracteres';
        } else if (authError.status === 400) {
          errorMessage = 'Dados inválidos para criação do usuário';
        } else if (authError.status === 500) {
          errorMessage = 'Erro interno do servidor. Tente novamente';
        } else {
          errorMessage = authError.message || 'Erro desconhecido';
        }
        
        return { error: errorMessage };
      }

      if (!authData.user) {
        console.error('❌ Admin não foi criado');
        return { error: 'Erro ao criar administrador' };
      }

      console.log('✅ Admin criado na auth, criando perfil...');

      // Aguardar para garantir que o usuário foi criado no auth
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Criar perfil do admin na tabela users
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: normalizedEmail,
          name,
          profile: 'admin',
        });

      if (profileError) {
        console.error('❌ Erro ao criar perfil do admin:', profileError);
        console.error('❌ Código do erro:', profileError.code);
        console.error('❌ Detalhes:', profileError.details);
        
        // Se o perfil já existe, tentar atualizar
        if (profileError.code === '23505') { // Unique violation
          console.log('ℹ️ Perfil já existe, tentando atualizar...');
          const { error: updateError } = await supabase
            .from('users')
            .update({
              email: normalizedEmail,
              name,
              profile: 'admin',
            })
            .eq('id', authData.user.id);
            
          if (updateError) {
            console.error('❌ Erro ao atualizar perfil:', updateError);
            return { error: 'Erro ao criar perfil do administrador' };
          }
        } else {
          return { error: 'Erro ao criar perfil do administrador' };
        }
      }

      console.log('✅ Primeiro administrador criado com sucesso');
      return { error: null };
    } catch (error) {
      console.error('❌ Erro interno na criação do admin:', error);
      return { error: 'Erro interno do sistema' };
    }
  },
};