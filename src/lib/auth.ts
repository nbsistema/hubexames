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
      
      // Aguardar um pouco antes de tentar login (para casos de usuário recém-criado)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
          errorMessage = 'Email ou senha incorretos. Se você acabou de criar o usuário, aguarde alguns segundos e tente novamente.';
        } else if (authError.message?.includes('Email not confirmed')) {
          errorMessage = 'Email não confirmado. Verifique sua caixa de entrada ou aguarde alguns minutos.';
        } else if (authError.message?.includes('Too many requests')) {
          errorMessage = 'Muitas tentativas. Tente novamente em alguns minutos';
        } else if (authError.status === 400) {
          errorMessage = 'Dados de login inválidos. Verifique email e senha.';
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

      // Aguardar um pouco antes de buscar dados do usuário
      await new Promise(resolve => setTimeout(resolve, 1000));

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
          // Tentar criar o perfil automaticamente para admin
          console.log('ℹ️ Perfil não encontrado, tentando criar automaticamente...');
          try {
            const { error: createError } = await supabase
              .from('users')
              .insert({
                id: authData.user.id,
                email: normalizedEmail,
                name: authData.user.user_metadata?.name || 'Administrador',
                profile: 'admin',
              });
              
            if (!createError) {
              console.log('✅ Perfil criado automaticamente');
              return {
                user: {
                  id: authData.user.id,
                  email: normalizedEmail,
                  name: authData.user.user_metadata?.name || 'Administrador',
                  profile: 'admin',
                },
                error: null,
              };
            }
          } catch (createError) {
            console.warn('⚠️ Não foi possível criar perfil automaticamente');
          }
          
          return { user: null, error: 'Perfil de usuário não encontrado. As tabelas podem não ter sido criadas ainda.' };
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

      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        if (userError) {
          // Tratar erro 409 (Conflict) especificamente
          if (userError.code === '409' || userError.message?.includes('409')) {
            console.warn('⚠️ Conflito detectado, aguardando sincronização...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Tentar novamente após aguardar
            const { data: retryData, error: retryError } = await supabase
              .from('users')
              .select('*')
              .eq('id', user.id)
              .single();
              
            if (retryError) {
              console.warn('⚠️ Ainda há conflito após retry:', retryError);
              return null;
            }
            
            userData = retryData;
          }
          // Se a tabela não existe ou há problemas de estrutura, não logar como erro crítico
          else if (userError.code === '42P01' || userError.code === '42P17') {
            console.warn('⚠️ Tabela users não existe ainda. Isso é normal na primeira execução.');
            return null;
          } else if (userError.code === 'PGRST116') {
            console.info('ℹ️ Perfil não encontrado para usuário logado');
            return null;
          } else {
            console.error('❌ Erro ao buscar dados do usuário:', userError);
            return null;
          }
        }
        
        if (!userData) {
          console.info('ℹ️ Dados do usuário não encontrados');
          return null;
        }
      } catch (tableError) {
        console.warn('⚠️ Tabela users ainda não está disponível. Isso é normal na primeira execução.');
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
      
      console.log('ℹ️ Prosseguindo com criação do admin (primeira execução)');

      // Primeiro, verificar se o usuário já existe
      try {
        const { data: existingUser } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password
        });
        
        if (existingUser.user) {
          console.log('ℹ️ Usuário já existe e pode fazer login');
          return { error: null };
        }
      } catch (error) {
        console.log('ℹ️ Usuário não existe ainda, prosseguindo com criação');
      }

      // Criar usuário com signUp e confirmação automática
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: undefined, // Desabilitar redirecionamento
          data: {
            name: name,
            profile: 'admin'
          },
          // Tentar confirmar automaticamente
          captchaToken: undefined
        }
      });

      if (authError) {
        console.error('❌ Erro ao criar admin na auth:', authError);
        console.error('❌ Código do erro:', authError.status);
        console.error('❌ Detalhes completos:', authError);
        
        let errorMessage = 'Erro ao criar administrador';
        if (authError.message?.includes('User already registered') || authError.message?.includes('already_registered')) {
          // Se já existe, tentar fazer login para verificar se funciona
          console.log('ℹ️ Usuário já existe, verificando se pode fazer login...');
          try {
            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
              email: normalizedEmail,
              password: password
            });
            
            if (loginData.user && !loginError) {
              console.log('✅ Usuário já existe e pode fazer login');
              return { error: null };
            } else {
              return { error: 'Usuário já existe mas não consegue fazer login. Verifique a senha.' };
            }
          } catch (loginError) {
            return { error: 'Usuário já existe mas há problema com as credenciais' };
          }
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

      // Aguardar mais tempo para garantir que o usuário foi criado
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Tentar criar perfil manualmente (a tabela pode não existir ainda)
      try {
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: normalizedEmail,
            name,
            profile: 'admin',
          });

        if (profileError) {
          console.warn('⚠️ Não foi possível criar perfil na tabela users:', profileError.message);
          console.log('ℹ️ Isso é normal se as tabelas ainda não foram criadas');
        } else {
          console.log('✅ Perfil criado na tabela users');
        }
      } catch (tableError) {
        console.warn('⚠️ Tabela users não existe ainda, mas o usuário foi criado na auth');
      }

      // Verificar se o usuário pode fazer login imediatamente
      console.log('🔍 Testando login imediato...');
      try {
        const { data: testLogin, error: testError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password
        });
        
        if (testLogin.user && !testError) {
          console.log('✅ Login teste bem-sucedido');
          // Fazer logout do teste
          await supabase.auth.signOut();
        } else {
          console.warn('⚠️ Login teste falhou:', testError?.message);
        }
      } catch (testError) {
        console.warn('⚠️ Não foi possível testar login:', testError);
      }
      console.log('✅ Primeiro administrador criado com sucesso');
      return { error: null };
    } catch (error) {
      console.error('❌ Erro interno na criação do admin:', error);
      return { error: 'Erro interno do sistema' };
    }
  },
};