// ════════════════════════════════════════════════════════════════════
// SEM IMPORT ESTÁTICO DO SDK — §1.1 do doc de otimização.
//
// O `import { createClient } from '@supabase/supabase-js'` que ficava aqui
// prendia 48 KB gzipped (186 KB descomprimidos, que ainda precisam ser
// parseados e executados) ao chunk de ENTRADA, por uma cadeia estática:
//
//   main.jsx → AuthProvider → services/customer-auth → services/supabase-browser
//
// O `dist/index.html` ainda o declarava como `modulepreload`, ou seja, ele
// competia em prioridade de rede com o que a tela precisa para pintar. E o uso
// real do cliente, varrido em todo o `src/`, é SÓ `supabase.auth.*`: zero
// `.from()`, zero `.storage`, zero `.channel()`, zero `.functions`. Mesmo
// assim o chunk carregava realtime-js + phoenix (websockets), storage-js
// (que arrasta o iceberg-js, um cliente do Apache Iceberg REST Catalog),
// postgrest-js e functions-js — para quem só quer ver um banner na home.
//
// `fetchCustomerSession()`, a única chamada do boot do AuthProvider, usa
// `apiRequest` e não o SDK. Nenhuma visita precisa dele antes de alguém clicar
// em "Entrar com Google" ou abrir um link de recuperação de senha.
//
// As duas funções de URL abaixo NÃO mudaram: só usam `URL` e
// `constants/routes`, são minúsculas, e continuam síncronas.
// ════════════════════════════════════════════════════════════════════
import { CUSTOMER_RESET_PASSWORD_PATH, sanitizeRedirectPath } from '../constants/routes';

let clientPromise = null;

function getSupabaseBrowserConfig() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

/**
 * Cliente do Supabase para o navegador. ASSÍNCRONA: o SDK só é baixado
 * quando alguém realmente entra num fluxo de auth.
 *
 * ⚠️ Memoiza a PROMESSA, não só o cliente. Duas chamadas concorrentes — o
 * efeito do `ResetPasswordPage` e um clique em "Entrar com Google", por
 * exemplo — não podem baixar o chunk duas vezes nem, pior, criar DOIS
 * clientes com `code_verifier` de PKCE gravado em estados separados.
 *
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient|null>}
 *          `null` quando as variáveis do Supabase não estão configuradas.
 */
export async function getSupabaseBrowserClient() {
  const config = getSupabaseBrowserConfig();
  if (!config) {
    return null;
  }

  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      }),
    );
  }

  return clientPromise;
}

export function buildPasswordResetRedirectUrl(postResetRedirect = '/checkout') {
  if (!globalThis.window) {
    throw new Error('Recuperacao de senha disponivel apenas no navegador.');
  }

  const safeRedirect = postResetRedirect === '/downloads' ? '/downloads' : '/checkout';
  const url = new URL(CUSTOMER_RESET_PASSWORD_PATH, globalThis.window.location.origin);
  url.searchParams.set('redirect', safeRedirect);

  return url.toString();
}

export function buildOAuthRedirectUrl(postLoginRedirect = '/checkout') {
  if (!globalThis.window) {
    throw new Error('Login com Google disponivel apenas no navegador.');
  }

  // Defesa em profundidade: o parâmetro atravessa o Google e volta em /login,
  // que é quem chama navigate(). Sanitizar aqui também impede que um destino
  // absoluto sobreviva à ida e volta do OAuth.
  const safeRedirect = sanitizeRedirectPath(postLoginRedirect);
  const url = new URL('/login', globalThis.window.location.origin);
  url.searchParams.set('oauth', 'google');
  url.searchParams.set('redirect', safeRedirect);
  return url.toString();
}
