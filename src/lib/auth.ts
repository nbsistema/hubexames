import { supabase, UserProfile, AppUser } from './supabase';
import { databaseService } from './database';

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
      
      // Múltiplas tentativas de login com intervalos
      let loginAttempts = 0;
      const maxAttempts = 3;
      
      while (loginAttempts < maxAttempts) {
        loginAttempts++;
        console.log(`🔐 Tentativa de login ${loginAttempts}/${maxAttempts}...`);
        
        if (loginAttempts > 1) {
          // Aguardar entre tentativas
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (authError) {
          console.warn(`⚠️ Tentativa ${loginAttempts} falhou:`, authError.message);
          
          // Se não é a última tentativa, continuar
          if (loginAttempts < maxAttempts) {
            continue;
          }
          
          // Última tentativa falhou, retornar erro
          let errorMessage = 'Erro de autenticação';
          if (authError.message?.includes('Invalid login credentials') || authError.message?.includes('invalid_credentials')) {
            errorMessage = 'Email ou senha incorretos. Se você acabou de criar o usuário, recarregue a página e tente novamente.';
          } else if (authError.message?.includes('Email not confirmed')) {
            errorMessage = 'Email não confirmado. Aguarde alguns minutos e tente novamente.';
          } else if (authError.message?.includes('Too many requests')) {
            errorMessage = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
          } else {
            errorMessage = authError.message || 'Erro desconhecido';
          }
          
          return { user: null, error: errorMessage };
        }

        if (!authData.user) {
          console.warn(`⚠️ Tentativa ${loginAttempts}: Usuário não encontrado`);
          if (loginAttempts < maxAttempts) {
            continue;
          }
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
          console.warn('⚠️ Erro ao buscar dados do usuário:', userError.code);
          
          // Se o usuário não existe na tabela users, mas existe na auth
          if (userError.code === 'PGRST116') {
            // Tentar criar o perfil automaticamente
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
            
            // Retornar usuário básico mesmo sem perfil na tabela
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
          
          // Outros erros - continuar tentando se não for a última tentativa
          if (loginAttempts < maxAttempts) {
            continue;
          }
          
          return { user: null, error: 'Erro ao buscar dados do usuário' };
        }

        if (!userData) {
          console.warn(`⚠️ Tentativa ${loginAttempts}: Dados do usuário não encontrados`);
          if (loginAttempts < maxAttempts) {
            continue;
          }
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
      }
      
      // Se chegou até aqui, todas as tentativas falharam
      return { user: null, error: 'Não foi possível fazer login após múltiplas tentativas' };
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
        let { data: userData, error: userError } = await supabase
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
      
      // Primeiro, garantir que as tabelas existem
      console.log('🗄️ Verificando/criando tabelas do banco...');
      const tablesCreated = await databaseService.ensureTablesExist();
      if (!tablesCreated) {
        console.warn('⚠️ Não foi possível criar todas as tabelas, mas continuando...');
      }
      
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
      
      // Nova abordagem: usar Admin API para criar usuário diretamente
      console.log('🔧 Usando nova abordagem para criação do admin...');
      
      // Tentar múltiplas abordagens para criar o usuário
      let authData = null;
      let authError = null;
      
      // Abordagem 1: SignUp normal
      console.log('📝 Tentativa 1: SignUp normal...');
      const signUpResult = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: name,
            profile: 'admin'
          }
        }
      });
      
      if (signUpResult.data?.user && !signUpResult.error) {
        console.log('✅ SignUp normal funcionou');
        authData = signUpResult.data;
        authError = null;
      } else if (signUpResult.error?.message?.includes('User already registered')) {
        console.log('ℹ️ Usuário já existe, tentando login direto...');
        
        // Se usuário já existe, tentar login
        const loginResult = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password
        });
        
        if (loginResult.data?.user && !loginResult.error) {
          console.log('✅ Login com usuário existente funcionou');
          await supabase.auth.signOut(); // Logout para não interferir
          return { error: null };
        } else {
          console.log('⚠️ Usuário existe mas login falhou, tentando recriar...');
          authError = signUpResult.error;
        }
      } else {
        console.log('⚠️ SignUp normal falhou:', signUpResult.error?.message);
        authError = signUpResult.error;
      }
      
      // Se chegou até aqui e não tem authData, houve erro
      if (!authData?.user) {
        console.error('❌ Não foi possível criar o usuário admin');
        return { 
          error: authError?.message || 'Erro desconhecido ao criar administrador' 
        };
      }
      
      console.log('✅ Usuário admin criado com sucesso');
      
      // Aguardar para garantir que o usuário foi processado
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Tentar criar perfil na tabela users (opcional)
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
          console.warn('⚠️ Não foi possível criar perfil na tabela users (normal na primeira execução)');
        } else {
          console.log('✅ Perfil criado na tabela users');
        }
      } catch (tableError) {
        console.warn('⚠️ Tabela users não existe ainda (normal na primeira execução)');
      }
      
      return { error: null };
    } catch (error) {
      console.error('❌ Erro interno na criação do admin:', error);
      return { error: 'Erro interno do sistema' };
    }
  },
};