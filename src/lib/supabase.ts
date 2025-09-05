import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('❌ Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // Desabilitar para evitar conflitos
    flowType: 'pkce'
  },
});

// 🚀 DEBUG: loga a URL e chave usada (apenas no dev, remova em produção)
if (import.meta.env.DEV) {
  console.log('🔗 Supabase URL:', supabaseUrl);
  console.log('🔑 Supabase anon key (início):', supabaseAnonKey.slice(0, 8));
}

// Tipos auxiliares
export type UserProfile = 'admin' | 'parceiro' | 'checkup' | 'recepcao';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  profile: UserProfile;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  name: string;
  company_type: string;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: string;
  name: string;
  created_at: string;
}

export interface Doctor {
  id: string;
  name: string;
  crm: string;
  partner_id: string;
  created_at: string;
}

export interface Insurance {
  id: string;
  name: string;
  partner_id: string;
  created_at: string;
}

export interface ExamRequest {
  id: string;
  patient_name: string;
  birth_date: string;
  consultation_date: string;
  doctor_id: string;
  exam_type: string;
  status: 'encaminhado' | 'executado' | 'intervencao';
  payment_type: 'particular' | 'convenio';
  insurance_id?: string;
  partner_id: string;
  observations: string;
  created_at: string;
  updated_at: string;
}

export interface Battery {
  id: string;
  name: string;
  exams: string[];
  created_at: string;
}

export interface CheckupRequest {
  id: string;
  patient_name: string;
  birth_date: string;
  battery_id: string;
  requesting_company: string;
  exams_to_perform: string[];
  unit_id?: string;
  observations: string;
  status: 'solicitado' | 'encaminhado' | 'executado';
  created_at: string;
  updated_at: string;
}