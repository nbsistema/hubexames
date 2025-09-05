import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { debugAuth } from './lib/debug';

// Disponibilizar debug tools globalmente em desenvolvimento
if (import.meta.env.DEV) {
  (window as any).debugAuth = debugAuth;
  console.log('🔧 Debug tools disponíveis: window.debugAuth');
  console.log('📋 Comandos disponíveis:');
  console.log('- debugAuth.testConnection() - Testa conexão com Supabase');
  console.log('- debugAuth.testLogin(email, password) - Testa login específico');
  console.log('- debugAuth.inspectNetworkRequests() - Monitora requisições de rede');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
