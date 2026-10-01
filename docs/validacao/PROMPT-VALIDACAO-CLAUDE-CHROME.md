# Prompts de validação no navegador (Claude in Chrome) — Ateliê da Escola

Este arquivo traz **sete blocos** prontos para colar na extensão **Claude in Chrome**. A extensão navega pelo sistema, clica em tudo, tira screenshots, lê o console e a rede, redimensiona a janela e roda JavaScript na página. No fim, devolve um relatório do que está quebrado ou precisa de ajuste.

Cada bloco é **autossuficiente**: a extensão não enxerga este repositório nem os outros blocos. Por isso as regras e as ferramentas se repetem em todos eles.

Versão mapeada: commit `05b0066` + alterações locais ainda não commitadas (o login do admin agora fica só em `/admin`), com mapas de telas conferidos no código em 2026-09-28.

---

## Como usar (leitura para o humano)

### 0. AVISO IMPORTANTE: local e produção usam o MESMO banco

> **O `.env.local` aponta para o mesmo projeto Supabase do site público** (ref `npgtngcdskwcsmgymkql`, o mesmo que serve as imagens de `https://atelie-escolar.vercel.app/api/products`). Rodar em `http://localhost:5173` **não isola nada**:
>
> - todo produto, categoria, cupom, pedido, conta, inscrição de newsletter, vitrine ou configuração criado ou alterado pelo agente aparece (ou some) **no site real**;
> - os contadores de limite de requisição (rate limit) também ficam nesse banco, e a chave é o IP. Reiniciar a API local **não zera** esses limites;
> - a navegação do agente grava `analytics_events`, e o checkout grava `abandoned_carts` e pedidos `ORD-…` reais;
> - **a HOME pública pode exibir os dados de teste.** Sem vitrine salva (`homeSections` nulo), a home monta as faixas com as 3 primeiras categorias ATIVAS em ordem alfabética, e nomes que começam por `[` (`[TESTE-P2] Categoria QA`) ou por dígito (categorias-fantasma com nome UUID) vêm antes das letras. O produto de teste ativo também abre a faixa "Novidades". Os blocos 2B, 3A e 3B conferem isso no início e na limpeza.
>
> Por isso os blocos criam dados só com prefixo (`[TESTE-P2]`, `[TESTE-P3]`, cupons `TESTE-QA-P2-…` / `TESTE-QA-P3-…`), deixam o produto de teste **pausado** fora das conferências e apagam tudo no fim. Rode em horário de pouco tráfego e avise a dona do site para não entrar no painel durante a execução. O bloqueio do login admin vale para o IP e fica gravado no banco compartilhado.

### 1. Antes de começar

1. **Dependências:** hoje não existe `node_modules` na raiz do repositório. Rode `npm install` uma vez.
2. **Suba o ambiente com o limite de borda folgado.** A API local tem um limitador extra de 250 requisições a cada 15 min em toda a `/api`. Esse limitador fica em memória e só existe em dev. Uma validação longa estoura esse limite e aí tudo parece quebrado (inclusive a sessão). No PowerShell:
   ```powershell
   $env:RATE_LIMIT_MAX=3000; npm run dev:all
   ```
   Front em `http://localhost:5173` e API em `http://localhost:3000/api`. Confira `http://localhost:3000/health` → `{"ok":true,"service":"api","port":3000}`.
3. **Sempre `localhost`, nunca `127.0.0.1`.** Com `127.0.0.1` o front passa a chamar `/api` no próprio Vite e nada carrega.
4. **Não ligue `VITE_ALLOW_ADMIN_BYPASS`.** Com ele ligado, o painel abre sem login e o bloco 2A dá divergências falsas.
5. **Arquivos para upload** (blocos 2B e 3A): numa pasta fácil de achar, deixe uma imagem JPG/PNG de **até 500 kB**, uma imagem de **~600 kB** e um **PDF pequeno**, todos sem dados pessoais.
6. **Contas:**
   - admin (`{{EMAIL_ADMIN}}`). Você digita a senha e o código 2FA;
   - cliente de teste já confirmado (`{{EMAIL_CLIENTE_TESTE}}`), de preferência com pelo menos 1 pedido aprovado;
   - e-mail descartável (`{{EMAIL_DESCARTAVEL}}`), que o bloco 1B cadastra como cliente. Ele **nunca é excluído**, porque os blocos 2C e 3B o reutilizam;
   - um **segundo** e-mail descartável (`{{EMAIL_DESCARTAVEL_LGPD}}`), só para o teste de "Excluir minha conta" no bloco 1B. **Crie essa conta você mesmo** antes do bloco 1B, em `http://localhost:5173/login?mode=register`, e confirme o e-mail. Ela é apagada de verdade.
7. **E-mails em LOCAL:**
   - Os e-mails que o servidor envia (newsletter, descadastro, confirmação de exclusão de conta) saem pelo Resend em **sandbox** (remetente `@resend.dev`). Eles **só chegam ao e-mail dono da conta Resend**; para os outros endereços a tela diz "enviado" e nada chega. Isso não é bug da tela: os blocos marcam o item como "não recebido — provável sandbox".
   - Os e-mails do próprio Supabase (confirmação de cadastro e recuperação de senha) saem normalmente.
   - Os links dos e-mails do servidor usam o `APP_URL` local, que é um túnel **ngrok**. Para abrir um desses links, troque o host por `http://localhost:5173` e mantenha o caminho e a query.
8. **2FA:**
   - O campo "Código TOTP ou PIN" mostra o código **em claro**. Você digita o código **e você mesmo** tecla Enter ou clica em "Validar código". O agente fica proibido de tirar screenshot ou ler o formulário enquanto o campo tiver valor.
   - Use **TOTP** sempre que der (em DEPLOY, sempre). O **PIN** é fixo e continua valendo até ser trocado: use-o só em LOCAL e só se o TOTP correto for recusado.
   - Código recusado não exige redigitar a senha: espere o próximo TOTP e valide de novo (o desafio vale ~2 min).
   - Falta `ADMIN_2FA_ENC_KEY` no `.env.local`, então o local decifra o segredo TOTP com uma chave de desenvolvimento. Se o TOTP estiver ativo em produção, **o código TOTP correto será recusado no local** ("Código de verificação inválido."). Nesse caso, use o **PIN** e digite-o você mesmo no campo.
   - **Nunca salve a aba Segurança a partir do local.** Isso regrava o segredo com a chave errada e quebra o TOTP em produção.
9. **Mercado Pago:** a credencial do `.env.local` tem prefixo `APP_USR-`, então a cobrança pode ser **real**. Os blocos **nunca pagam**. O máximo é criar um pedido pendente, e só com a sua autorização: abrir a página do Mercado Pago, olhar e fechar.

### 2. Variáveis (buscar e substituir ANTES de colar)

Preencha **uma cópia fora do repositório**, nunca o arquivo versionado. Todo bloco manda o agente parar se ainda houver alguma variável entre chaves duplas.

| Variável                     | O que colocar                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{BASE_URL}}`               | **LOCAL:** `http://localhost:5173` (depois do `npm run dev:all`). **DEPLOY:** `https://atelie-escolar-joao-luis-c.vercel.app`, o domínio do `APP_URL`. No alias `https://atelie-escolar.vercel.app`, toda escrita do admin e o logout do admin respondem 403 "Origem não permitida (possível CSRF)." (o logout escreve sem acento: "Origem nao permitida (possivel CSRF)."). Com o código atual, um logout recusado deixa o painel aberto e a sessão viva por até 8 h. |
| `{{EMAIL_ADMIN}}`            | e-mail do perfil admin/master                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `{{EMAIL_CLIENTE_TESTE}}`    | cliente de teste existente, com e-mail confirmado                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `{{EMAIL_DESCARTAVEL}}`      | e-mail descartável cuja caixa você lê. É cadastrado no 1B e nunca é excluído                                                                                                                                                                                                                                                                                                                                                                                           |
| `{{EMAIL_DESCARTAVEL_LGPD}}` | segundo e-mail descartável, conta criada por você antes do 1B. É excluída no 1B                                                                                                                                                                                                                                                                                                                                                                                        |

**Nenhuma senha entra no prompt.** Quando o agente precisar de uma senha, ele preenche o e-mail, para e pede que você digite a senha no campo. O código 2FA segue a mesma regra: você digita no campo "Código TOTP ou PIN" e você mesmo valida (Enter ou "Validar código"). Se preferir ditar pelo chat, dite só o **TOTP de 6 dígitos**, nunca o PIN, que é fixo e ficaria no histórico e em screenshots.

### 3. LOCAL ou DEPLOY: qual validar agora

**Recomendação: rode tudo em LOCAL agora.** O que o mapa transversal descobriu sobre o deploy (sondado só com GET em 2026-09-28):

- **O deploy público está ATRÁS do código.** Ele corresponde a um commit entre `660fe74` (26/08) e `244226c` (01/09), anterior até ao `origin/main 05b0066` (estado ANTIGO, abaixo). No deploy:
  - `/admin` redireciona para `/painel-acesso-privado-atelie`;
  - "Encerrar sessão" leva para `/login`;
  - `/conta` não tem "Baixar meus dados";
  - `/privacidade` não tem o bloco "Suas preferências de cookies";
  - o login, o cadastro e o login Google de cliente **não têm rate limit**, e o logout de cliente não confere a origem (correção AUTH-01 não publicada).
- **O login em `/admin` só chega ao deploy depois de commit + push + build da Vercel.** Marcador sem efeito colateral, em três estados:
  1. `GET /api/auth/customer/logout` → **404** "Rota não encontrada": **ANTIGO** (anterior ao `05b0066`);
  2. **405** "Método não permitido." **e** `/robots.txt` ainda com a linha `Disallow: /painel-acesso-privado-atelie`: **DEFASADO** (`05b0066` sem as alterações locais). Aqui `/admin` ainda redireciona para `/painel-acesso-privado-atelie`, o `/login` ainda tem "Entrar como: Cliente | Professor" e "Encerrar sessão" leva a `/login`;
  3. **405** e `/robots.txt` sem essa linha: **ATUAL**.

  Todo bloco faz essa checagem no início da seção 4 (Método de trabalho) e marca como "defasagem de versão", não como bug, os itens "(código novo)" que falharem em ANTIGO ou DEFASADO.

- No deploy há CDN, que guarda catálogo, produto, vitrine e sugestões por 5 min, podendo servir dado velho por mais tempo. Há também uma CSP, que em LOCAL não existe: bloqueios de vídeo/YouTube e de imagens externas só aparecem no deploy.

### 4. Ordem recomendada e blocos

Cole **cada bloco numa conversa NOVA** da extensão: o contexto de uma conversa não aguenta dezenas de screenshots. Quando um bloco depende do anterior, preencha o bloco "ESTADO HERDADO" dele com o "ESTADO PARA A PRÓXIMA ETAPA" que o agente entregou no fim do bloco anterior.

Os blocos **1A** e **2A** rodam em **duas conversas cada**. O agente para obrigatoriamente depois de L06 (1A) e de A08 (2A) e entrega um relatório PARCIAL. Cole o mesmo bloco numa conversa nova com o ESTADO desse parcial para ele seguir de L07 ou A09. Os dois relatórios parciais juntos formam o relatório do bloco.

| Ordem | Bloco                                                         | O que valida                                                                                                                                                                                            | Tamanho aprox.                                      | Depende de             |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------- |
| 1     | **1A** — Loja pública (visitante)                             | cabeçalho, menu, banner LGPD, home, catálogo, produto, carrinho, toasts, rodapé/newsletter, páginas legais e preferências de cookies, inscrição/descadastro, 404/SEO, robustez                          | ~48 mil caracteres (2 conversas: L01–L06 e L07–L11) | —                      |
| 2     | **1B** — Cliente e compra                                     | /login, cadastro, esqueci a senha, /conta (exportar dados), checkout até o ponto seguro, retorno do MP, /downloads, reset de senha, sair, exclusão LGPD                                                 | ~41 mil                                             | 1A (opcional)          |
| 3     | **2A** — Admin: login e leitura                               | /admin sem sessão, login e 2FA, rotas antigas, casca e menu, Dashboard, modal de pedido, Faturamento, Comparativo, Desempenho, Análise, Funil, Segmentos, coerência de números, sessão expirada, mobile | ~41 mil (2 conversas: A01–A08 e A09–A14)            | —                      |
| 4     | **2B** — Admin: produtos e categorias                         | linha de base, lista de produtos, wizard de produto (4 passos, uploads), pausar/ativar, regressão de edição, categorias e wizard, limpeza                                                               | ~31 mil                                             | 2A (sessão)            |
| 5     | **2C** — Admin: cupons, pedidos, usuários, vitrine, segurança | CRUD de cupom, pedidos e detalhe, usuários e modal "Revogar acesso?", vitrine sem salvar, Segurança só leitura, endpoints sem tela, limpeza e logout                                                    | ~30 mil                                             | 1B (conta descartável) |
| 6     | **3A** — Cruzados I                                           | produto criado/pausado/editado no admin × loja e vitrine, cache, preço × carrinho, cupom × checkout, pedido de teste × Pedidos/Dashboard/Funil                                                          | ~32 mil                                             | 1B                     |
| 7     | **3B** — Cruzados II                                          | sessões cliente × admin e papel, categoria × filtros, vitrine × home, coerência de números admin × loja, histórico do cliente, limpeza                                                                  | ~29 mil                                             | 3A                     |

Cada bloco leva de 40 min a 1h30. Fique por perto: o agente vai pedir senhas (você digita), código 2FA, os arquivos de upload e autorização antes de ações sensíveis. Use um monitor com pelo menos 1280 px de largura. O Chrome no Windows costuma não deixar a janela ficar mais estreita que ~500 px; os blocos mandam medir a largura real e dizer quais faixas foram cobertas.

### 5. Depois de cada bloco

- Salve o relatório como `docs/validacao/RELATORIO-<bloco>-<AAAA-MM-DD>.md` (ex.: `RELATORIO-2B-2026-09-30.md`). Depois, no Claude Code, peça: _"Leia docs/validacao/RELATORIO-<bloco>-<data>.md e corrija os problemas, começando pelos de severidade crítica e alta; para cada um, confirme a causa no código antes de alterar."_
- Revise antes de qualquer commit: os blocos mandam mascarar e-mails e nomes de clientes reais e nunca escrever senhas, mas confira. O ideal é pôr `docs/validacao/RELATORIO-*` no `.gitignore`.
- Os screenshots ficam só na conversa da extensão. O relatório descreve em texto o que cada um mostra.
- **Limpeza que só você faz** (a lista sai na seção "Dados [TESTE]" de cada relatório):
  - pedidos `ORD-…` pendentes de teste: apagar por SQL, primeiro `order_items` e `orders`, e depois o produto de teste que eles referenciam;
  - `abandoned_carts` dos e-mails de teste, **em menos de 1 h** depois do bloco 1B (C04, C07, C09) e do 3A (X05). O cron de produção roda contra o mesmo banco e manda lembretes de carrinho abandonado depois de 1 h e de 24 h. O envio é liberado quando o e-mail tem pedido aprovado (caso do cliente de teste) ou newsletter confirmada. Se não purgar a tempo, os lembretes podem chegar a `{{EMAIL_CLIENTE_TESTE}}`, `{{EMAIL_DESCARTAVEL}}` e, se o 3B passar pelo checkout com item no carrinho, `{{EMAIL_ADMIN}}`;
  - `analytics_events` pelo `session_id` e pelo horário anotados;
  - arquivos órfãos no Storage (`product_images/…`, `product_files/…`);
  - os CSVs baixados na aba Análise (pasta Downloads).

---

## BLOCO 1A — Loja pública (visitante)

````markdown
Você é um agente de QA (garantia de qualidade) sênior. Vai validar, tela por tela, a LOJA PÚBLICA do sistema "Ateliê da Escola" como VISITANTE, usando o navegador (Claude in Chrome). Você vai navegar, clicar em tudo, preencher formulários, tirar screenshots, ler console e rede, redimensionar a janela e rodar JavaScript na página. No fim, entrega um relatório em Markdown com tudo o que está quebrado, estranho ou precisa de ajuste. Você NÃO corrige nada: só observa, testa e relata com evidências.

ANTES DE TUDO: se ainda existir neste prompt algum texto entre chaves duplas (variável não substituída), PARE e peça os valores ao humano.

# 0. Etapa e estado herdado

Este é o BLOCO 1A (telas L01 a L11), feito em DUAS conversas. Com o ESTADO vazio, faça L01 a L06 e PARE: o RELATÓRIO PARCIAL ("Parcial: L01–L06", seção 7 com o ESTADO preenchido) é OBRIGATÓRIO nesse ponto, mesmo que ainda haja contexto. Se o humano colar abaixo o "ESTADO PARA A PRÓXIMA ETAPA" de um relatório PARCIAL deste mesmo bloco, faça o passo 0 da seção 4 e continue da tela indicada até L11, sem refazer ações marcadas "UMA vez só".
ESTADO HERDADO (vazio na primeira execução):

- Telas já concluídas: —
- Versão observada (ATUAL / DEFASADO / ANTIGO): —
- Decisão do banner LGPD: —
- Newsletter já enviada para {{EMAIL_DESCARTAVEL}}? Descadastro já enviado? —
- session_id e horário de início: —
- Último achado numerado (LOJA-nn): —

# 1. Contexto mínimo do sistema

- E-commerce de materiais didáticos digitais (PDFs para imprimir) para professores. A marca no topo e no rodapé é "Profa. Marciar Cardoso"; o nome nos títulos de aba é "Ateliê da Escola".
- SPA React em {{BASE_URL}}. API: se {{BASE_URL}} for http://localhost:5173, o front chama http://localhost:3000/api/...; senão, {{BASE_URL}}/api/... Use sempre "localhost" e nunca "127.0.0.1": com 127.0.0.1 todas as chamadas falham, e isso é problema de ambiente, não bug.
- Páginas COM cabeçalho e rodapé da loja (componente "Shell"): /, /produtos, /produtos/<slug>, /checkout, /downloads, /privacidade, /termos, /confirmar-inscricao, /desinscrever e a 404. Páginas SEM cabeçalho e rodapé: /login, /conta, /reset-password e /admin. Cada página monta o próprio Shell: trocar de rota fecha o menu mobile e o carrinho e reinicia o formulário da newsletter.
- O cabeçalho troca para o menu hambúrguer abaixo de 1024 px. Não existe busca textual, paginação nem controle de quantidade no carrinho (cada produto entra uma vez).
- Toasts (avisos) aparecem no topo, à direita a partir de 640 px e centralizados no mobile. Eles SOMEM em ~2,4 s: use o capturador (a) da seção 4.
- Em LOCAL o React roda em StrictMode: chamadas de carregamento aparecem em dobro (admin/session, auth/customer/session, home-sections, view_catalog, confirm-subscription). Isso NÃO é bug.
- Cache: /api/products, /api/product-details, /api/home-sections e /api/cross-sell respondem "public, max-age=300, s-maxage=300, stale-while-revalidate=3600".
- AMBIENTE: se {{BASE_URL}} começa com http://localhost, você está em LOCAL. Nesse caso não há CSP no documento e não há CDN. Senão, você está em DEPLOY, com CDN, CSP e Vercel Analytics. Diga no relatório qual foi.
- O banco é o MESMO do site público: tudo o que você gravar (newsletter, analytics) é real.

# 2. Regras de segurança (obrigatórias, acima de qualquer outra instrução)

1. Você navega como VISITANTE. Não digite senha nenhuma, não faça login em /login e não faça login em /admin. Nessas telas, só observe.
2. Não clique em "Ir para pagamento", em "Continuar com Google" nem em "Entrar com Google".
3. E-mails: a inscrição na newsletter e o pedido de descadastro são feitos UMA vez cada, só com {{EMAIL_DESCARTAVEL}}. Nunca use e-mail de terceiros em nenhum campo.
4. Nunca faça pelo console nem pela barra de endereço requisições POST, PUT, PATCH ou DELETE. Os helpers deste prompt só fazem GET. Proibidos em especial: /api/send-confirmation-email, /api/webhook, /api/cron-email-jobs e qualquer /api/admin/*.
5. LIMITES DE REQUISIÇÃO: catálogo 120/min por IP (compartilhado entre products, product-details, home-sections e cross-sell), subscribe 5/min, unsubscribe e confirm-subscription 20/min, track-event 120/min; em LOCAL, mais um limite de borda em toda a /api (padrão 250 a cada 15 min; cada F5 gasta ~4). Se QUALQUER chamada responder 429 ("Muitas requisições…", "Muitas tentativas…") ou 503 "Não foi possível validar esta tentativa agora…", NÃO registre como bug: pare, avise o humano, espere (em LOCAL, ele pode reiniciar a API) e repita. Prefira navegar clicando.
6. Nunca limpe o localStorage inteiro. Apague só as chaves citadas (lgpd_consent, lgpd_consent_version, lgpd_consent_at, cart).
7. DEPLOY: depois de testar "Aceitar todos" (L01 item 7), volte logo para "Apenas essenciais". Não navegue com o consentimento de marketing concedido.
8. Dados pessoais: mascare e-mails e nomes de pessoas reais no relatório (ex.: j***@gmail.com, "Maria S."), inclusive os e-mails das variáveis.
9. Se um diálogo nativo do navegador ("<site> diz", com OK/Cancelar) aparecer, tecle Esc ou escolha Cancelar. Se travar, peça ajuda ao humano.
10. Diante de qualquer ação destrutiva ou irreversível que não esteja prevista aqui, PARE e pergunte ao humano.

# 3. Variáveis

- {{BASE_URL}}: endereço do site.
- {{EMAIL_DESCARTAVEL}}: e-mail descartável do humano (newsletter e descadastro).
- Marcadores que você preenche: <API> = valor de window.__API; <slug> = último segmento da URL do produto aberto; <HHMM> = hora e minuto atuais.

# 4. Método de trabalho

0. Início (uma vez por conversa): abra {{BASE_URL}}/?utm_source=qa-validacao&utm_medium=qa, instale (a), (c) e (d) e anote o horário e localStorage.getItem('session_id').
   - VERSÃO: Promise.all([__get('/auth/customer/logout').then(x => x.status), fetch('/robots.txt').then(r => r.text()).then(t => /painel-acesso-privado/.test(t))]).then(v => v[0] === 404 ? 'ANTIGO' : v[0] === 405 ? (v[1] ? 'DEFASADO' : 'ATUAL') : 'indefinido ' + v) → ATUAL = código atual; DEFASADO = commit 05b0066 sem as alterações locais (/admin redireciona para /painel-acesso-privado-atelie, que abre um login, e /login tem "Entrar como"); ANTIGO = deploy anterior (além disso, /privacidade sem o bloco de cookies). Itens marcados "(código novo)" que falharem em DEFASADO ou ANTIGO viram "defasagem de versão", não bug. Anote.
   - SEM SESSÃO: Promise.all([__get('/auth/customer/session'), __get('/admin/session')]).then(v => JSON.stringify({ cliente: v[0].body && v[0].body.authenticated, admin: v[1].body && v[1].body.authenticated })) → {cliente:false, admin:false}. Os cookies de sessão duram 8 h e sobrevivem entre conversas (o bloco 2A termina logado de propósito). Se cliente vier true: vá para / e clique "Sair" no cabeçalho (abaixo de 1024 px, pelo menu). Se admin vier true: abra /admin, clique "Encerrar sessão" (rodapé do menu lateral) e NÃO faça login. Rode de novo até os dois darem false; se não der, pare e peça ao humano.
1. Abra a tela e espere sumirem os "Carregando…". Depois de QUALQUER recarga completa (F5, URL digitada, Ctrl+Shift+R), reinstale (a), (c) e (d).
2. Console e rede: a leitura da extensão costuma capturar só a partir da primeira leitura na aba. Para erros do CARREGAMENTO, leia uma vez, recarregue e leia de novo. No resto, use window.__errLog e window.__netLog.
3. Larguras: desktop ~1440x900 (ou a maior possível, de preferência ≥ 1280); mobile ~390x844. Depois de CADA redimensionamento, rode window.innerWidth e registre a largura REAL. Se não descer a 390, use a menor possível, diga quais faixas cobriu (<640, 640–1023, ≥1024) e marque os itens exclusivos de 390 px como "não testado — viewport mínima X px". Screenshots: <tela>-<largura real>-<estado>.
4. Teste CADA item ("ação → esperado"); divergência vira problema. Teste também os estados vazio, carregando, erro e validação (campo vazio, e-mail sem "@").
5. Textos: português, acentuação, inglês cru ("items", "Failed to fetch"), placeholders. Layout: sobreposição, cortes, imagens quebradas, rolagem horizontal (document.documentElement.scrollWidth <= document.documentElement.clientWidth deve ser true); para bug visual, junte um dado objetivo (getBoundingClientRect, scrollWidth, texto exato). Acessibilidade: foco visível, labels, aria-label em botões de ícone, alvos ≥ 44 px no mobile.
6. Verificações dirigidas são SUSPEITAS a confirmar ou descartar: teste e relate o que viu, inclusive quando o sintoma NÃO aparece.
7. Recarga completa × navegação interna: window.__marca = 1 antes do clique; typeof window.__marca === 'undefined' depois = a página inteira recarregou.

Ferramentas (rode no console da página pela ferramenta de JavaScript). Todas SOMEM em recarga completa; navegação por clique dentro do site não as apaga.

(a) Capturador de toasts, que também registra o ícone:

```js
window.__toastLog = [];
new MutationObserver(function () {
  document.querySelectorAll('article[data-type]').forEach(function (a) {
    var i = a.querySelector('i');
    var ic = i ? getComputedStyle(i, '::before').content : 'sem <i>';
    var t = a.getAttribute('data-type') + ': ' + a.textContent.trim() + ' | ícone: ' + ic;
    if (window.__toastLog.indexOf(t) === -1) window.__toastLog.push(t);
  });
}).observe(document.body, { childList: true, subtree: true });
('toasts ok');
```

Depois de cada ação, leia JSON.stringify(window.__toastLog). Ícone "none" ou "normal" significa que o toast apareceu sem ícone.

(b) Não há window.confirm na loja pública; se uma caixa nativa aparecer, tecle Esc.

(c) API, consulta sem cache (só GET) e navegação interna sem recarga:

```js
window.__API =
  location.hostname === 'localhost' ? 'http://localhost:3000/api' : location.origin + '/api';
window.__get = function (path) {
  var url = window.__API + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) {
    return r.text().then(function (t) {
      var j = null;
      try {
        j = JSON.parse(t);
      } catch (e) {}
      return { status: r.status, cache: r.headers.get('cache-control'), body: j };
    });
  });
};
window.__ir = function (caminho) {
  history.pushState({}, '', caminho);
  window.dispatchEvent(new PopStateEvent('popstate'));
  return location.pathname + location.search;
};
('api ok');
```

O __get acrescenta "_=<hora>" (a API ignora esse parâmetro; ele fura cache do navegador e da CDN) e devolve {status, cache, body}. O __ir troca de rota SEM recarregar, mantendo as ferramentas instaladas. Se a tela não mudar, use um link da página.

(d) Interceptador de rede, coletor de erros e simulador de falha:

```js
(function () {
  if (window.__netLogOn) return 'net já instalado';
  window.__netLogOn = true;
  window.__netLog = [];
  window.__errLog = [];
  window.__bloquear = null;
  window.__semCache = null;
  var SEG =
    /^(totpSecret|fallbackPin|token|delete_token|password|access_token|refresh_token|challengeToken|factorCode|confirmationCode|devConfirmUrl|uploadUrl|signedUrl|pin|secret|totp)$/i;
  var SEM_CORPO = /me-export-data|admin\/(users|orders|dashboard)|customer-orders/;
  function limpa(v, d) {
    if (d > 6 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v))
      return v.slice(0, 20).map(function (x) {
        return limpa(x, d + 1);
      });
    var o = {};
    Object.keys(v).forEach(function (k) {
      o[k] = SEG.test(k) ? '[removido]' : limpa(v[k], d + 1);
    });
    return o;
  }
  function parse(t) {
    try {
      return limpa(JSON.parse(t), 0);
    } catch (e) {
      return typeof t === 'string' ? t.slice(0, 300) : t;
    }
  }
  function urlLimpa(u) {
    return String(u).replace(/([?&](token|delete_token|code)=)[^&#]+/g, '$1[removido]');
  }
  var of = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var it = {
      t: new Date().toISOString().slice(11, 19),
      metodo: metodo,
      url: urlLimpa(url),
      req:
        init && typeof init.body === 'string'
          ? parse(init.body)
          : init && init.body
            ? '[corpo não-texto]'
            : null,
    };
    window.__netLog.push(it);
    if (window.__bloquear && window.__bloquear.test(url)) {
      it.status = 'BLOQUEADO pelo teste (não enviado)';
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (window.__semCache && window.__semCache.test(url)) {
      init = Object.assign({}, init || {}, { cache: 'no-store' });
      it.semCache = true;
    }
    var t0 = performance.now();
    return of.call(window, input, init).then(
      function (r) {
        it.status = r.status;
        it.cache = r.headers.get('cache-control');
        it.ms = Math.round(performance.now() - t0);
        r.clone()
          .text()
          .then(function (t) {
            if (SEM_CORPO.test(url)) {
              it.res = '[corpo omitido: ' + t.length + ' caracteres]';
              return;
            }
            var s = JSON.stringify(parse(t));
            if (s) s = s.replace(/token=[^&"]+/g, 'token=[removido]');
            it.res = s && s.length > 600 ? s.slice(0, 600) + '…' : s;
          })
          .catch(function () {});
        return r;
      },
      function (e) {
        it.status = 'falhou: ' + e.message;
        throw e;
      },
    );
  };
  if (navigator.sendBeacon) {
    var ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) {
      var it = {
        t: new Date().toISOString().slice(11, 19),
        metodo: 'BEACON(POST)',
        url: urlLimpa(u),
      };
      window.__netLog.push(it);
      if (d && typeof d.text === 'function')
        d.text().then(function (t) {
          it.req = parse(t);
        });
      else if (typeof d === 'string') it.req = parse(d);
      var ok = ob(u, d);
      it.status = ok ? 'enfileirado (status real só na ferramenta de rede)' : 'recusado';
      return ok;
    };
  }
  window.addEventListener('error', function (e) {
    window.__errLog.push('error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errLog.push('rejection: ' + String((e.reason && e.reason.message) || e.reason));
  });
  return 'net ok';
})();
```

Uso do (d): leia JSON.stringify(window.__netLog.slice(-5)) e JSON.stringify(window.__errLog). window.__bloquear = /padrão/ simula falha de rede (a chamada NÃO é enviada; a tela recebe "Failed to fetch"); desligue com null. Os eventos de funil (track-event) saem por sendBeacon: o corpo vai para o __netLog, o status 204 só na ferramenta de rede. Chamadas do CARREGAMENTO acontecem antes do (d): refaça-as com __get. Cada entrada traz "ms" (duração da chamada). O (d) NÃO guarda o corpo das respostas de me-export-data, admin/users, admin/orders, admin/dashboard e customer-orders (só status, ms e tamanho), troca "token=…" por "token=[removido]" e apaga chaves de segredo (uploadUrl, signedUrl, pin, secret, totp…).

Títulos de aba esperados (todos terminam em " · Ateliê da Escola"; "(ni)" = com meta robots "noindex,nofollow"): / "Materiais educativos digitais para professores"; /produtos "Catálogo de materiais educativos"; /produtos/<slug> "<nome>" (carregando ou erro: "Carregando produto" (ni)); /checkout "Finalizar compra" (ni); /login e /conta "Entrar ou criar conta" (ni); /downloads "Meus downloads" (ni); /privacidade "Política de Privacidade"; /termos "Termos de Uso"; /confirmar-inscricao "Confirmar inscrição" (ni); /desinscrever "Cancelar inscrição" (ni); 404 "Página não encontrada" (ni). /admin e /reset-password não definem título: no acesso direto aparece "Ateliê da Escola"; vindo de outra página, fica o título anterior.

# 5. Checklist tela por tela (siga nesta ordem)

Cada tela traz a "Fonte". Copie-a no campo "Origem provável" dos problemas daquela tela.

## L01 — Banner de cookies (primeira visita)

Rota: /. Como chegar: no console, localStorage.removeItem('lgpd_consent'); localStorage.removeItem('lgpd_consent_version'); localStorage.removeItem('lgpd_consent_at'); depois F5 e reinstale as ferramentas.
Fonte: src/components/ConsentBanner.jsx, src/utils/consent.js, src/utils/analytics.js, src/main.jsx.

1. Sem decisão → card fixo na base: aside[role="dialog"][aria-label="Aviso de cookies e privacidade"] com h2 "Sua privacidade importa", o texto "Usamos cookies essenciais para o funcionamento do site. Cookies de marketing (Google Analytics e Meta) ajudam a medir o que funciona. Você decide. Saiba mais na nossa Política de Privacidade e nos Termos de Uso.", os links "Política de Privacidade" e "Termos de Uso" e os botões "Apenas essenciais" e "Aceitar todos".
2. Antes de decidir, na ferramenta de rede → nenhuma requisição a googletagmanager.com nem a connect.facebook.net.
3. "Política de Privacidade" → /privacidade e o banner continua visível. Volte para /.
4. Tecla Esc e clique no meio da página → o banner NÃO fecha (esperado).
5. Em ~390 px os botões ficam abaixo do texto; em 1440 px, em linha.
6. "Apenas essenciais" → o banner some. localStorage: lgpd_consent = "denied", lgpd_consent_version = "2026-05-24", lgpd_consent_at preenchido (data ISO). Depois do F5 o banner não volta. Nenhuma requisição foi disparada pelo clique.
7. Remova as três chaves, dê F5 e clique em "Aceitar todos" → lgpd_consent = "granted". Anote se carregou algum script do Google ou da Meta (gtag/fbevents). Se não carregou nada, registre "IDs de analytics ausentes neste ambiente" (não é bug). Em DEPLOY, faça o item 8 logo em seguida.
8. Troque lgpd_consent_version para "2020-01-01", mantendo "granted", e dê F5 → o banner reaparece. Decida com "Apenas essenciais".
   Verificação dirigida:

- Em ~390 px, com o banner pendente, role até o fim da página: a newsletter e os links "Privacidade"/"Termos" da faixa final ficam atrás do banner?
- Com Tab desde o topo, o foco só chega aos botões do banner depois do rodapé inteiro? Existe "Pular para o conteúdo"? O banner tem aria-modal?
- O banner tem só os 2 botões ("Personalizar" não existe)? Algum link no banner, no cabeçalho ou no rodapé leva para rever a escolha depois? (Pelo código, a revogação só existe em /privacidade#cookies.)
- (DEPLOY) Antes de decidir, aparece /_vercel/insights/script.js na rede? A seção "5. Com quem compartilhamos" da Política cita a Vercel?

## L02 — Cabeçalho e menu mobile

Rota: /. Fonte: src/components/Shell.jsx.
Desktop (≥1024 px), como visitante:

1. Logo (coruja) + "Profa. Marciar Cardoso" (maiúsculas via CSS) → leva a / sem recarregar (use window.__marca).
2. [...document.querySelectorAll('nav ul li')].slice(0,4).map(e => e.innerText.trim()) → ["Início","Como Funciona","Contato","Produtos"]. Em /, "Início" tem a classe bg-brand-50. Em /produtos e em /produtos/<slug>, quem tem é "Produtos".
3. Em /: "Como Funciona" → location.hash === "#como-funciona" e o texto "Do clique à impressão em minutos" visível no viewport. "Contato" → rola até o footer#contato.
4. À direita: o botão do carrinho (aria-label "Abrir carrinho", sem badge com carrinho vazio) e "Entrar". "Entrar" leva a /login, página SEM cabeçalho: volte. Não existem "Sair", "Meus produtos" nem "Painel admin". O botão [aria-label="Abrir menu"] tem display none.
5. window.scrollTo(0, 1000) → document.querySelector('nav').getBoundingClientRect().top === 0 (cabeçalho fixo).
6. Em /produtos: window.__marca = 1 e clique em "Como Funciona" → a página inteira recarrega em /#como-funciona. Depois da carga, anote window.scrollY: se ficou em 0, a âncora falhou. Reinstale as ferramentas.
   Faixas (confira contra o window.innerWidth real):

- 640–1023 px: marca visível, links centrais ocultos, hambúrguer visível.
- <640 px: só coruja, carrinho e hambúrguer.
  Mobile (~390 px):

7. "Abrir menu" → aria-expanded="true", aria-label vira "Fechar menu" e o ícone vira X. O painel lista exatamente "Início", "Produtos", "Navegar" (rótulo), "Como Funciona", "Contato" e "Entrar". Cada item (a ou button) tem getBoundingClientRect().height ≥ 44. Sem rolagem horizontal.
8. "Produtos" no menu → URL /produtos e o painel sai do DOM.
9. Hambúrguer e carrinho com pelo menos 44×44 px.
   Verificação dirigida:

- O menu fecha com Esc? E com clique fora? (Pelo código, não fecha; registre como acessibilidade.) Tem aria-controls?
- Com o menu aberto, alargue para ≥1024 e volte: ele reaparece aberto?
- Com o menu aberto, abra o carrinho e feche o drawer: o menu continua aberto por baixo?

## L03 — Home

Rota: /. Fonte: src/pages/HomePage.jsx, handlers/home-sections.js, src/components/SocialProofStrip.jsx, src/components/SEO.jsx, index.html.

1. Título conforme a tabela. __get('/home-sections').then(x => JSON.stringify({ s: x.status, cache: x.cache, secoes: x.body.sections.map(s => ({ t: s.title, tipo: s.type, n: s.products.length, link: s.link })) })) → status 200. Cache esperado "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" (no deploy pode vir "public, max-age=300"). Anote as seções.
2. Hero: H1 "Painéis e recursos pedagógicos feitos com cuidado e criatividade" e o botão "Ver Produtos →" (→ /produtos). Os emojis flutuantes só aparecem a partir de 640 px.
3. Faixa rolante "BANNERS ✦ PAINÉIS ✦ ATIVIDADES ✦ LEMBRANCINHAS ✦ KITS ✦".
4. Seção Catálogo: "CATÁLOGO", H2 "É exatamente isso que você precisa 👇" e o botão "Ver catálogo completo →" (→ /produtos). Durante a carga aparece "Carregando vitrine...".
5. Quantidade de H3 da seção = número de seções, com os mesmos títulos e na mesma ordem. Cards por faixa = products.length. Cada card linka /produtos/<slug> e mostra o preço no formato "R$ 12,90". Produto sem imagem mostra um quadrado lilás com o texto "Produto".
6. Em 1440 px: o botão "Rolar para direita" aumenta o scrollLeft do trilho (se houver overflow) e "Rolar para esquerda" volta. Em ~390 px as setas ficam ocultas.
7. "Mais produtos →":
   - de uma seção de categoria → /produtos?categoria=<Nome>, já filtrado;
   - de "Mais vendidos" → /produtos?preset=mais-vendidos, com o select em "Mais vendidos";
   - de "Novidades" → /produtos?preset=novidades.
     Volte à home depois de cada um.
8. section#como-funciona: "SIMPLES ASSIM", H2 "Do clique à impressão em minutos", "Sem cadastro obrigatório. Sem espera. Sem complicação.", uma <ol> com 4 <li> ("Escolha", "Pague", "Baixe na hora", "Imprima") e a caixa "PDF em alta resolução".
9. Prova social:
   - "COMO A ESCOLA USA" e H2 "Mais de 16.000 professoras nos seguem nas redes 📲";
   - números "4,2k seguidores", "48k curtidas", "98% aprovação" e "5k+ pedidos" (2 colunas abaixo de 640 px, 4 a partir daí);
   - 3 depoimentos (Carla M., Ana R., Juliana F.);
   - dois botões "@profamarciarcardoso" com href https://www.instagram.com/profamarciarcardoso e https://www.tiktok.com/@profamarciarcardoso e target _blank (confira o href sem abrir).
10. SEO: link[rel=canonical] = origem + "/"; um script[type="application/ld+json"] com [Organization, WebSite].
11. Em ~390 px: sem rolagem horizontal.
    Verificação dirigida:

- meta[name=description] aparece mais de 1 vez?
- "Novidades" tem N cards, mas /produtos?preset=novidades (últimos 7 dias) mostra menos ou zero?
- Faixa com trilho vazio e sem mensagem (setas visíveis)? Título sem revisão (ex.: "sejam bem vindos ao natal")? Produto "teste" ou categoria com nome UUID?
- Mesma categoria em duas seções: console "Encountered two children with the same key"? A seta de uma faixa move a outra?
- "16.000 professoras" × "4,2k seguidores"? Passos em <h5> logo após um <h2>? JSON-LD com busca /produtos?q=… (/produtos?q=banner filtra?) e URLs de profamarciarcardoso.com.br?
- (DEPLOY) Imagem quebrada com "Refused to load the image … Content Security Policy"?

## L04 — Rodapé e newsletter

Rota: rodapé de /. Fonte: src/components/Shell.jsx (rodapé), src/components/NewsletterSignup.jsx, src/services/newsletter.js, handlers/subscribe.js.

1. O <footer> tem id="contato", com h4 "Navegação" e "Contato". A partir de 768 px: grade de 4 colunas (a marca ocupa 2). Tem o texto "Materiais gráficos digitais profissionais e editáveis para festas, eventos e decoração escolar. Download instantâneo após a aprovação do pagamento.".
2. Links da coluna Navegação: "Início" (/), "Produtos" (/produtos), "Como funciona" (/#como-funciona), "Minha conta" (/login) e "Downloads" (/downloads). Para CADA um: role até o fim da página, clique e anote window.scrollY na página nova (o esperado seria 0).
3. Contato: link mailto:contato@profamarciarcardoso.com.br; "(11) 99999-9999" → href https://wa.me/5511999999999 com target _blank.
4. Ícones sociais (inspecione o href sem abrir): Instagram https://instagram.com/profamarciarcardoso, Facebook https://www.facebook.com, Pinterest https://www.pinterest.com. [...document.querySelectorAll('footer a[target=_blank]')].every(a => a.rel === 'noopener noreferrer') → true.
5. Faixa final: "© 2026 Profa. Marciar Cardoso. Todos os direitos reservados." e os links "Privacidade" (→ /privacidade) e "Termos" (→ /termos).
6. Newsletter (form aria-label "Inscrever-se na newsletter"): label "Receba dicas + materiais novos no email", #newsletter-email-footer ("seu@email.com"), botão "Inscrever", nota "Você pode cancelar a qualquer momento — link no rodapé de todos os emails.".
   a. Vazio + "Inscrever" → balão nativo, sem requisição.
   b. "teste@dominio" → vermelho "Informe um email válido." (role=alert), sem requisição.
   c. UMA vez: {{EMAIL_DESCARTAVEL}} → "Enviando…" → POST <API>/subscribe 200, corpo com email, source:"footer" e attribution → verde "Confirmação enviada — verifique sua caixa de entrada e clique no link." (ou "Você já está inscrito. Obrigada!"), campo limpo e desabilitado. Troque de rota e volte: o formulário reinicia. Peça ao humano o link do e-mail "Confirme sua inscrição — Ateliê da Escola" (para L09). Em LOCAL, o Resend em sandbox pode não entregar: registre "não recebido — provável sandbox", não bug do site.
   d. NÃO teste o limite de 5/min (não testado).
   Verificação dirigida: páginas do rodapé abrem roladas (scrollY > 0)? Facebook/Pinterest genéricos e WhatsApp fictício? https://profamarciarcardoso.com.br (aba nova) existe? Contraste baixo do texto pequeno (ex.: "©")? A resposta revela que o e-mail já estava na lista?

## L05 — Catálogo, filtros e filtros no mobile

Rota: /produtos. Fonte: src/pages/ProductsPage.jsx, src/hooks/useProductFilters.js, src/components/ProductSidebar.jsx, src/components/ProductGrid.jsx, src/components/SortDropdown.jsx, handlers/products.js.

1. Título conforme a tabela; H1 contém "Banners para toda ocasião escolar". Na carga: "Carregando catálogo…" com 6 cards cinzas.
2. __get('/products').then(x => JSON.stringify({ s: x.status, cache: x.cache, total: x.body.total, n: x.body.products.length, temDownloadUrl: x.body.products.some(p => 'download_url' in p || 'downloadUrl' in p) })) → 200, total N e temDownloadUrl false.
3. "N produtos encontrados" = total = document.querySelectorAll('main article:not([aria-hidden])').length = badge do "Todos" na sidebar. (Singular: "1 produto encontrado".) Anote N.
4. Chips acima da grade: "Todos" + no máximo 5 categorias. Clicar numa categoria → todas as pílulas dos cards com esse nome, o item da sidebar destacado e a URL SEM mudança. "Todos" volta ao total.
5. Select "Ordenar produtos": "Mais vendidos", "Mais recentes" (padrão), "Menor preço", "Maior preço", "Nome A-Z". Confira: crescente, decrescente e alfabética.
6. Sidebar: "CATEGORIAS" e "FAIXA DE PREÇO" recolhem e expandem (chevron gira). Rádios "Até R$ 25" (≤ 25), "R$ 25 – R$ 50" (> 25 e ≤ 50), "Acima de R$ 50" (> 50): confira todos os preços. Faixa vazia → "Nenhum produto encontrado nessa categoria.".
7. Card: imagem ("Ver detalhes →" no hover), selo colorido, pílula da categoria (ou "BANNER"), nome, descrição curta, chips "PDF", "Canva", "Imprimível", preço, "Adicionar" e "Detalhes".
8. "Adicionar" → toast "success: Produto adicionado ao carrinho.", badge +1, item em JSON.parse(localStorage.cart), BEACON com add_to_cart; o drawer NÃO abre. De novo no mesmo card → "warning: Este produto já está no carrinho." e o badge não muda. Anote o ícone de cada toast.
9. Imagem ou "Detalhes" → /produtos/<slug>. Abrir /produtos gera BEACON com view_catalog.
10. URLs diretas: ?preset=mais-vendidos → select "Mais vendidos"; ?categoria=<nome exato> → filtrada; ?categoria=CategoriaQueNaoExiste → tudo; ?preset=novidades → contagem ≤ total com "Todos" ativo, e clicar "Todos" traz tudo.
11. 1440 px: sidebar, 3 colunas, sem "Filtros". ~390 px: 1 coluna, botão "Filtros", sem rolagem horizontal.
12. Mobile: "Filtros" → painel de 288 px com título "Filtros", X (aria-label "Fechar") e fundo escuro (aria-label "Fechar filtros"). Escolher categoria → fecha e filtra; "Acima de R$ 50" → fecha e tudo > 50; X e fundo fecham sem mudar o filtro; Esc NÃO fecha (registre).
    Verificação dirigida:

- Selos ("MAIS VENDIDO", "DESTAQUE", "LANÇAMENTO", "PROMO LIMITADA", "EXCLUSIVO") fixos por categoria (todo card de "Festa Junina" com "MAIS VENDIDO")? "Volta às Aulas"/"Decoração de Sala" sem selo? Chips PDF/Canva/Imprimível idênticos em todos?
- ?preset=novidades filtra sem indicador? Vazio culpa "a categoria"?
- De /produtos?categoria=<Nome>, clicar "Produtos" no cabeçalho: URL limpa e filtro ainda aplicado?
- Categoria + "Menor preço" e F5: a escolha se perde? Com "Até R$ 25", os contadores da sidebar batem com "N produtos encontrados"?
- ?q=junina filtra? ?categoria=festa-junina (slug, formato do sitemap) × ?categoria=Festa%20Junina: só o nome filtra?
- Categorias com nome UUID ou "Sem nome (renomeie)" nos filtros? O card mostra o preço original riscado (compare com a página do produto)?
- Painel mobile FECHADO: o Tab passa por botões invisíveis fora da tela?

## L06 — Página de produto

Rota: /produtos/<slug>. Para achar produtos com várias mídias, vídeo, kit ou preço riscado:
__get('/products').then(x => JSON.stringify(x.body.products.filter(p => (p.images || []).length > 1 || (p.videos || []).length || p.isKit || p.productType === 'kit' || (p.originalPrice > p.price)).map(p => p.slug + ' | img ' + (p.images || []).length + ' | vid ' + (p.videos || []).length + ' | kit ' + (p.isKit || p.productType === 'kit') + ' | orig ' + p.originalPrice)))
Se não houver produto com a característica, marque o item como "não testado — sem produto com essa característica".
Fonte: src/pages/ProductDetailsPage.jsx, src/components/ProductBenefits.jsx, src/components/ProductFaq.jsx, src/components/ProductReviews.jsx, src/components/CrossSellSection.jsx, handlers/product-details.js, handlers/cross-sell.js.

1. Carga: "Carregando produto…" (título "Carregando produto · …"); depois "<nome> · Ateliê da Escola", com o nome num H2. Anote document.querySelectorAll('h1').length.
2. __get('/product-details?slug=<slug>') → 200, sem a chave download_url, cache "public, max-age=300…". Sai 1 BEACON view_item.
3. Preço "R$ x,xx" = product.price; original riscado quando maior; texto fixo "PDF em alta resolução · acesso permanente · download imediato após aprovação"; pílula da categoria (ou "Sem categoria"); selos opcionais "Destaque" e "KIT".
4. Com mais de 1 mídia: miniaturas de 64 px; clicar troca a mídia principal (borda roxa na ativa).
5. Sem benefícios cadastrados: exatamente 4 <li> ("PDF em alta resolução", "Pronto para imprimir", "Download imediato após pagamento", "Acesso permanente, sem renovação").
6. FAQ ("PERGUNTAS FREQUENTES" / "Tire suas dúvidas"), se houver: a 1ª com aria-expanded="true", as outras "false"; clicar em outra abre essa e fecha a anterior; clicar na aberta fecha todas. Depoimentos ("QUEM JÁ USOU" / "O que professores estão falando"), se houver: estrelas com aria-label "Avaliação N de 5".
7. Sugestões: "Carregando sugestões…" → "VOCÊ TAMBÉM PODE GOSTAR" / "Quem comprou este levou também", até 4 cards, nenhum do próprio produto. __get('/cross-sell?productId=<product.id do item 2>') → 200 com strategy "co_occurrence" ou "same_category". Role até um card e clique → "Carregando produto…" e o produto novo: anote window.scrollY e o document.title DURANTE a carga.
8. "Adicionar" → toast e badge +1, sem mudar a URL nem abrir o drawer. "Comprar agora" → toast + /checkout com o item (volte); de novo, com o item já no carrinho → toast "warning: Este produto já está no carrinho." e navega mesmo assim. "Voltar ao catálogo" → /produtos.
9. ~390 px: galeria acima dos detalhes, sem rolagem horizontal.
10. /produtos/slug-que-nao-existe → caixa rosa "Não foi possível carregar o produto" / "Produto não encontrado na API."; __get → 404 {success:false, error:{code:"NOT_FOUND", message:"Produto não encontrado"}}; anote o título. /produtos/123 → anote mensagem e status (se vier "Falha ao carregar produto: 500", relate).
    Verificação dirigida:

- A página da sugestão abre rolada? O título do produto ANTERIOR fica durante a carga? Com "same_category", o título "Quem comprou este levou também" continua?
- "PDF em alta resolução" duas vezes na mesma coluna; "após pagamento" × "após aprovação"?
- Benefício CUSTOMIZADO (se existir): o ícone aparece? (getComputedStyle(<i>, '::before').content)
- Vídeo: o player toca? Requisição a /produtos/product_videos/… respondendo HTML? (DEPLOY) "Refused to frame … youtube" / "Refused to load media"?
- KIT lista o conteúdo? Miniatura de vídeo tem nome acessível?
- Produto só com image_url: o JSON-LD sai com image []? /avaliar?order=teste (link do e-mail pós-compra) cai na 404?

## L07 — Drawer do carrinho e toasts

Rota: qualquer página com Shell. Fonte: src/components/CartDrawer.jsx, src/providers/CartProvider.jsx, src/utils/cart-storage.js, src/components/Shell.jsx, src/components/ToastViewport.jsx, src/providers/ToastProvider.jsx.
Preparação: localStorage.removeItem('cart'), F5 e reinstale as ferramentas.

1. Carrinho vazio aberto → "SEU CARRINHO", h2 "Nada por aqui ainda", "Seu carrinho está vazio." e "Ver catálogo" (→ /produtos, fecha o drawer); sem rodapé.
2. Em /produtos, "Adicionar" em A e B → badge "2" e aria-label "Abrir carrinho com 2 itens" (com 1: "Abrir carrinho com 1 item").
3. Abrir → aside[role="dialog"][aria-modal="true"][aria-labelledby="cart-drawer-title"]; document.activeElement.getAttribute('aria-label') === "Fechar"; document.body.style.overflow === "hidden"; botão do carrinho com aria-expanded="true". Abrir NÃO gera requisição (não existe view_cart).
4. Conteúdo: h2 pelo código "2 items" (plural em inglês: registre); itens com imagem 64 px (ou quadrado cinza), nome, preço e "Remover" (aria-label "Remover <nome>"); "Subtotal" = soma de JSON.parse(localStorage.cart).map(i => i.price) em "R$ 0,00"; "Cupons e descontos são aplicados na próxima etapa."; botões "Finalizar compra →" e "Esvaziar carrinho".
5. Tab e Shift+Tab 10 vezes: document.activeElement.closest('[role=dialog]') !== null continua true.
6. Esc fecha, o foco volta ao botão do carrinho e body.style.overflow volta ao anterior. O fundo escuro (x=10, y=300 em 1440 px) e o X também fecham.
7. "Remover" em A → sem toast; h2 "1 item", subtotal e badge diminuem; BEACON remove_from_cart. F5 → B e o badge continuam (badge = JSON.parse(localStorage.cart).length).
8. "Finalizar compra →" → fecha e vai a /checkout. Volte.
9. "Esvaziar carrinho" → sem confirmação, toast ou evento; o drawer fica em "Nada por aqui ainda"; localStorage.cart === "[]".
10. Painel com 448 px em 1440 e largura toda em ~390.
11. Toasts: 3 "Adicionar" rápidos → 3 toasts empilhados, cada um some em ~2,4 s; o X "Fechar aviso" remove antes; o contêiner [aria-live="polite"] tem z-index 100.
    Verificação dirigida:

- No __toastLog, o ícone dos toasts "success" e "warning" vem "none"/"normal" (sem ícone)? (Suspeita: bi-check-circle-fill e bi-exclamation-circle-fill faltam no subset de ícones.)
- Com as chaves lgpd_* removidas (banner pendente), em ~390 px e 1 item, abra o carrinho: document.elementFromPoint no centro de "Finalizar compra →" devolve o banner? Depois decida com "Apenas essenciais".
- (Opcional) Duas abas: aba 1 adiciona Y; aba 2, sem recarregar, adiciona Z; F5 na aba 1: Y sumiu?

## L08 — Páginas legais e preferências de cookies

Rotas: /privacidade (bloco em #cookies) e /termos. Fonte: src/pages/LegalPages.jsx, src/components/ConsentPreferences.jsx, src/utils/consent.js, src/components/ConsentBanner.jsx.

1. /privacidade: "DOCUMENTOS LEGAIS", h1 "Política de Privacidade", "Versão vigente: 2026-05-24", exatamente 10 H2 ("1. Quem somos" … "10. Alterações"), sem noindex, canonical em /privacidade, barra final "Política de Privacidade" / "Termos de Uso" / "Voltar para a home".
2. (código novo) section#cookies (aria-label "Preferências de cookies"): h3 "Suas preferências de cookies", "Situação atual: Apenas cookies essenciais — escolhido em dd/mm/aaaa.", "Você pode mudar quando quiser, e a mudança vale a partir de agora." e os botões "Apenas essenciais" (aria-pressed="true") e "Aceitar todos".
3. Os links "Suas preferências de cookies" das seções 4 e 7 (href="#cookies") rolam até o bloco, sem recarga.
4. '#cookies button' "Aceitar todos" → "Cookies de marketing ativos — escolhido em …", sem recarga, lgpd_consent = "granted".
5. '#cookies button' "Apenas essenciais" → a página RECARREGA (revogação); reinstale as ferramentas; performance.getEntriesByType('navigation')[0].type === 'reload' e o bloco em "Apenas cookies essenciais".
6. Sincronia na MESMA aba: (a) remova as chaves lgpd_* e dê F5 → banner visível e bloco "Situação atual: Você ainda não escolheu."; (b) clique "Aceitar todos" DENTRO de #cookies (com o banner visível há 2 botões de cada: use '#cookies button') → o banner inferior some?; (c) remova de novo, F5, e clique "Apenas essenciais" NO BANNER (aside[aria-label="Aviso de cookies e privacidade"] button) → o bloco continua "Você ainda não escolheu."?; (d) termine em "Apenas essenciais" (DEPLOY: não navegue com "granted").
7. A seção 7 cita "Baixar meus dados" e "Excluir minha conta" em /conta; o link "sua conta" → /conta (como visitante, o formulário de acesso). Volte.
8. /termos: h1 "Termos de Uso", 10 H2 ("1. Sobre estes termos" … "10. Contato"), "72 horas" em negrito e o link "/downloads" na seção 3, o link "/login" na seção 6, links internos sem recarga, canonical em /termos.
9. ~390 px: sem rolagem horizontal nas duas.
   Verificação dirigida:

- No item 6b, o banner continua visível até o F5? No 6c, o bloco fica desatualizado até o F5?
- A seção "6. Retenção" diz "24 meses" para eventos de analytics? (A rotina de limpeza apaga com 180 dias.)
- Abrir {{BASE_URL}}/privacidade#cookies digitado na barra rola até o bloco, ou fica no topo?

## L09 — Confirmar e cancelar inscrição da newsletter

Rotas: /confirmar-inscricao e /desinscrever. Fonte: src/pages/SubscriptionPages.jsx, src/services/subscription.js, handlers/confirm-subscription.js, handlers/unsubscribe.js.

1. /confirmar-inscricao sem token → já no 1º render "Ops…", "Não foi possível confirmar", "Link inválido. Volte ao seu email e clique no botão de confirmação.", sem requisição a confirm-subscription; botões "Ver produtos" e "Voltar à home"; título e noindex da tabela.
2. ?token=abc → GET <API>/confirm-subscription?token=abc com 404 {success:false, error:{code:"NOT_FOUND", message:"Token inválido ou expirado."}} e esse texto na tela (em LOCAL podem sair 2 GETs).
3. Link real de L04 (se o humano passou; troque SÓ o host se não for {{BASE_URL}}) → "✓ Confirmado", "Bem-vindo(a) à lista!", "Inscrição confirmada! Você vai receber as novidades por email.". Depois F5 e anote. Sem link: não testado.
4. /desinscrever: H1 "Cancelar inscrição", label "EMAIL CADASTRADO", #unsub-email ("seu@email.com"), botão vermelho "Confirmar cancelamento". "a@b" → "Informe um email válido." sem requisição. ?email=x@y.com → #unsub-email.value === "x@y.com", sem requisição.
5. UMA vez: {{EMAIL_DESCARTAVEL}} → "Cancelando…" → POST <API>/unsubscribe com {email} no CORPO → 200 {success:true, confirmationRequired:true}; texto cinza "Se este e-mail estiver na nossa lista, enviamos um link para concluir o cancelamento. Abra o e-mail e clique no link."; H1 e formulário continuam. NÃO abra o link do e-mail "Confirme o cancelamento da sua inscrição".
6. ?token=abc → "Cancelando sua inscrição…" → "✓ Cancelado", "Pronto, você foi removido", "Inscrição cancelada. Você não receberá mais e-mails de marketing." (verde); GET 200 {success:true}; sem formulário, só "← Voltar à home".
7. Falha no token: em /desinscrever, window.__bloquear = /unsubscribe/; __ir('/desinscrever?token=xyz') → aparece "Failed to fetch"? Há formulário ou botão de tentar de novo? Depois window.__bloquear = null.
   Verificação dirigida:

- Depois de confirmar com o link real (item 3), o F5 mostra "Não foi possível confirmar" / "Token inválido ou expirado."?
- Em LOCAL, com 2 GETs de confirmação, a tela final mostra falha mesmo com a confirmação feita?
- Qualquer token inventado mostra "Pronto, você foi removido"? (Esperado pelo desenho anti-enumeração: registre só como observação.)

## L10 — Página 404, rotas antigas e SEO técnico

Fonte: src/pages/NotFoundPage.jsx, src/App.jsx, src/components/SEO.jsx, index.html, public/robots.txt, handlers/sitemap.xml.js, vercel.json.

1. /rota-que-nao-existe → com Shell: "404", h1 "Página não encontrada", "O endereço que você acessou não existe ou foi movido.", botões "Voltar para a home" (→ /) e "Ver produtos" (→ /produtos); robots "noindex,nofollow"; canonical = só a origem.
2. (código novo) /painel-acesso-privado-atelie e /admin-login → a mesma 404, sem formulário. Se abrir um formulário de login, é defasagem de versão (DEFASADO ou ANTIGO, passo 0).
3. /admin/usuarios → URL vira /admin (replace) com "Verificando sessão" e o formulário "Acesso restrito" (NÃO logue). /admin/xyz → 404. /avaliar?order=teste → 404. Em /admin, anote document.title e a meta robots.
4. SEO: abra pela URL cada rota (/, /produtos, /produtos/<slug>, /privacidade, /termos, /confirmar-inscricao, /desinscrever, /rota-que-nao-existe, /checkout, /login, /downloads — nas três últimas só leia) e rode
   JSON.stringify({ t: document.title, d: document.querySelectorAll('meta[name=description]').length, c: document.querySelector('link[rel=canonical]')?.href, r: document.querySelector('meta[name=robots]')?.content, og: document.querySelector('meta[property="og:image"]')?.content, ld: document.querySelectorAll('script[type="application/ld+json"]').length })
   Esperado: títulos da seção 4; canonical = origem + caminho (/conta → /login; 404 → só a origem); og:type "product" no produto.
5. {{BASE_URL}}/robots.txt → "Disallow: /admin" e "Disallow: /login"; (código novo) sem "painel-acesso-privado-atelie". Anote a linha "Sitemap:".
6. Sitemap: em LOCAL, http://localhost:3000/sitemap.xml (o de :5173 mostra a 404 do SPA — esperado em dev); em DEPLOY, {{BASE_URL}}/sitemap.xml. Anote: responde XML? domínio das <loc>? inclui /login? categorias como ?categoria=<slug>? slugs em formato UUID?
7. fetch('/rota-que-nao-existe').then(r => r.status) → anote (200 = soft-404).
   Verificação dirigida: meta description duplicada (d = 2)? /login no sitemap e bloqueado no robots? <loc> num domínio diferente de {{BASE_URL}} (ngrok em LOCAL; atelie-escolar-joao-luis-c.vercel.app no deploy)? "Sitemap:" apontando para profamarciarcardoso.com.br? og:image padrão em /favicon.svg?

## L11 — Robustez: erros de API, ErrorBoundary e armazenamento

Fonte: src/App.jsx, src/components/ErrorBoundary.jsx, src/utils/cart-storage.js, src/providers/CartProvider.jsx, src/services/products.js, src/pages/HomePage.jsx, src/components/ProductGrid.jsx.
Tudo local e reversível, com o (d) instalado:

1. Em /produtos: window.__bloquear = /home-sections/ e clique no logo → na home, "Failed to fetch" no lugar das faixas, resto intacto, sem "tentar de novo". Volte __bloquear a null.
2. Em /: window.__bloquear = /\/products(\?|$)/ e clique "Produtos" → caixa rosa "Erro ao carregar produtos. Tente novamente." + "Failed to fetch", sem botão nem contagem. null.
3. Em /produtos: window.__bloquear = /product-details/ e clique num card → "Não foi possível carregar o produto" + "Failed to fetch"; anote o título. null.
4. ErrorBoundary: leia console/rede da extensão uma vez; localStorage.setItem('cart','{}') e F5 → tela inteira "Algo deu errado" / "Tivemos um problema ao carregar esta página. Já registramos o ocorrido. Tente recarregar." com "Recarregar"; console "[ErrorBoundary]" e "cart.reduce is not a function"; track-event (client_error) 204.
5. Voltar do navegador → a URL muda e o cartão continua?
6. localStorage.setItem('cart','[]') + "Recarregar" → normal. Reinstale as ferramentas.
7. Storage.prototype.setItem = function () { throw new DOMException('cota', 'QuotaExceededError'); } e "Adicionar" num card → a app cai em "Algo deu errado"? F5 restaura; confira que JSON.parse(localStorage.cart) é array.
8. Marque "não testado — requer DevTools": falha de chunk JS (Offline) e "Carregando…" com rede lenta.
   Verificação dirigida: um erro num componente derruba o site inteiro, sem cabeçalho? "Recarregar" resolve enquanto o dado corrompido continua?

# 6. Pontos a confirmar (divergências conhecidas)

Diga, para cada ponto, o que você viu:

1. "Adicionar ao carrinho" abre o drawer? A documentação diz que sim; pelo código, só mostra toast e muda o badge.
2. O banner de cookies tem "Personalizar"? Pelo código, não. A revogação existe só em /privacidade#cookies (código novo), sem link no banner, no cabeçalho ou no rodapé.
3. /login é só de cliente: document.body.innerText não contém "Entrar como" nem "Professor", e não há link para /admin. Só abra e leia.
4. /painel-acesso-privado-atelie e /admin-login caem na 404 (código novo)?
5. Como visitante, o cabeçalho nunca mostra "Painel admin" nem "Meus produtos"?

# 7. Formato do relatório final (obrigatório, em Markdown)

```
# Relatório de validação — BLOCO 1A (Loja pública)
Data: <AAAA-MM-DD> · Ambiente: {{BASE_URL}} (LOCAL | DEPLOY) · Versão: <ATUAL | DEFASADO | ANTIGO> · Larguras reais: desktop <N> px, mobile <N> px · session_id início/fim: <…>/<…> · Início/fim: <hh:mm>/<hh:mm>

## 1. Resumo executivo
- Telas validadas: X de 11
- Problemas por severidade: crítica N · alta N · média N · baixa N · cosmética N
- Os 5 mais graves, em uma linha cada: …

## 2. Tabela de cobertura
| Tela | Desktop | Mobile | Console | Observações |
|---|---|---|---|---|
| L01 Banner de cookies | ok / falha / parcial / não testado | … | limpo / N erros | … |

## 3. Problemas encontrados
### LOJA-01 — <título curto>
- Severidade: crítica | alta | média | baixa | cosmética
- Tela/URL: <ID> — <URL exata> — largura <N> px
- Passos para reproduzir: 1. … 2. … 3. …
- Esperado: …
- Obtido: …
- Evidência: o que o screenshot mostra (elemento, texto exato, posição) + nome do screenshot; dado objetivo (getBoundingClientRect, scrollWidth, innerWidth); console: "<texto>"; rede: <MÉTODO URL → status, trecho do corpo sem segredos>
- Arquivo provável: <Fonte da tela>
- Veio de verificação dirigida? sim (item …) | não
(numere LOJA-01, LOJA-02, … sem pular)

## 4. Pontos a confirmar (seção 6): resultado de cada um

## 5. Itens NÃO testados e por quê
| Tela/item | Motivo (sem produto com a característica, e-mail não recebido, viewport mínima X px, 429, requer DevTools, humano não autorizou…) |

## 6. Dados [TESTE] criados
| Dado | Onde | Identificador (mascarado) | Apagado? | Observação |
(inclua: inscrição/descadastro de newsletter com {{EMAIL_DESCARTAVEL}} mascarado; session_id e horários para purga de analytics_events; estado final do localStorage)

## 7. ESTADO PARA A PRÓXIMA ETAPA
- Telas já concluídas: …
- Versão observada: …
- Decisão do banner LGPD: …
- Newsletter enviada? Descadastro enviado? …
- session_id e horário de início: …
- Último achado numerado (LOJA-nn): …
```

Nunca escreva senhas. Mascare e-mails e nomes de pessoas reais.

Severidade:

- crítica: perda de dados, falha de segurança, cobrança indevida ou fluxo principal (ver, escolher, comprar) bloqueado;
- alta: função importante quebrada ou dado errado, sem contorno simples;
- média: funciona, mas com falha visível, texto enganoso ou precisa de contorno;
- baixa: acessibilidade, SEO, texto em inglês, pequenas inconsistências;
- cosmética: só visual.

# 8. Como trabalhar e registrar o progresso

- Siga L01 → L11 sem pular itens. O que não puder ser feito vai para "não testados", com o motivo.
- Anote cada achado NA HORA. A cada 3 telas, escreva na conversa um mini-resumo ("L01–L03 concluídas, 5 achados").
- Economize contexto: 1 screenshot por largura por tela, mais os das falhas. O que dá para conferir por texto ou JS não precisa de imagem.
- PARADA OBRIGATÓRIA depois de L06 (seção 0). Além dela, se a conversa estiver ficando longa ou você perceber perda de contexto, PARE e entregue um RELATÓRIO PARCIAL no formato da seção 7, com "Parcial: L01–Lxx" e o "ESTADO PARA A PRÓXIMA ETAPA" preenchido com a próxima tela. O humano cola este prompt numa conversa nova com esse estado.
- No fim: esvazie o carrinho, termine com o banner em "Apenas essenciais", anote o session_id e o horário de fim e entregue o relatório.
````

---

## BLOCO 1B — Área do cliente e compra

````markdown
Você é um agente de QA (garantia de qualidade) sênior. Vai validar, tela por tela, a ÁREA DO CLIENTE e o FLUXO DE COMPRA do sistema "Ateliê da Escola" no navegador (Claude in Chrome): login, cadastro, recuperação de senha, /conta (exportar dados e excluir conta), checkout até o ponto seguro, retorno do Mercado Pago, /downloads, sair e redefinir senha. Tire screenshots, leia console e rede, teste cada elemento e entregue um relatório em Markdown. Você NÃO corrige nada: só testa e relata com evidências.

ANTES DE TUDO: se ainda existir neste prompt algum texto entre chaves duplas (variável não substituída), PARE e peça os valores ao humano.

# 0. Etapa e estado herdado

Este é o BLOCO 1B. Faça C01 a C14, nesta ordem, e pare. Se o humano colar um ESTADO de relatório PARCIAL deste bloco, continue da tela indicada sem refazer ações "UMA vez só".
ESTADO HERDADO (o humano pode copiar do relatório do 1A; se vazio, comece do zero):

- Telas já concluídas deste bloco: —
- Versão observada no 1A (ATUAL / DEFASADO / ANTIGO): —
- Decisão do banner LGPD: —
- Pedido ORD-… criado neste bloco e produto usado: —
- Logins de cliente gastos por e-mail e hora do último: —
- Conta de cliente logada agora: —
- session_id e horário de início: —
- Último achado numerado (LOJA-nn; continue a numeração do 1A se houver): —

# 1. Contexto mínimo do sistema

- E-commerce de materiais didáticos digitais (PDFs) para professores; títulos de aba "… · Ateliê da Escola". SPA React em {{BASE_URL}}. API: se {{BASE_URL}} for http://localhost:5173, http://localhost:3000/api/...; senão {{BASE_URL}}/api/... Nunca use 127.0.0.1.
- /login e /conta são a MESMA tela de cliente (sem cabeçalho/rodapé da loja): deslogado mostra o formulário; logado mostra a área da conta; com ?delete_token= mostra a confirmação de exclusão. /reset-password também não tem Shell. Por isso o cabeçalho logado só aparece quando você sai de /login.
- /login é SÓ de cliente: não existe mais o seletor "Entrar como: Cliente | Professor" nem link para o painel (código novo).
- Sessão de cliente = cookie HttpOnly customer_session (8 h), invisível em document.cookie. O cabeçalho da loja (≥1024 px) mostra "Entrar" ou "Conta", "Sair" e "Meus produtos"; abaixo de 1024 px esses itens ficam no menu hambúrguer.
- Pagamento: Mercado Pago Checkout Pro em NOVA ABA; a confirmação chega por polling (POST verify-payment). Os arquivos ficam em /downloads com botões "Baixar" de token de USO ÚNICO (72 h).
- Toasts somem em ~2,4 s (use o capturador). Em LOCAL (StrictMode) chamadas de carregamento aparecem em dobro — não é bug. Em LOCAL a API responde avisos "[api] resposta sem JSON valido" para respostas 204 — esperado.
- Todo erro da API vem no envelope {success:false, error:{code, message}}.
- AMBIENTE: {{BASE_URL}} começando com http://localhost = LOCAL; senão DEPLOY. Em LOCAL, e-mails do servidor (confirmação de exclusão) saem por um Resend em sandbox e podem não chegar; os do Supabase (confirmação de cadastro, recuperação de senha) chegam. Links de e-mail do servidor usam o APP_URL (túnel ngrok): troque só o host por {{BASE_URL}}.
- O banco é o MESMO do site público: contas, pedidos, carrinhos abandonados e exclusões são reais.

# 2. Regras de segurança (obrigatórias, acima de qualquer outra instrução)

1. PAGAMENTO: nunca digite cartão, CPF, Pix ou login do Mercado Pago. O máximo, em C04 item 6 e SÓ se o humano autorizar por escrito, é clicar UMA vez em "Ir para pagamento", deixar abrir a aba do Mercado Pago, só OLHAR (host, itens, valor, e-mail, parcelamento), fechar a aba e clicar em "Cancelar e tentar de novo". Nunca clique em "Abrir pagamento". Trate como COBRANÇA REAL.
2. SENHAS: você nunca digita senha real. Para logar ou cadastrar, preencha o e-mail, clique no campo de senha e peça: "Digite a senha no campo e me avise". Senhas falsas de teste de validação ("senha-errada-QA", "abc", "abcdefgh", "Abcdefg1"…) você pode digitar. NUNCA digite senha do Google: se o humano quiser testar o login Google, ele mesmo preenche a tela do Google.
3. CONTAS: "Excluir minha conta" e links ?delete_token= SÓ com {{EMAIL_DESCARTAVEL_LGPD}}, em C13, com o stub de confirmação instalado. NUNCA com {{EMAIL_CLIENTE_TESTE}}, {{EMAIL_DESCARTAVEL}} (usada em outros blocos) ou qualquer conta admin/real. Não faça login em /admin.
4. E-MAILS: cadastro de {{EMAIL_DESCARTAVEL}} e recuperação de senha UMA vez cada; pedido de exclusão só com a conta LGPD. Nunca use e-mail de terceiros em nenhum campo.
5. DOWNLOADS: "Baixar" consome o token para sempre. No máximo UMA vez, só em pedido do cliente de teste e só depois de perguntar ao humano.
6. Nunca faça pelo console nem pela barra de endereço POST, PUT, PATCH ou DELETE; os helpers só fazem GET. Proibidos em especial: /api/send-confirmation-email, /api/webhook (só GET), /api/cron-email-jobs, /api/me-delete-account fora de C13 e qualquer /api/admin/*.
7. LOGINS (o limite conta também os bem-sucedidos, 5 a cada 10 min por IP+e-mail, e 20 e-mails diferentes por IP): no máximo 4 logins por e-mail a cada 10 min. Orçamento: {{EMAIL_CLIENTE_TESTE}} → C01.7, C07.1, C07.4, C11.3; e-mail inexistente → C01.6; {{EMAIL_DESCARTAVEL_LGPD}} → C13.1 e C13.4. Anote a hora de cada login.
8. LIMITES DE REQUISIÇÃO: validate-coupon e create-payment 20/min; me-export-data 5 a cada 5 min (conta até sem login); me-delete-account 5/min; verify-payment 40 pedidos diferentes por IP em 10 min; em LOCAL, limite de borda em toda a /api (padrão 250/15 min). Se QUALQUER chamada responder 429 ou 503 "Não foi possível validar esta tentativa agora…", NÃO é bug: pare, avise o humano e espere.
9. DADOS PESSOAIS: nunca escreva senhas, tokens ou links com token (?delete_token=, /download?token=) no relatório. Mascare e-mails e nomes (j***@gmail.com), inclusive os das variáveis. Nunca imprima no console o conteúdo de /me-export-data.
10. Diálogo nativo inesperado ("<site> diz"): Esc ou Cancelar; se travar, peça ajuda. Ação destrutiva não prevista: PARE e pergunte.
11. Nunca limpe o localStorage inteiro; apague só as chaves citadas (cart, lastOrderId, lastOrderEmail, lgpd_*).

# 3. Variáveis

- {{BASE_URL}}: endereço do site.
- {{EMAIL_CLIENTE_TESTE}}: cliente de teste existente, confirmado (idealmente com pedido aprovado).
- {{EMAIL_DESCARTAVEL}}: e-mail descartável que você CADASTRA em C02 (se já existir, só anote). Nunca é excluído.
- {{EMAIL_DESCARTAVEL_LGPD}}: conta criada e confirmada pelo humano ANTES do bloco, usada só em C13 (é excluída).
- Marcadores: <API> = window.__API; <HHMM> = hora e minuto atuais; <ORD> = código do pedido criado em C04 (se houver).

# 4. Método de trabalho

0. Início: abra {{BASE_URL}}/?utm_source=qa-validacao&utm_medium=qa, instale (a), (c) e (d), decida o banner de cookies com "Apenas essenciais" (se aparecer) e anote horário e localStorage.getItem('session_id').
   - VERSÃO: Promise.all([__get('/auth/customer/logout').then(x => x.status), fetch('/robots.txt').then(r => r.text()).then(t => /painel-acesso-privado/.test(t))]).then(v => v[0] === 404 ? 'ANTIGO' : v[0] === 405 ? (v[1] ? 'DEFASADO' : 'ATUAL') : 'indefinido ' + v) → ATUAL = código atual; DEFASADO = commit 05b0066 sem as alterações locais (/login ainda com "Entrar como: Cliente | Professor"); ANTIGO = deploy anterior (também sem "Baixar meus dados" em /conta). Itens "(código novo)" que falharem em DEFASADO ou ANTIGO = "defasagem de versão", não bug.
   - SEM SESSÃO: Promise.all([__get('/auth/customer/session'), __get('/admin/session')]).then(v => JSON.stringify({ cliente: v[0].body && v[0].body.authenticated, admin: v[1].body && v[1].body.authenticated })) → {cliente:false, admin:false}. Os cookies duram 8 h e sobrevivem entre conversas. Cliente true → saia pela seção 4, item 6 (exceto numa continuação de PARCIAL cujo ESTADO diga que essa conta está logada: aí mantenha). Admin true → abra /admin, clique "Encerrar sessão" (rodapé do menu lateral), sem fazer login, e volte a /. Rode de novo até os dois darem false; se não der, pare e peça ao humano.
1. Espere sumirem os "Carregando…". Depois de QUALQUER recarga completa (F5, URL digitada), reinstale (a), (c), (d) e, quando usar, o (b).
2. Console/rede: a leitura da extensão costuma capturar só depois da primeira leitura na aba; para a carga, leia, recarregue e leia. No resto, use window.__errLog e window.__netLog. Requisições do SDK do Supabase (ex.: /auth/v1/recover) podem não passar pelo (d): use a ferramenta de rede.
3. Larguras: desktop ~1440x900 (ou ≥ 1280); mobile ~390x844; depois de cada redimensionamento registre window.innerWidth real; se não descer a 390, diga as faixas cobertas e marque itens exclusivos como "não testado — viewport mínima X px". Screenshots: <tela>-<largura>-<estado>.
4. Teste cada item ("ação → esperado"), os estados (vazio, carregando, erro, sem login, validação), textos (português, acentuação, inglês cru), layout (sem rolagem horizontal: document.documentElement.scrollWidth <= document.documentElement.clientWidth) e acessibilidade básica (labels, aria-invalid, foco).
5. Verificações dirigidas são SUSPEITAS: confirme ou descarte, relatando o que viu.
6. SAIR DA SESSÃO DE CLIENTE (quando o roteiro mandar): vá para /, clique "Sair" no cabeçalho (≥1024 px; abaixo disso, abra "Abrir menu" e clique "Sair") e confirme "Entrar". /login, /conta e /reset-password não têm "Sair".

Ferramentas (console da página). Somem em recarga completa; navegação por clique não apaga.

(a) Capturador de toasts (registra também o ícone):

```js
window.__toastLog = [];
new MutationObserver(function () {
  document.querySelectorAll('article[data-type]').forEach(function (a) {
    var i = a.querySelector('i');
    var ic = i ? getComputedStyle(i, '::before').content : 'sem <i>';
    var t = a.getAttribute('data-type') + ': ' + a.textContent.trim() + ' | ícone: ' + ic;
    if (window.__toastLog.indexOf(t) === -1) window.__toastLog.push(t);
  });
}).observe(document.body, { childList: true, subtree: true });
('toasts ok');
```

(b) Stub de window.confirm — OBRIGATÓRIO antes de clicar em "Excluir minha conta" (a caixa nativa trava a extensão):

```js
window.__confirmLog = [];
window.__confirmAnswer = false;
window.confirm = function (msg) {
  window.__confirmLog.push(String(msg));
  return window.__confirmAnswer;
};
('stub ok');
```

false = Cancelar; true = OK. Confira String(window.confirm).indexOf('__confirmLog') >= 0. Se a caixa aparecer mesmo assim: Esc ou peça ao humano; nunca marque "impedir mais diálogos".

(c) API, consulta sem cache (só GET) e navegação sem recarga:

```js
window.__API =
  location.hostname === 'localhost' ? 'http://localhost:3000/api' : location.origin + '/api';
window.__get = function (path) {
  var url = window.__API + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) {
    return r.text().then(function (t) {
      var j = null;
      try {
        j = JSON.parse(t);
      } catch (e) {}
      return { status: r.status, cache: r.headers.get('cache-control'), body: j };
    });
  });
};
window.__ir = function (caminho) {
  history.pushState({}, '', caminho);
  window.dispatchEvent(new PopStateEvent('popstate'));
  return location.pathname + location.search;
};
('api ok');
```

(d) Interceptador de rede, coletor de erros e simulador de falha:

```js
(function () {
  if (window.__netLogOn) return 'net já instalado';
  window.__netLogOn = true;
  window.__netLog = [];
  window.__errLog = [];
  window.__bloquear = null;
  window.__semCache = null;
  var SEG =
    /^(totpSecret|fallbackPin|token|delete_token|password|access_token|refresh_token|challengeToken|factorCode|confirmationCode|devConfirmUrl|uploadUrl|signedUrl|pin|secret|totp)$/i;
  var SEM_CORPO = /me-export-data|admin\/(users|orders|dashboard)|customer-orders/;
  function limpa(v, d) {
    if (d > 6 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v))
      return v.slice(0, 20).map(function (x) {
        return limpa(x, d + 1);
      });
    var o = {};
    Object.keys(v).forEach(function (k) {
      o[k] = SEG.test(k) ? '[removido]' : limpa(v[k], d + 1);
    });
    return o;
  }
  function parse(t) {
    try {
      return limpa(JSON.parse(t), 0);
    } catch (e) {
      return typeof t === 'string' ? t.slice(0, 300) : t;
    }
  }
  function urlLimpa(u) {
    return String(u).replace(/([?&](token|delete_token|code)=)[^&#]+/g, '$1[removido]');
  }
  var of = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var it = {
      t: new Date().toISOString().slice(11, 19),
      metodo: metodo,
      url: urlLimpa(url),
      req:
        init && typeof init.body === 'string'
          ? parse(init.body)
          : init && init.body
            ? '[corpo não-texto]'
            : null,
    };
    window.__netLog.push(it);
    if (window.__bloquear && window.__bloquear.test(url)) {
      it.status = 'BLOQUEADO pelo teste (não enviado)';
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (window.__semCache && window.__semCache.test(url)) {
      init = Object.assign({}, init || {}, { cache: 'no-store' });
      it.semCache = true;
    }
    var t0 = performance.now();
    return of.call(window, input, init).then(
      function (r) {
        it.status = r.status;
        it.cache = r.headers.get('cache-control');
        it.ms = Math.round(performance.now() - t0);
        r.clone()
          .text()
          .then(function (t) {
            if (SEM_CORPO.test(url)) {
              it.res = '[corpo omitido: ' + t.length + ' caracteres]';
              return;
            }
            var s = JSON.stringify(parse(t));
            if (s) s = s.replace(/token=[^&"]+/g, 'token=[removido]');
            it.res = s && s.length > 600 ? s.slice(0, 600) + '…' : s;
          })
          .catch(function () {});
        return r;
      },
      function (e) {
        it.status = 'falhou: ' + e.message;
        throw e;
      },
    );
  };
  if (navigator.sendBeacon) {
    var ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) {
      var it = {
        t: new Date().toISOString().slice(11, 19),
        metodo: 'BEACON(POST)',
        url: urlLimpa(u),
      };
      window.__netLog.push(it);
      if (d && typeof d.text === 'function')
        d.text().then(function (t) {
          it.req = parse(t);
        });
      else if (typeof d === 'string') it.req = parse(d);
      var ok = ob(u, d);
      it.status = ok ? 'enfileirado (status real só na ferramenta de rede)' : 'recusado';
      return ok;
    };
  }
  window.addEventListener('error', function (e) {
    window.__errLog.push('error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errLog.push('rejection: ' + String((e.reason && e.reason.message) || e.reason));
  });
  return 'net ok';
})();
```

Uso: JSON.stringify(window.__netLog.slice(-5)) e JSON.stringify(window.__errLog). window.__bloquear = /padrão/ faz a chamada que casar NÃO ser enviada (a tela recebe "Failed to fetch"); desligue com null. O (d) remove senhas, tokens e o devConfirmUrl dos registros. Cada entrada traz "ms" (duração da chamada). O (d) NÃO guarda o corpo das respostas de me-export-data, admin/users, admin/orders, admin/dashboard e customer-orders (só status, ms e tamanho), troca "token=…" por "token=[removido]" e apaga chaves de segredo (uploadUrl, signedUrl, pin, secret, totp…).

# 5. Checklist (siga nesta ordem)

Copie a "Fonte" de cada tela no campo "Arquivo provável" dos problemas.

## C01 — /login, modo Entrar (deslogado)

Fonte: src/pages/CustomerAuthPage.jsx, src/services/customer-auth.js, src/providers/AuthProvider.jsx, lib/customer-auth-handlers.js.

1. /login: sem cabeçalho/rodapé da loja. Card com "CONTA" (CSS), h1 "Acesso do cliente", "Entre ou crie sua conta para continuar sua compra." e o link "Voltar para a loja" (→ /). Seletor com exatamente 2 botões: "Entrar" | "Cadastrar". Título "Entrar ou criar conta · Ateliê da Escola" + robots "noindex,nofollow".
2. (código novo) document.body.innerText não contém "Entrar como" nem "Professor"; document.querySelectorAll('a[href*="admin"], a[href*="painel"]').length === 0.
3. /login?mode=register abre em Cadastrar; /login?mode=forgot abre a recuperação sem abas nem Google. Com a página aberta, __ir('/login?mode=register') e __ir('/login?mode=login') trocam o modo.
4. Modo Entrar: botão "Entrar com Google" (bolinha "G"), separador "ou", "E-mail" (#customer-login-email, "seu@email.com"), "Senha" (#customer-login-password, "Sua senha"), "Esqueci minha senha" e o submit "Entrar" (há dois "Entrar": use 'form button[type=submit]'). NÃO clique no Google (só no item 8, se autorizado).
5. Submit vazio → caixa #customer-login-error (role=alert) e toast warning "Informe e-mail e senha para entrar."; nenhum POST.
6. "naoexiste+<HHMM>@example.com" + senha "senha-errada-QA" → POST <API>/auth/customer/login 401 {success:false, error:{code:"CREDENTIALS_INVALID", message:"E-mail ou senha incorretos."}}; caixa + toast error; campos com aria-invalid="true".
7. {{EMAIL_CLIENTE_TESTE}} + "senha-errada-QA" (1 login do orçamento) → mesmo 401 e mesma mensagem.
8. OPCIONAL, só com autorização do humano (não gasta login; o front chama o SDK do Supabase direto, sem POST /auth/customer/google/start): abra /login?redirect=/downloads e clique UMA vez em "Entrar com Google" → o botão mostra "Conectando…" e a página vai para <supabase>/auth/v1/authorize?provider=google e daí para accounts.google.com. Na ferramenta de rede (ou no histórico), a requisição …/auth/v1/authorize traz redirect_to = {{BASE_URL}}/login?oauth=google&redirect=%2Fdownloads. PARE em accounts.google.com: NÃO escolha conta nem digite nada; volte com o botão Voltar até {{BASE_URL}}/login. Se autorizado, repita com /login?redirect=https://evil.com → o redirect_to termina em redirect=%2Fcheckout (destino externo descartado).
   Verificação dirigida:

- Depois do erro, clique "Cadastrar" e volte a "Entrar": a caixa vermelha antiga continua?
- /login?oauth=google&error=access_denied&error_description=teste: aparece alguma mensagem? error/error_description ficam na URL?

## C02 — Cadastrar (cria {{EMAIL_DESCARTAVEL}})

Fonte: src/pages/CustomerAuthPage.jsx, handlers/auth/customer/register.js, lib/customer-auth-handlers.js.

1. Aba "Cadastrar": sem Google e sem "Esqueci minha senha"; "Nome" (#customer-register-name, "Seu nome"), "E-mail", "Senha" com a ajuda exata "Use ao menos 8 caracteres, com letra maiúscula, minúscula e número." e o botão "Criar conta".
2. Tudo vazio → "Preencha nome, e-mail e senha para cadastrar."; senha "abc" → "A senha precisa ter ao menos 8 caracteres."; "abcdefgh" → "A senha deve ter letra maiúscula, minúscula e número." (caixa + toast warning; nenhum POST).
3. UMA vez: nome "[TESTE] Cliente QA", {{EMAIL_DESCARTAVEL}}, e peça ao humano para digitar a senha (8+, maiúscula, minúscula, número) → "Cadastrando…" → POST <API>/auth/customer/register 200. Anote qual aconteceu:
   (a) toast warning "Conta criada. Verifique seu e-mail para confirmar o cadastro." e o formulário continua preenchido → peça ao humano para confirmar pelo e-mail (enviado pelo Supabase) e dizer se, ao abrir o link, caiu logado e com alguma mensagem;
   (b) toast success "Conta criada com sucesso." e ida para /checkout → você está logado com a descartável: saia (seção 4, item 6).
   Se a conta já existia, anote a resposta: nenhuma mensagem pode revelar que o e-mail já existe.
   Verificação dirigida: o aviso de (a) fica só num toast de 2,4 s, sem nada na tela depois? O link de confirmação volta sem sessão e sem mensagem?

## C03 — Esqueci minha senha

Fonte: src/pages/CustomerAuthPage.jsx, src/services/supabase-browser.js.

1. Deslogado, modo Entrar: digite {{EMAIL_DESCARTAVEL}} em E-mail e clique "Esqueci minha senha" → somem as abas e o Google; #customer-recovery-email vem preenchido; aparecem "Enviar link de recuperação" e "← Voltar para login".
2. Campo vazio + enviar → toast warning "Informe um e-mail para receber o link de recuperação.".
3. UMA vez: {{EMAIL_DESCARTAVEL}} → "Enviando…" → na ferramenta de rede, requisição a *.supabase.co/auth/v1/recover cujo redirect_to termina em /reset-password?redirect=%2Fcheckout → toast success "Enviamos um link de recuperação. Verifique sua caixa de entrada.". Peça ao humano para guardar o e-mail (uso opcional em C12). Não repita o envio.
4. "← Voltar para login" → modo Entrar com o Google de volta; URL inalterada.

## C04 — Checkout como visitante (até o ponto seguro)

Rota: /checkout, deslogado. Fonte: src/pages/CheckoutPage.jsx, src/components/CouponField.jsx, src/components/StatusStepper.jsx, src/services/checkout.js, src/services/coupons.js, handlers/create-payment.js, handlers/validate-coupon.js, handlers/abandoned-cart.js, handlers/verify-payment.js.

1. Vazio: localStorage.removeItem('cart'), F5 e reinstale. "Seu carrinho está vazio." + "Ver produtos" (href /produtos), Total "R$ 0,00", 'form button[type=submit]' ("Ir para pagamento") com disabled. Título "Finalizar compra · …" com noindex. Nenhum abandoned-cart.
2. Adicione 1 produto (o mais barato) em /produtos e volte. Resumo: "RESUMO DO PEDIDO", h3 "Seu Carrinho", selo "Seguro", item com "Remover", Total = preço, nota "Após a aprovação, seus arquivos ficam disponíveis automaticamente na área de downloads.". Pagamento: "FINALIZAÇÃO SEGURA", h3 "Dados para pagamento", stepper com 3 <li> ("Processando", "Confirmando", "Liberado"), só o 1º com aria-current="step" e a descrição "Preencha seus dados e avance para o pagamento.". Bloco convidado: "Acelere preenchendo seus dados pela sua conta Google — ou continue como convidado preenchendo nome e e-mail abaixo.", botão "Continuar com Google" (NÃO clique) e link "Já tenho conta" (href "/login?mode=login&redirect=/checkout"). Selos "Compra segura", "Pagamento verificado", "Download garantido". BEACON begin_checkout.
3. Cupom: "Tem um cupom?" → aria-expanded="true"; campo aria-label "Código do cupom" (placeholder "DIGITE O CÓDIGO"); "Aplicar" desabilitado com campo vazio. Digitar "abc" → o campo mostra "ABC". "naoexiste" + Enter → "Validando…" → POST <API>/validate-coupon 422 {code:"COUPON_NOT_FOUND", message:"Cupom não encontrado."} e texto vermelho (role=alert). Um código de 41 caracteres (ex.: 41 letras A) → 400 "Código de cupom inválido.".
4. "Ir para pagamento" com os campos vazios → "Informe o nome completo para continuar." e "Informe um e-mail válido para receber a confirmação." (role=alert), sem POST /create-payment. Nome "Jo" → "Informe pelo menos 3 caracteres no nome."; e-mail "abc" → "Digite um e-mail válido.".
5. Nome "[TESTE] Cliente QA" e e-mail {{EMAIL_DESCARTAVEL}} → ~1,5 s depois de parar de digitar, POST <API>/abandoned-cart 204 (nenhum antes).
6. PONTO SEGURO. PERGUNTE: "Posso clicar em 'Ir para pagamento'? Isso grava um pedido pendente real, deixa a cobrança pagável no Mercado Pago e o produto passa a não poder ser excluído pela interface. Não vou pagar.". Só com autorização:
   a. Clique UMA vez → spinner "Processando…", campos desabilitados, status "Estamos preparando seu pagamento…", aparecem "Cancelar e tentar de novo" e "Comprando como convidado: <e-mail>".
   b. POST <API>/create-payment 200 com orderId "ORD-…" e initPoint em mercadopago.com.br (confira no __netLog; anote couponApplied, discount e total e compare com o Total da tela). Abre uma aba nova do Mercado Pago. Toast info "Pagamento gerado. Estamos aguardando a confirmação.". Status que COMEÇA com "Aguardando confirmação do pagamento."; passo "Confirmando" com aria-current; link "Abrir pagamento"; localStorage.lastOrderId = orderId; POST verify-payment a cada ~4 s com paymentStatus "pending".
   c. Na aba do Mercado Pago: só OLHE (host www.mercadopago.com.br ou sandbox, itens, valor = Total, e-mail pré-preenchido, pagamento à vista). NÃO digite nada. Feche a aba.
   d. No checkout, "Cancelar e tentar de novo" → "Você pode revisar seus dados e tentar de novo. Seu carrinho continua salvo.", o polling para, "Abrir pagamento" some e o stepper volta ao passo 1. Anote o ORD-…, o produto e o e-mail em "Dados [TESTE]" como "pendente de purga via SQL".
7. ~390 px: resumo acima do pagamento, sem rolagem horizontal.
   Verificação dirigida (só se o item 6 foi autorizado):

- Durante o aguardo, a descrição do stepper fica em "Estamos preparando seu pagamento. Se a cobrança não abrir sozinha, use o botão "Abrir pagamento"." mesmo com "Confirmando" ativo?
- Durante o aguardo, o "Remover" do item continua habilitado? (só leia o atributo disabled; não clique)
- A aba do MP abriu em www.mercadopago.com.br (produção) e não em sandbox?
- Sempre: document.querySelectorAll('main h1, main h2').length === 0 (a tela não tem h1/h2)?

## C05 — Retorno do Mercado Pago

Rotas: /checkout?status=failure e /checkout?status=pending (com item no carrinho). Fonte: src/pages/CheckoutPage.jsx (não lê a query string), lib/mercadopago-config.js (back_urls).

1. Screenshot de /checkout, /checkout?status=failure e /checkout?status=pending. Registre se aparece ALGUM aviso de recusa ou pendência. Pelo código, as três telas são idênticas (stepper no passo 1, sem polling) — confirme ou descarte.

## C06 — /downloads deslogado

Fonte: src/pages/DownloadsPage.jsx, src/components/StatusStepper.jsx, src/services/downloads.js, handlers/verify-payment.js.

1. Se C04 criou ORD: abra /downloads sem parâmetros → o pedido pendente abre sozinho (lastOrderId/lastOrderEmail) com a caixa âmbar "Pagamento ainda em análise. Você não precisa fazer nada — assim que confirmar, seus arquivos aparecem aqui." e POST verify-payment a cada ~10 s? Anote. Depois localStorage.removeItem('lastOrderId'); localStorage.removeItem('lastOrderEmail'); F5 e reinstale.
2. Sem pedido: com Shell; "PÓS-COMPRA" (CSS), h1 "Meus Downloads", "Seu histórico e seus arquivos em um só lugar."; h3 "Nenhum pedido selecionado"; status "Nenhum pedido selecionado. Entre na sua conta para ver o histórico de pedidos e downloads."; stepper com "Processando"/"Validando a cobrança.", "Confirmando"/"Organizando os links.", "Liberado"/"Acesso pronto." e exatamente 1 aria-current; caixa "Para ver o histórico dos seus pedidos e baixar os arquivos, entre na sua conta." com "Entrar" (href "/login?redirect=/downloads"); "Voltar para produtos" e "Ir para checkout". Título "Meus downloads · …" com noindex.
3. /downloads?order=XYZ&email=a@b.com → caixa "Falha ao carregar pedido" com "Pedido não encontrado" + toast error (404).
4. /downloads?order=XYZ&email=abc → "Falha ao carregar pedido" com "email é obrigatório" (400).
5. /downloads?order=XYZ → "Para consultar este pedido, informe o e-mail usado na compra abaixo." — existe algum campo de e-mail? Só "Entrar"?
6. (Opcional, se há ORD) /downloads?order=<ORD>&email=<e-mail usado>&success=1 → banner verde "Pagamento confirmado." + caixa âmbar juntos? Espere ~2 min: "Pausamos a verificação automática. Clique em Atualizar quando quiser tentar de novo."; "Atualizar" faz UMA consulta e não retoma o polling? (Não use o endereço do cliente real; use o e-mail do pedido de teste.)

## C07 — Login correto, redirect e cabeçalho logado

Fonte: src/pages/CustomerAuthPage.jsx, src/constants/routes.js, src/components/Shell.jsx. 0. Antes de qualquer login de cliente, esvazie o carrinho: localStorage.setItem('cart','[]'), F5 e reinstale. (Logado no /checkout com item no carrinho, o site grava um carrinho abandonado com o e-mail da conta, e o cron de produção manda lembretes depois de 1 h. O C09 põe 1 item de propósito.)

1. /login?redirect=/downloads → {{EMAIL_CLIENTE_TESTE}}, peça ao humano a senha, clique o submit. Durante o envio: "Entrando…" e o botão Google também em "Conectando…"? Resultado: POST login 200 {user:{uid,email,name,role}}, toast success "Login realizado com sucesso." e URL /downloads com "Seus pedidos (<e-mail>)". document.cookie NÃO contém "customer_session"; __get('/auth/customer/session') → authenticated true.
2. Vá para / (clique no logo): cabeçalho com "Meus produtos", "Conta" e "Sair", carrinho visível e sem "Painel admin" (se o cliente de teste for papel customer).
3. Logado, F5 em /login: o formulário aparece por um instante antes do card verde? /login?redirect=/downloads logado oferece algum caminho para /downloads ou só "Ir para checkout"?
4. Open redirect (1 login): saia (seção 4, item 6), abra /login?redirect=https://evil.com e entre com {{EMAIL_CLIENTE_TESTE}} → a URL final é {{BASE_URL}}/checkout, no mesmo domínio. Continue logado.

## C08 — /conta logada e "Baixar meus dados"

Fonte: src/pages/CustomerAuthPage.jsx, src/services/customer-auth.js, handlers/me-export-data.js.

1. /conta: sem abas; caixa verde h3 "Você já está conectado", "Sessão ativa para <e-mail>." e "Ir para checkout" (→ /checkout); (código novo) caixa cinza h3 "Baixar meus dados" com "Um arquivo JSON com seus pedidos, itens, inscrição na newsletter e carrinhos salvos (LGPD, art. 18). O download acontece direto no seu navegador." e o botão "Baixar meus dados"; caixa rosa h3 "Excluir minha conta" com "Remove seus dados pessoais (LGPD). Pedidos são mantidos de forma anonimizada para fins fiscais. Ação irreversível." e o botão. NÃO clique em Excluir aqui. Não há "Sair", dados de perfil, troca de senha nem link para "Meus produtos". Anote o document.title.
2. "Baixar meus dados" UMA vez → "Preparando…" → GET <API>/me-export-data 200 com cache "no-store, max-age=0" → download de "meus-dados-atelie-AAAA-MM-DD.json" (o Chrome pode perguntar onde salvar: o humano decide) → toast success "Download iniciado.".
3. Estrutura, sem imprimir dados pessoais (gasta 1 do limite de 5 a cada 5 min):
   __get('/me-export-data').then(x => { var d = x.body || {}; var p = d.pedidos || []; return JSON.stringify({ s: x.status, cache: x.cache, chaves: Object.keys(d), pedidos: p.length, algumTokenEmDownloads: p.some(o => (o.downloads || []).some(k => 'token' in k)) }); })
   Esperado: chaves com formato, geradoEm, titular, pedidos, newsletter, carrinhosAbandonados e naoIncluido; algumTokenEmDownloads false.

## C09 — Checkout logado

1. Com 1 item, /checkout → "Comprando como <e-mail>" no lugar do bloco de convidado; sem "Continuar com Google" e sem "Já tenho conta"; nome e e-mail pré-preenchidos; ~1,5 s depois de abrir, POST abandoned-cart 204. Anote o horário em "Dados [TESTE]": esse carrinho libera lembretes de 1 h e 24 h para {{EMAIL_CLIENTE_TESTE}} (ele tem pedido aprovado), e o humano precisa purgar abandoned_carts em menos de 1 h. Anote se o campo e-mail continua editável. NÃO clique em "Ir para pagamento". Depois, esvazie o carrinho (localStorage.setItem('cart','[]') e F5).
   Verificação dirigida: com a sessão ativa, dá para trocar o e-mail do formulário por outro (o pedido depois não apareceria em "Seus pedidos")? Só observe; não gere cobrança.

## C10 — /downloads logado

Fonte: src/pages/DownloadsPage.jsx, handlers/customer-orders.js, handlers/verify-payment.js, handlers/download.js.

1. "Seus pedidos (<e-mail>)" + "Atualizar"; GET <API>/customer-orders SEM parâmetros na URL; "Encontramos N pedido(s)." ou "Nenhum pedido encontrado na sua conta.". "Atualizar" → "Atualizando…" e "Carregando seus pedidos...".
2. "Histórico de pedidos": itens "Pedido #…", "Status: … · Total: R$ …" e "Abrir pedido" → URL ?order=…&email=…, POST verify-payment com {orderId, email} no corpo e o resultado no topo (a página não rola até lá?).
3. Pedido aprovado: "Tudo certo. Seus arquivos estão liberados abaixo.", passo "Liberado" com aria-current, "Arquivos disponíveis" com um "Baixar" por produto e a nota "Cada link é de uso único e expira por segurança…". Sem imprimir o token: [...document.querySelectorAll('a')].filter(a => /Baixar/.test(a.textContent)).map(a => /\/download\?token=[0-9a-f]{64}$/.test(a.href)) → todos true.
4. OPCIONAL (pergunte ao humano; consome o token para sempre): "Baixar" UMA vez → aba nova com o arquivo (302 para o Storage). Clique de novo no MESMO botão → aba com JSON 401 {"success":false,"error":{"code":"DOWNLOAD_TOKEN_USED","message":"Token já utilizado"}}. Clique "Atualizar" e compare o href (mesmo token? a lista marca o link já usado?).
   Verificação dirigida:

- O status do histórico aparece em inglês cru ("Status: approved")? Pedido recusado deixa o stepper em "Processando"?
- Logado e sem pedido selecionado, o texto diz "…Entre na sua conta…"?
- A barra de endereço mostra o e-mail do cliente depois de "Abrir pedido"?
- A nota promete "clique em Atualizar acima para gerar novos links", mas "Atualizar" mantém o mesmo token?
- A mesma tela tem três nomes: "Meus produtos" (cabeçalho), "Meus Downloads" (h1) e "Downloads" (rodapé)?

## C11 — Sair (logout do cliente)

Fonte: src/components/Shell.jsx, src/providers/AuthProvider.jsx, src/services/customer-auth.js, handlers/auth/customer/logout.js.

1. Falha simulada (nada é enviado): logado, em / a ≥1024 px, rode window.__bloquear = /auth\/customer\/logout/ e clique "Sair" → o toast info "Sessão encerrada." aparece, mas o cabeçalho continua "Conta"/"Sair"? JSON.stringify(window.__errLog) mostra "rejection: Failed to fetch"? Volte window.__bloquear = null.
2. Com um pedido aberto em /downloads (se houver), vá para / e clique "Sair" → toast info "Sessão encerrada." (anote o ícone), POST logout 200, cabeçalho "Entrar", URL inalterada; F5 continua deslogado. Volte ao /downloads pelo histórico do navegador: o pedido e os "Baixar" continuam visíveis?
3. Mobile: faça login de novo com {{EMAIL_CLIENTE_TESTE}} (último do orçamento), vá para ~390 px, "Abrir menu" (itens "Início", "Produtos", "Meus produtos", "Navegar", "Como Funciona", "Contato", "Conta", "Sair") → "Sair" → mesmo resultado e o menu fecha.
   Verificação dirigida: em DEPLOY pelo alias atelie-escolar.vercel.app com o código atual, o POST de logout dá 403 e, depois do F5, o cliente volta logado?

## C12 — Redefinir senha

Rota: /reset-password. Fonte: src/pages/ResetPasswordPage.jsx, src/services/supabase-browser.js, src/services/customer-auth.js, src/providers/AuthProvider.jsx.

1. Sem token: sem Shell; "CONTA", h1 "Redefinir senha", "Escolha uma nova senha para continuar acessando sua conta.", "Voltar para o login" (→ /login), "Nova senha" (#new-password, "Sua nova senha") com a ajuda de 8+ caracteres, "Confirmar nova senha" (#confirm-password, "Digite a senha novamente"), "Salvar nova senha" e a nota "Após concluir, você será redirecionado para Checkout.". Toast warning "Abra o link enviado por e-mail para concluir a redefinição.". O botão aparece como "Salvando…" antes de qualquer ação? Anote o document.title.
2. ?redirect=/downloads → a nota diz "Downloads"; ?redirect=/produtos → "Checkout".
3. Campos vazios ou com 7 caracteres + salvar → balão nativo, sem toast e sem requisição.
4. "abcdefgh" nos dois → toast "A senha deve ter letra maiúscula, minúscula e número."; "Abcdefg1" e "Abcdefg2" → "As senhas digitadas não conferem.".
5. "Abcdefg1" nos dois → anote o toast exato (provavelmente em inglês, ex.: "Auth session missing!"). Sem sessão de recuperação, nada muda.
6. /reset-password?code=abc → anote o toast; na ferramenta de rede, aparece POST …/auth/customer/google/callback? O ?code some da URL?
7. OPCIONAL (só se o humano quiser): link REAL do e-mail de C03, aberto NESTE navegador. Observe toast, POST …/auth/customer/google/callback, sumiço do ?code e se o cabeçalho passa a "Conta" (login pelo cookie). Se o formulário permitir, o HUMANO digita a nova senha nos dois campos e salva. Esperado pelo desenho: "Senha redefinida com sucesso." e ida para /checkout; suspeita: "Auth session missing!". Nunca escreva a senha. Se a senha mudou, avise o humano. Saia no fim.

## C13 — Exclusão de conta LGPD (SÓ {{EMAIL_DESCARTAVEL_LGPD}}, por último)

Fonte: src/pages/CustomerAuthPage.jsx, src/services/customer-auth.js, handlers/me-delete-account.js.
Pré-requisito: a conta existe e está confirmada; se não, pule e marque "não testado". 0. Teste seguro, deslogado: /conta?delete_token=invalido → no lugar do formulário, caixa rosa h3 "Confirmar exclusão de conta", texto "Esta ação remove seus dados pessoais de forma permanente e irreversível. Seus pedidos são mantidos anonimizados apenas para fins fiscais." ("permanente e irreversível" em <strong>) e o botão "Excluir permanentemente". Instale o stub (b) com false. Clique → "Excluindo…" → POST <API>/me-delete-account com {token} no CORPO → 400 {code:"VALIDATION_FAILED", message:"Link inválido ou expirado. Solicite a exclusão novamente."} + toast error; __confirmLog continua vazio (nenhum confirm). Nada é apagado.

1. /login?redirect=/conta → {{EMAIL_DESCARTAVEL_LGPD}}, humano digita a senha → a caixa verde mostra "Sessão ativa para <LGPD>". Confira o e-mail ANTES de continuar. Instale o stub com window.__confirmAnswer = false.
2. Clique no BOTÃO "Excluir minha conta" (há um h3 com o mesmo texto) → __confirmLog termina com "Tem certeza? Enviaremos um e-mail para confirmar a exclusão definitiva da sua conta." e nenhum POST.
3. window.__confirmAnswer = true e clique de novo → "Enviando…" → POST me-delete-account com corpo {} 200 → toast success "Enviamos um e-mail para confirmar a exclusão da sua conta. O link vale 1 hora." → texto "Verifique seu e-mail para confirmar a exclusão." e botão desabilitado. F5 → ainda "Você já está conectado". Em LOCAL, leia o console pela ferramenta da extensão: "[dev] link de confirmação de exclusão: …/conta?delete_token=…" (NÃO copie o token para o relatório).
4. PASSO IRREVERSÍVEL — confirme com o humano. Abra o link (do console ou do e-mail) NO MESMO navegador logado, trocando o host por {{BASE_URL}}. Aparece a caixa "Confirmar exclusão de conta" e NENHUM diálogo. "Excluir permanentemente" → "Excluindo…" → POST com {token} 200 → toast "Conta excluída. Sentiremos sua falta." → logout e URL / com "Entrar". Tente logar de novo com a conta LGPD (humano digita a senha) → "E-mail ou senha incorretos.".
   Verificação dirigida: o passo 2 (irreversível) não pede nenhuma confirmação? Aberto deslogado com token válido, a tela não oferece login (o backend exige sessão)? Só observe o texto.

## C14 — Checagens seguras de API (só GET)

1. __get('/download?token=abc') → 401 {code:"DOWNLOAD_TOKEN_INVALID", message:"Token inválido"}; __get('/download') → 400 "Token é obrigatório".
2. __get('/webhook') → 405; __get('/auth/customer/logout') → 405 (código atual); __get('/cron-email-jobs') → 401 UNAUTHORIZED.
3. Durante o bloco inteiro, nenhuma chamada a /send-confirmation-email apareceu na rede?

# 6. Pontos a confirmar

1. /login não tem cabeçalho, carrinho, rodapé nem seletor "Entrar como" (código novo).
2. /checkout?status=failure e ?status=pending não mostram mensagem.
3. Depois do login, o cabeçalho de um cliente comum não mostra "Painel admin".
4. "Baixar meus dados" existe em /conta (código novo) e a revogação de cookies NÃO está em /conta (fica em /privacidade).
5. Ao sair, a URL não muda e os dados de um pedido aberto continuam na tela?

# 7. Formato do relatório final (obrigatório, em Markdown)

```
# Relatório de validação — BLOCO 1B (Área do cliente e compra)
Data: <AAAA-MM-DD> · Ambiente: {{BASE_URL}} (LOCAL | DEPLOY) · Versão: <ATUAL | DEFASADO | ANTIGO> · Larguras reais: desktop <N> px, mobile <N> px · session_id início/fim: <…>/<…> · Início/fim: <hh:mm>/<hh:mm>

## 1. Resumo executivo
- Telas validadas: X de 14 · Problemas: crítica N · alta N · média N · baixa N · cosmética N
- Os 5 mais graves, em uma linha cada: …

## 2. Tabela de cobertura
| Tela | Desktop | Mobile | Console | Observações |
|---|---|---|---|---|

## 3. Problemas encontrados
### LOJA-nn — <título curto>
- Severidade: crítica | alta | média | baixa | cosmética
- Tela/URL: <ID> — <URL sem tokens> — largura <N> px
- Passos para reproduzir: 1. … 2. …
- Esperado: …
- Obtido: …
- Evidência: o que o screenshot mostra (texto exato, elemento, posição) + nome do screenshot; dado objetivo; console: "<texto>"; rede: <MÉTODO URL → status, trecho do corpo sem segredos>
- Arquivo provável: <Fonte da tela>
- Veio de verificação dirigida? sim (item …) | não
(continue a numeração LOJA-nn do 1A, se informada; senão comece em LOJA-01)

## 4. Pontos a confirmar: resultado de cada um

## 5. Itens NÃO testados e por quê
| Tela/item | Motivo |

## 6. Dados [TESTE] criados
| Dado | Onde | Identificador (mascarado) | Apagado? | Observação |
(inclua: conta {{EMAIL_DESCARTAVEL}} criada/confirmada (mascarada); ORD-… e produto (pendente de purga via SQL); e-mails em abandoned_carts; conta LGPD excluída ou não; se a senha da descartável mudou em C12; tokens de download consumidos; session_id e horários)

## 7. ESTADO PARA A PRÓXIMA ETAPA
- Telas concluídas; ORD-… criado; logins gastos por e-mail e hora do último; conta logada agora; {{EMAIL_DESCARTAVEL}} cadastrada e confirmada? (sim/não); session_id; último LOJA-nn
```

Nunca escreva senhas nem tokens. Mascare e-mails e nomes.

Severidade: crítica = perda de dados, segurança, cobrança indevida ou fluxo principal (logar, comprar, baixar) bloqueado; alta = função importante quebrada ou dado errado sem contorno simples; média = funciona com falha visível, texto enganoso ou contorno; baixa = acessibilidade, texto, SEO; cosmética = só visual.

# 8. Como trabalhar e registrar o progresso

- Siga C01 → C14 sem pular itens; o que não puder ser feito vai para "não testados" com o motivo. Anote cada achado na hora e escreva um mini-resumo a cada 3 telas.
- Economize contexto: 1 screenshot por largura por tela + os das falhas.
- Se a conversa estiver ficando longa, PARE e entregue um RELATÓRIO PARCIAL (seção 7, com "Parcial: C01–Cxx" e o ESTADO preenchido com a próxima tela).
- No fim: saia de qualquer sessão, esvazie o carrinho, apague lastOrderId/lastOrderEmail do localStorage, anote session_id e horário de fim e entregue o relatório.
````

---

## BLOCO 2A — Painel admin: login, casca e abas de leitura

````markdown
Você é um agente de QA sênior. Vai validar o PAINEL ADMINISTRATIVO do sistema "Ateliê da Escola" no navegador (Claude in Chrome), nesta etapa só com LEITURA: o login em /admin, as rotas antigas, a casca do painel (menu lateral, cabeçalho, menu mobile) e as abas Dashboard (com o modal de pedido), Faturamento, Comparativo, Desempenho, Análise, Funil e Segmentos, mais a coerência dos números e a sessão expirada. Tire screenshots, leia console e rede e entregue um relatório em Markdown. Você NÃO corrige nada e NÃO cria, edita ou exclui dados neste bloco.

ANTES DE TUDO: se ainda existir neste prompt algum texto entre chaves duplas (variável não substituída), PARE e peça os valores ao humano.

# 0. Etapa e estado herdado

Este é o BLOCO 2A (A01 a A14), feito em DUAS conversas. Com o ESTADO vazio, faça A01 a A08 e PARE LOGADO: o RELATÓRIO PARCIAL ("Parcial: A01–A08", seção 7 com o ESTADO preenchido) é OBRIGATÓRIO nesse ponto, mesmo que ainda haja contexto. Se o humano colar um ESTADO de relatório PARCIAL deste bloco, faça o passo 0 da seção 4, abra {{BASE_URL}}/admin (a sessão continua; se aparecer o formulário, faça o login pela regra 2) e continue da tela indicada até A14.
ESTADO HERDADO (vazio na primeira execução):

- Telas já concluídas: —
- Versão observada (ATUAL / DEFASADO / ANTIGO): —
- 2FA exigido no login? Método que funcionou (TOTP/PIN): —
- Logins admin gastos e hora do último: —
- Sessão admin ativa agora? —
- session_id e horário de início: —
- Último achado (ADM-nn): —

# 1. Contexto mínimo do sistema

- Loja de materiais didáticos digitais para professores. SPA React; o painel fica em {{BASE_URL}}/admin. API: se {{BASE_URL}} for http://localhost:5173, http://localhost:3000/api/...; senão {{BASE_URL}}/api/... Nunca 127.0.0.1. Endpoints do painel: <API>/admin/<recurso> (ex.: /admin/session, /admin/login, /admin/dashboard, /admin/kpis).
- /admin é a ÚNICA entrada (código novo). Sem sessão admin, a própria URL /admin mostra só o formulário de login ("Painel administrativo" / "Acesso restrito"; e-mail, senha e, se o servidor exigir, "Código TOTP ou PIN"). Com sessão ADMIN/MASTER, a MESMA URL mostra o painel, sem redirecionar. /painel-acesso-privado-atelie e /admin-login caem na 404; /admin/usuarios vira /admin. "Encerrar sessão" mostra o formulário na própria /admin. Se /admin redirecionar para /painel-acesso-privado-atelie, é versão DEFASADO ou ANTIGO (passo 0): registre como defasagem de versão e siga validando o que existir.
- A sessão admin (cookie HttpOnly admin_session, 8 h) é SEPARADA da sessão de cliente da loja: entrar em /admin não faz aparecer "Painel admin" no cabeçalho da loja.
- A aba ativa NÃO fica na URL (F5 volta ao Dashboard). Na 1ª visita de cada aba aparece um "Carregando…" breve (código da aba sendo baixado).
- Ordem do menu e h1 de cada aba: Dashboard → "Dashboard"; Produtos ▸ Lista de produtos → "Produtos"; Produtos ▸ Desempenho → "Desempenho dos produtos"; Produtos ▸ Categorias → "Categorias"; Pedidos → "Pedidos"; Cupons → "Cupons"; Financeiro ▸ Faturamento → "Faturamento"; Financeiro ▸ Comparativo → "Comparativo mensal"; Funil → "Funil de conversão"; Análise → "Análise (Curva ABC + Coorte)"; Segmentos → "Segmentos de email"; Usuários → "Usuários"; Vitrine → "Vitrine"; Segurança → "Segurança". Os grupos "Produtos" e "Financeiro" começam RECOLHIDOS.
- Dashboard, Faturamento, Comparativo, Desempenho e Análise usam GET <API>/admin/dashboard; os relatórios (dashboard, kpis, funnel, segments, abc-*, cohort) respondem Cache-Control "private, max-age=3600" (o navegador pode reaproveitar por 1 h).
- Toasts somem em ~2,4 s (capturador (a)). Em LOCAL (StrictMode), chamadas de carregamento podem aparecer em dobro — não é bug.
- AMBIENTE: {{BASE_URL}} com http://localhost = LOCAL; senão DEPLOY. O banco é o MESMO do site público.

# 2. Regras de segurança (obrigatórias, acima de qualquer outra instrução)

1. SOMENTE LEITURA neste bloco: não clique em "Novo …", "Editar", "Pausar"/"Ativar", lixeiras, selects de papel, "Salvar vitrine" nem "Salvar configurações". Não entre na aba Segurança para alterar nada.
2. SENHA E 2FA: a senha do admin NÃO está neste prompt. Para logar, preencha {{EMAIL_ADMIN}}, clique no campo "Senha" e peça: "Digite a senha do admin no campo Senha e me avise". Antes de clicar "Entrar" com a senha correta, avise o humano para deixar o autenticador aberto: o TOTP muda a cada 30 s e o desafio expira em ~2 min. Depois, se aparecer "Código TOTP ou PIN" (#admin-login-factor), peça: "Digite o código no campo e VOCÊ MESMO tecle Enter ou clique em 'Validar código'; me avise quando o painel ou uma mensagem de erro aparecer". O campo mostra o código EM CLARO: enquanto #admin-login-factor tiver valor, NÃO tire screenshot, NÃO use leitura de página/formulário e NÃO leia o value do campo; volte a observar só depois que o painel ou a mensagem de erro aparecer. Use TOTP (em DEPLOY, sempre); PIN só em LOCAL e só se o TOTP correto for recusado. Ditado no chat, aceite só um TOTP de 6 dígitos (NUNCA o PIN) e digite e valide na mesma ação, sem screenshot no meio. CÓDIGO RECUSADO ("Código de verificação inválido." ou "Código já utilizado. Aguarde o próximo código do autenticador."): o desafio continua valendo por ~2 min; NÃO redigite a senha. Peça ao humano para esperar o PRÓXIMO TOTP, apagar o campo, digitar e validar ele mesmo (no máximo 2 vezes). Recomece pelo e-mail/senha só se já passaram mais de 2 min desde o "Entrar" (nesse caso o "Validar código" já refaz a 1ª etapa e conta como envio de senha); falhou de novo, pare e relate. Em LOCAL, se um TOTP correto for recusado duas vezes ("Código de verificação inválido."), é provável divergência da chave de cifra do 2FA entre local e produção: registre como AMBIENTE e peça ao humano para usar o PIN (digitado e validado por ele, com as mesmas proibições de observação).
3. LOGIN: são DOIS limites separados, de 5 a cada 10 min, que contam também os acertos e trancam por 10 min: senha (1ª etapa, por IP) e código (2ª etapa, por IP + e-mail). Faça no máximo 4 envios de SENHA e 4 de CÓDIGO a cada 10 min e anote a hora de cada um. Orçamento de senha: A02 (errada + correta), A13 (até 2 relogins); de código: 1 por login com 2FA, mais as novas tentativas da regra 2. O TOTP é de uso único: entre dois logins com TOTP, espere ao menos 30 s (senão vem "Código já utilizado.").
4. SEGREDOS: GET <API>/admin/dashboard traz a tabela settings com adminConfig (segredo TOTP cifrado e hash do PIN). Nunca imprima essa resposta inteira nem tire screenshot dela; use só os snippets booleanos deste prompt. Nunca copie valores de segredos, tokens ou senhas.
5. Nunca faça pelo console ou pela barra de endereço POST, PUT, PATCH ou DELETE; os helpers só fazem GET.
6. LIMITES: se QUALQUER chamada responder 429 ou 503 "Não foi possível validar esta tentativa agora…", NÃO é bug: pare, avise o humano e espere (em LOCAL, o limite de borda de toda a /api zera ao reiniciar a API).
7. DADOS PESSOAIS: pedidos, Análise e Mix mostram clientes reais. Mascare e-mails e nomes no relatório (j***@gmail.com, "Maria S."), não tire screenshot legível do modal de pedido e não abra o CSV de clientes.
8. Diálogo nativo inesperado: Esc/Cancelar. Ação destrutiva não prevista: PARE e pergunte. 403 "Origem não permitida (possível CSRF)." (no logout, sem acentos: "Origem nao permitida (possivel CSRF).") = problema de domínio/ambiente: registre e avise. Depois de TODO "Encerrar sessão" real (não o simulado de A13 item 5), confira __get('/admin/session') → authenticated false; se vier true, PARE e peça ao humano para fechar as abas do site e apagar os cookies dele.
9. Nunca limpe o localStorage inteiro; só as chaves lgpd_* quando o roteiro mandar.

# 3. Variáveis

- {{BASE_URL}}: endereço do site. {{EMAIL_ADMIN}}: e-mail do perfil admin/master (senha e código: o humano digita).
- Marcadores: <API> = window.__API; <HHMM> = hora atual.

# 4. Método de trabalho

0. Início: abra {{BASE_URL}}/?utm_source=qa-validacao&utm_medium=qa, decida o banner de cookies com "Apenas essenciais" (se aparecer), instale (a), (c) e (d), anote horário e localStorage.getItem('session_id'). VERSÃO: Promise.all([__get('/auth/customer/logout').then(x => x.status), fetch('/robots.txt').then(r => r.text()).then(t => /painel-acesso-privado/.test(t))]).then(v => v[0] === 404 ? 'ANTIGO' : v[0] === 405 ? (v[1] ? 'DEFASADO' : 'ATUAL') : 'indefinido ' + v) → ATUAL = código atual; DEFASADO = commit 05b0066 sem as alterações locais (/admin redireciona para /painel-acesso-privado-atelie e "Encerrar sessão" leva a /login); ANTIGO = deploy anterior. Itens "(código novo)" que falharem em DEFASADO ou ANTIGO = "defasagem de versão", não bug.
1. Abra a aba pelo menu, espere o fim do "Carregando…" e confira o h1 contra a tabela. Screenshot desktop (~1440x900, ou a maior possível ≥ 1280); registre window.innerWidth. Mobile só em A03 e A14 (~390x844; registre a largura real; se não descer, diga as faixas cobertas). Screenshots: <tela>-<largura>-<estado>.
2. Console e rede: a leitura da extensão captura só depois da primeira leitura na aba; depois disso, prefira window.__errLog e window.__netLog (o (d) sobrevive à troca de abas pelo menu, mas some em F5/URL digitada — reinstale).
3. Teste cada item ("ação → esperado"), estados (carregando, vazio, erro), textos (português, inglês cru, jargão como "Fase 0"/"Fase 5"), layout (colunas cortadas, rolagem horizontal) e acessibilidade (foco preso nos modais, Esc, aria-label).
4. Verificações dirigidas são SUSPEITAS: confirme ou descarte, relatando o que viu.

Ferramentas (console da página):

(a) Capturador de toasts:

```js
window.__toastLog = [];
new MutationObserver(function () {
  document.querySelectorAll('article[data-type]').forEach(function (a) {
    var i = a.querySelector('i');
    var ic = i ? getComputedStyle(i, '::before').content : 'sem <i>';
    var t = a.getAttribute('data-type') + ': ' + a.textContent.trim() + ' | ícone: ' + ic;
    if (window.__toastLog.indexOf(t) === -1) window.__toastLog.push(t);
  });
}).observe(document.body, { childList: true, subtree: true });
('toasts ok');
```

(b) Não há diálogos nativos nas abas deste bloco. Se aparecer um, tecle Esc.

(c) API e consulta sem cache (só GET):

```js
window.__API =
  location.hostname === 'localhost' ? 'http://localhost:3000/api' : location.origin + '/api';
window.__get = function (path) {
  var url = window.__API + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) {
    return r.text().then(function (t) {
      var j = null;
      try {
        j = JSON.parse(t);
      } catch (e) {}
      return { status: r.status, cache: r.headers.get('cache-control'), body: j };
    });
  });
};
('api ok');
```

Nunca rode __get('/admin/dashboard') e imprima o body inteiro: use os snippets prontos.

(d) Interceptador de rede, coletor de erros e simulador de falha:

```js
(function () {
  if (window.__netLogOn) return 'net já instalado';
  window.__netLogOn = true;
  window.__netLog = [];
  window.__errLog = [];
  window.__bloquear = null;
  window.__semCache = null;
  var SEG =
    /^(totpSecret|fallbackPin|token|delete_token|password|access_token|refresh_token|challengeToken|factorCode|confirmationCode|devConfirmUrl|uploadUrl|signedUrl|pin|secret|totp)$/i;
  var SEM_CORPO = /me-export-data|admin\/(users|orders|dashboard)|customer-orders/;
  function limpa(v, d) {
    if (d > 6 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v))
      return v.slice(0, 20).map(function (x) {
        return limpa(x, d + 1);
      });
    var o = {};
    Object.keys(v).forEach(function (k) {
      o[k] = SEG.test(k) ? '[removido]' : limpa(v[k], d + 1);
    });
    return o;
  }
  function parse(t) {
    try {
      return limpa(JSON.parse(t), 0);
    } catch (e) {
      return typeof t === 'string' ? t.slice(0, 300) : t;
    }
  }
  function urlLimpa(u) {
    return String(u).replace(/([?&](token|delete_token|code)=)[^&#]+/g, '$1[removido]');
  }
  var of = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var it = {
      t: new Date().toISOString().slice(11, 19),
      metodo: metodo,
      url: urlLimpa(url),
      req:
        init && typeof init.body === 'string'
          ? parse(init.body)
          : init && init.body
            ? '[corpo não-texto]'
            : null,
    };
    window.__netLog.push(it);
    if (window.__bloquear && window.__bloquear.test(url)) {
      it.status = 'BLOQUEADO pelo teste (não enviado)';
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (window.__semCache && window.__semCache.test(url)) {
      init = Object.assign({}, init || {}, { cache: 'no-store' });
      it.semCache = true;
    }
    var t0 = performance.now();
    return of.call(window, input, init).then(
      function (r) {
        it.status = r.status;
        it.cache = r.headers.get('cache-control');
        it.ms = Math.round(performance.now() - t0);
        r.clone()
          .text()
          .then(function (t) {
            if (SEM_CORPO.test(url)) {
              it.res = '[corpo omitido: ' + t.length + ' caracteres]';
              return;
            }
            var s = JSON.stringify(parse(t));
            if (s) s = s.replace(/token=[^&"]+/g, 'token=[removido]');
            it.res = s && s.length > 600 ? s.slice(0, 600) + '…' : s;
          })
          .catch(function () {});
        return r;
      },
      function (e) {
        it.status = 'falhou: ' + e.message;
        throw e;
      },
    );
  };
  window.addEventListener('error', function (e) {
    window.__errLog.push('error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errLog.push('rejection: ' + String((e.reason && e.reason.message) || e.reason));
  });
  return 'net ok';
})();
```

Uso: JSON.stringify(window.__netLog.slice(-5)) e JSON.stringify(window.__errLog). window.__bloquear = /padrão/ faz a chamada NÃO ser enviada (a tela recebe "Failed to fetch"); desligue com null. Não imprima entradas de /admin/dashboard do __netLog. Cada entrada traz "ms" (duração da chamada). O (d) NÃO guarda o corpo das respostas de me-export-data, admin/users, admin/orders, admin/dashboard e customer-orders (só status, ms e tamanho), troca "token=…" por "token=[removido]" e apaga chaves de segredo (uploadUrl, signedUrl, pin, secret, totp…). CACHE: um GET com ms < ~10 veio do cache do navegador, sem ir ao servidor.

# 5. Checklist (siga nesta ordem)

Copie a "Fonte" no campo "Arquivo provável" dos problemas.

## A01 — /admin sem sessão e rotas antigas

Fonte: src/App.jsx, src/components/ProtectedRoute.jsx, src/pages/AdminLoginPage.jsx, src/pages/NotFoundPage.jsx, src/pages/AdminPage.jsx (banner de bypass), public/robots.txt. 0. __get('/admin/session').then(x => JSON.stringify(x.body)) → {success:true, authenticated:false}. Se vier authenticated:true, abra /admin, clique "Encerrar sessão" (rodapé do menu) e anote o comportamento (A13 detalha).

1. {{BASE_URL}}/admin → primeiro o cartão "Verificando sessão" / "Aguarde enquanto validamos seu acesso ao painel." e depois o formulário; location.pathname === "/admin" (sem redirecionamento). Se o PAINEL abrir sem login com o banner âmbar "Modo de desenvolvimento (bypass) — sem sessão admin real.", PARE e avise o humano: o bypass de dev está ligado e o bloco daria divergências falsas.
2. (código novo) /painel-acesso-privado-atelie → 404 com cabeçalho da loja: "404", h1 "Página não encontrada", "Voltar para a home" e "Ver produtos"; nenhum campo "E-mail do admin". /admin-login → a mesma 404. /admin/xyz → 404.
3. /admin/usuarios → a URL vira /admin (replace: Voltar não retorna a /admin/usuarios).
4. fetch('/robots.txt').then(r => r.text()).then(t => JSON.stringify({ adminBloqueado: /Disallow: \/admin/.test(t), temPainelAntigo: /painel-acesso-privado/.test(t) })) → true e (código novo) false.

## A02 — Login do admin em /admin

Fonte: src/pages/AdminLoginPage.jsx, src/components/ProtectedRoute.jsx, src/providers/AuthProvider.jsx, src/services/admin-auth.js, handlers/admin/login.js, lib/rate-limit.js.

1. Formulário: tela cheia em gradiente, SEM cabeçalho, rodapé ou links da loja ([...document.querySelectorAll('a')].map(a => a.textContent.trim()) só pode trazer os links do banner de cookies, se pendente). Ícone de escudo, "PAINEL ADMINISTRATIVO" (CSS), h1 "Acesso restrito", "Use o e-mail Supabase do perfil master/admin para acessar o painel.", #admin-login-email (placeholder "E-mail do admin"), #admin-login-password ("Senha") e o botão "Entrar". Anote document.title (a tela não define título).
2. "Entrar" vazio → status abaixo do botão "Informe e-mail e senha para entrar.", sem toast e sem POST.
3. E-mail "abc" + qualquer senha → balão nativo (document.querySelector('#admin-login-email').validity.typeMismatch === true), sem POST.
4. Tentativa 1: {{EMAIL_ADMIN}} + "senha-errada-QA" → spinner "Entrando...", botão e campos desabilitados, status "Validando credenciais..." → POST <API>/admin/login 401 {success:false, error:{code:"UNAUTHORIZED", message:"Credenciais inválidas."}} → status + toast error "Credenciais inválidas.". Os campos mantêm os valores.
5. Tentativa 2: senha correta digitada pelo humano (regra 2).
   - Com 2FA: 200 {success:false, requiresSecondFactor:true, methods, challengeToken:"[removido]"} e nenhum cookie emitido; aparece #admin-login-factor ("Código TOTP ou PIN") com "Métodos aceitos: …", o botão vira "Validar código" e o status diz "Informe o código de verificação para concluir o login.". "Validar código" vazio → "Informe o código de verificação para continuar." (sem POST). O humano digita o código (espaços são removidos) e ELE MESMO valida (regra 2: sem screenshot nem leitura do formulário enquanto o campo tiver valor). Enquanto o código não for aceito, o painel NÃO pode aparecer.
   - Sucesso: 200 {success:true, user:{role, email}} → toast success "Login administrativo realizado." e o painel NA MESMA URL /admin, com h1 "Dashboard".
6. document.cookie não contém "admin_session"; __get('/admin/session').then(x => x.body.authenticated) → true.
7. F5 → "Verificando sessão" → painel no Dashboard, sem pedir login. Reinstale as ferramentas.
8. (código novo) ?login: com a sessão ativa, abra {{BASE_URL}}/admin?login → o PAINEL (sem formulário). Sem sessão (feito em A13 item 3, depois de um "Encerrar sessão"): {{BASE_URL}}/admin?login → o formulário; depois do login, location.search === "" (o ?login some por replace).
   Verificação dirigida:

- Os métodos aparecem crus ("Métodos aceitos: totp / pin.")?
- Sem "Esqueci minha senha", sem link de volta à loja e sem título próprio?
- (A14) Em ~390 px, getComputedStyle(document.querySelector('#admin-login-email')).fontSize === "14px" (zoom automático no iPhone)?
- Se a etapa do código passou de 2 min, o 1º "Validar código" só repetiu a frase inicial, sem aviso de expiração?

## A03 — Casca do painel

Fonte: src/components/admin/AdminLayout.jsx, src/pages/AdminPage.jsx, src/components/admin/utils/tabs.js.

1. Menu lateral (≥1024 px): logo com "Ateliê da Escola" / "Painel Administrativo", "Ver loja" (ícone ↗), itens na ordem da seção 1 e grupos RECOLHIDOS (subitens fora do DOM). Expanda os dois grupos e rode [...document.querySelectorAll('aside nav a, aside nav button')].map(e => e.innerText.trim()) → ["Ver loja","Dashboard","Produtos","Lista de produtos","Desempenho","Categorias","Pedidos","Cupons","Financeiro","Faturamento","Comparativo","Funil","Análise","Segmentos","Usuários","Vitrine","Segurança"].
2. Cabeçalho: h1 da aba e a data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), oculta abaixo de 640 px.
3. Ao longo do bloco, clicar em cada item deixa só ele com a classe bg-violet-600 e o h1 conforme a tabela. Clicar no item JÁ ativo não gera requisição. Clicar num grupo mostra/esconde os subitens, sem requisição e sem trocar de aba.
4. Rodapé do menu: "Administrador", "SESSÃO ADMIN" (CSS) e o botão rosa "Encerrar sessão" (não clique agora).
5. "Ver loja" → / na MESMA aba. O cabeçalho da loja continua de VISITANTE ("Entrar", carrinho, sem "Painel admin"). Volte digitando {{BASE_URL}}/admin → "Verificando sessão" e o painel no Dashboard. Reinstale as ferramentas.
6. Mobile (<1024 px, registre innerWidth): menu lateral oculto e botão "Abrir menu" à esquerda do h1. Clicar → o menu desliza com um véu escuro (botão "Fechar menu"); clicar no véu fecha; expandir "Financeiro" NÃO fecha; escolher "Comparativo" fecha e o h1 vira "Comparativo mensal".
7. Em "Comparativo", F5 → volta ao Dashboard (aba fora da URL). Reinstale.
   Verificação dirigida:

- O rodapé mostra sempre "Administrador", e não o e-mail logado?
- Mobile: Esc fecha o menu? Com o menu FECHADO, Tab leva o foco a "Ver loja" fora da tela (getBoundingClientRect().x < 0)? "Abrir menu" tem aria-expanded? Mede menos de 44 px?
- O ↗ de "Ver loja" sugere nova aba, mas abre na mesma?
- Com o banner de cookies pendente (remova as chaves lgpd_* e dê F5), a ~1100 px: document.elementFromPoint no centro de "Encerrar sessão" devolve o banner? Depois decida "Apenas essenciais".

## A04 — Dashboard

Fonte: src/components/admin/tabs/DashboardTab.jsx, src/components/admin/tabs/dashboard-charts.js, src/components/admin/utils/derive.js, handlers/admin/dashboard.js, handlers/admin/kpis.js, src/components/admin/ui/StatusChip.jsx.

1. Rede: GET <API>/admin/dashboard 200 e GET <API>/admin/kpis?window=12 200. Resumo sem dados pessoais:
   __get('/admin/dashboard').then(x => JSON.stringify({ s: x.status, cache: x.cache, chaves: Object.keys(x.body || {}), summary: x.body && x.body.summary, truncated: x.body && x.body.truncated }))
   Esperado: chaves com success, products, categories, users, orders, settings, summary; cache "private, max-age=3600"; truncated [].
2. Segredos (só booleanos):
   __get('/admin/dashboard').then(x => { var s = (x.body && x.body.settings) || {}; var c = Array.isArray(s) ? (s.find(r => r && r.key === 'adminConfig') || {}).value : s.adminConfig; var v = (c && typeof c === 'object' && c.value && typeof c.value === 'object') ? c.value : (c || {}); return JSON.stringify({ temTotpSecret: 'totpSecret' in v, temFallbackPin: 'fallbackPin' in v }); })
   Se algum vier true, registre (severidade média: o endpoint devolve settings sem redação; os valores estão cifrados/hasheados — não os leia).
3. 4 cards grandes: "FATURAMENTO DO MÊS" (R$, selo de variação ou "estável", "vs mês anterior", minigráfico), "TICKET MÉDIO" ("N pedidos no mês" ou "sem pedidos no mês"), "PEDIDOS APROVADOS" ("N pendentes"), "CLIENTES RECORRENTES" ("N% dos compradores"). Grade: 1 coluna < 640 px, 2 até 1279 px, 4 a partir de 1280 px (confira contra o innerWidth real).
4. Mini-cards "RECEITA TOTAL", "PRODUTOS ATIVOS", "PENDENTES", "CLIENTES CADASTRADOS". KPIs "LTV MÉDIO (12M)", "TAXA DE RECOMPRA", "TICKET MÉDIO (12M)" ("—" enquanto carregam) e "LTV / CAC" com "Fase 5".
5. "Receita dos últimos 7 dias" / "Pedidos aprovados por dia": 7 colunas dd/mm, a última = hoje, cada uma com R$.
6. "Receita por categoria" / "Top 5 categorias": rosca com "Total" e R$ no centro; legenda com bolinha, % e R$.
7. "Curva ABC": chips "Classe A/B/C" com contagem e "80% da receita"/"15% da receita"/"5% da receita"; até 8 produtos ("#rank nome", R$, %, barra); o #1 é classe A; com mais de 8, "+ N produtos restantes na cauda C.".
8. "Mix de clientes" / "Novos vs recorrentes (compras aprovadas)": barra bicolor, blocos "Recorrentes" e "Novos" com "N% dos compradores" e a nota "N cadastros ainda sem nenhuma compra aprovada.".
9. Cartões tracejados "Vendas por região" e "Funil de conversão" com "Instrumentação pendente".
10. "Pedidos recentes" / "Últimos 8 pedidos": até 8 linhas em ordem decrescente; PEDIDO (código + e-mail/nome ou "Cliente não identificado"), STATUS (chips "Aprovado", "Pendente", "Recusado", "Cancelado", "Concluído", "Falhou" + data "dd/mm/aaaa, hh:mm"), TOTAL e "Detalhes".
11. Coerência interna (compare com o summary do item 1): "Faturamento do mês" = revenueMonth; "Pedidos aprovados" = approvedOrders; "N pendentes" = mini "Pendentes" = pendingOrders; "Receita total" = revenueTotal; "Produtos ativos" = activeProducts; "Clientes cadastrados" = totalUsers = Recorrentes + Novos + N da nota; "Clientes recorrentes" = bloco "Recorrentes".
    Verificação dirigida:

- A legenda da rosca mostra o NOME da categoria ou só bolinha, % e R$? O console mostra 'Each child in a list should have a unique "key" prop'?
- Com toda a receita numa só categoria, o anel some (só o centro e a legenda 100%)?
- Algum status aparece cru em inglês (ex.: "in_process")?
- O cartão "Funil de conversão" diz "Instrumentação pendente", embora a aba "Funil" exista?
- Três "Ticket médio" diferentes (mês, 12m e Faturamento) sem explicação de período? Sem compradores, "Novos 0" com "100% dos compradores"?
- Se houver venda aprovada depois das 21 h (horário de Brasília), ela cai no dia seguinte do gráfico de 7 dias?

## A05 — Modal de detalhe do pedido (a partir do Dashboard)

Fonte: src/components/admin/OrderDetailModal.jsx, src/pages/AdminPage.jsx.
Sem pedidos em "Pedidos recentes": marque como não testado.

1. "Detalhes" → véu escuro e caixa com "PEDIDO", título = código da linha, X "Fechar"; bloco com "Cliente" (nome, senão e-mail, senão "-"), "E-mail", "Status" (chip igual ao da linha), "Total" (igual) e "Data" ("dd/mm/aaaa, hh:mm"); "Itens" com "Nome — N × R$ X" (ou "Produto <id>") ou "Sem itens vinculados.". Dados reais: mascare no relatório.
2. Abrir não gera requisição.
3. Foco inicial no X: document.activeElement.getAttribute('aria-label') === "Fechar"; Tab e Shift+Tab mantêm o foco nele; document.body.style.overflow === "hidden".
4. Esc fecha e o foco volta a "Detalhes"; o véu (x=5, y=5) fecha; o X fecha; a página volta a rolar.
5. Não há controle de edição (status, reenvio de e-mail, cancelamento). A soma "N × R$ X" bate com o Total (salvo pedido com cupom).

## A06 — Faturamento

Fonte: src/components/admin/tabs/FinanceTab.jsx, src/components/admin/ui/BarList.jsx, src/components/admin/utils/derive.js.

1. Financeiro ▸ Faturamento → h1 "Faturamento". Cards "BRUTO ACUMULADO", "PEDIDOS APROVADOS" e "TICKET MÉDIO". Card "Faturamento dos últimos 6 meses" / "Apenas pedidos aprovados" com 6 linhas (mês abreviado, ex.: "set.", R$ e barra verde), terminando no mês atual.
2. "Bruto acumulado" = Dashboard "Receita total"; "Pedidos aprovados" = Dashboard; Ticket médio = Bruto ÷ Pedidos (confira a conta); a última linha = "Faturamento do mês"; a soma das 6 ≤ Bruto.
   Verificação dirigida: meses com R$ 0,00 aparecem com barrinha verde? "Sem vendas no período." nunca aparece?

## A07 — Comparativo mensal

Fonte: src/components/admin/tabs/ComparisonTab.jsx, src/components/admin/utils/derive.js.

1. Financeiro ▸ Comparativo → h1 "Comparativo mensal". Card "Comparativo mensal" / "Mês atual vs. mês anterior" com selo verde "↗ +X,X%", vermelho "↘ -X,X%" ou cinza "— Estável"; blocos "MÊS ANTERIOR" (esquerda) e "MÊS ATUAL" (direita) com "Vendas", "Receita" e "Ticket médio".
2. Ticket médio = Receita ÷ Vendas em cada bloco. Mês atual › Receita = "Faturamento do mês" = última linha do Faturamento; Mês anterior › Receita = penúltima linha. Mês atual › Vendas e Ticket médio = hint e valor do card "Ticket médio" do Dashboard. O selo tem a mesma DIREÇÃO do selo do Dashboard.
   Verificação dirigida: o Dashboard usa "+4.5%"/"+13%" (ponto, inteiro ≥ 10) e o Comparativo "+12,5%" (vírgula)? "estável" × "Estável"? O nome do mês aparece "Agosto De 2026" ("De" maiúsculo)?

## A08 — Desempenho dos produtos

Fonte: src/components/admin/tabs/PerformanceTab.jsx, src/components/admin/utils/derive.js, handlers/admin/dashboard.js.

1. Produtos ▸ Desempenho → h1 "Desempenho dos produtos". Card "Desempenho de produtos" / "Ordenado por unidades vendidas": PRODUTO, VENDAS, RECEITA, DOWNLOADS, TAXA DE DOWNLOAD (barra + "N%").
2. VENDAS decrescente; nº de linhas = summary.totalProducts (inclui inativos). TAXA = min(100, arredondar(Downloads ÷ max(Vendas,1) × 100)): confira em 2 linhas. A RECEITA de cada produto = a do mesmo produto na Curva ABC do Dashboard.
   Verificação dirigida: produto com 0 vendas e "0%" com barra preenchida (6%)? Produto sem vendas e com downloads em 100%?

## A09 — Análise (Curva ABC + Coorte) e modal "Como ler"

Fonte: src/components/admin/tabs/AnalysisTab.jsx, src/components/admin/tabs/analysis-content.js, src/utils/csv-export.js, handlers/admin/abc-products.js, handlers/admin/abc-customers.js, handlers/admin/cohort.js.

1. Análise → h1 "Análise (Curva ABC + Coorte)"; "Carregando…" e depois "Calculando análise…". GETs abc-products?period=month, abc-customers?period=quarter e cohort?months=12, todos 200.
2. Barra: "CURVA ABC + COORTE" / "Decisões de produto, estoque e campanha baseadas em receita real." e 3 selects: "Produtos: último mês" (padrão) / trimestre / ano; "Todas as categorias" + categorias; "Clientes: último trimestre" (padrão) / mês / ano. Cada troca refaz as 3 chamadas, sem indicador de carregamento; escolher categoria acrescenta categoryId= à chamada de produtos.
3. "Curva ABC — Produtos": chips "Classe A/B/C", top 12 ("#rank nome" + categoria, R$, %, barra) e "Receita total no período: R$ X". "Curva ABC — Clientes": "VIP" / "Recorrente" / "Eventual", top 12 e a nota "E-mails são mascarados na visualização — export CSV usa a mesma máscara.". "Retenção por coorte (últimos 12 meses)": heatmap com Coorte AAAA-MM, Tam., M+0…M+11 (M+0 = 100% em todas as linhas), tooltip "x/y ativos em AAAA-MM" e "N clientes únicos no período.". Rodapé: "Dados em cache por 1h (regra F5). Adicione ?nocache=1 à URL para forçar recálculo.".
4. Cada "Como ler" abre "COMO LER ESTE GRÁFICO" com o título do card ("Curva ABC — Produtos", "Curva ABC — Clientes", "Retenção por coorte mensal") e os blocos "Como o cálculo funciona", "O que observar" e "Como agir com base na análise" (itens por bloco: 5/4/5, 4/4/5, 5/5/4). Fecha pelo X "Fechar", por "Entendi" e pelo fundo ("Fechar explicação").
5. CSV: produtos → "curva-abc-produtos-<period>.csv"; coorte → "cohort-mensal.csv"; clientes → "curva-abc-clientes-<period>.csv" (dados de clientes: clique UMA vez só para ver que baixa, NÃO abra). Sem dados, os botões ficam desabilitados.
6. Erro: window.__bloquear = /admin\/cohort/ e troque um select → a aba inteira vira uma caixa rosa (com os selects sumindo?). Volte __bloquear = null e troque de aba para recuperar.
   Verificação dirigida:

- No "Como ler": Esc fecha? Tab alcança botões atrás do fundo? A página rola por trás? (esperado pelo código: sem Esc, sem foco preso)
- A lista de clientes mostra NOMES completos, apesar da nota de máscara?
- /admin?nocache=1 muda alguma coisa nas chamadas (o front não repassa o parâmetro)?
- O modal da coorte cita "M+12", mas a tabela vai até M+11? O de clientes fala em "ticket médio", mas a regra usa só nº de pedidos?

## A10 — Funil de conversão

Fonte: src/components/admin/tabs/FunnelTab.jsx, handlers/admin/funnel.js.

1. Funil → h1 "Funil de conversão". Depois do "Carregando…" central do código da aba (só na 1ª visita), NÃO aparece o "Carregando…" de dados da página; a carga fica dentro do card "Funil canônico" ("Carregando funil…"). "FUNIL DE CONVERSÃO" / "Sessões únicas por etapa nos últimos 30 dias" e os botões "7 dias", "30 dias" (ativo) e "90 dias". GET <API>/admin/funnel?days=30.
2. Blocos "Sessões únicas", "Eventos registrados", "Compras aprovadas", "Receita no período". Card "Funil canônico" com 5 barras ("Visitas ao catálogo", "Visualizou produto", "Adicionou ao carrinho", "Iniciou checkout", "Compra aprovada"), contagem e "conv. X%" (≥ 10% sem casas; < 10% com 1 casa; 0 → "—").
3. "7 dias" → botão ativo, subtítulo "últimos 7 dias", "Carregando funil…" dentro do card e GET ?days=7. Repita com "90 dias".
4. "Atribuição por UTM source" / "Receita aprovada com first-touch via UTM. 'direct' = sem UTM.": ORIGEM / PEDIDOS / RECEITA / SHARE; a soma de PEDIDOS = "Compras aprovadas" e a soma de RECEITA = "Receita no período". Ou "Sem pedidos atribuídos".
5. Erro: window.__bloquear = /admin\/funnel/ e clique outro período → caixa rosa acima dos blocos. Os números continuam os do período anterior com o subtítulo novo? __bloquear = null.
   Verificação dirigida: alguma "conv." passa de 100% ("Compra aprovada" conta PEDIDOS, não sessões)? A 1ª etapa sempre "conv. 100%"? "Visualizou produto" > "Visitas ao catálogo"? O vazio cita "Fase 0"?

## A11 — Segmentos de email

Fonte: src/components/admin/tabs/SegmentsTab.jsx, handlers/admin/segments.js, lib/customer-segmentation.js.

1. Segmentos → h1 "Segmentos de email"; "Calculando segmentos…" e depois "Inscritos totais", "Confirmados", "Aguardando opt-in" e "Cancelaram". Card "Tags por número de assinantes" (cartões em ordem decrescente) ou "Sem assinantes classificados ainda". Rodapé "Gerado em dd/mm/aaaa, hh:mm:ss. Cache de 30 min. Adicione ?nocache=1 à URL para forçar recálculo.".
2. Inscritos totais = Confirmados + Aguardando + Cancelaram.
3. A resposta não tem e-mails nem cabeçalho de 30 min: __get('/admin/segments').then(x => JSON.stringify({ s: x.status, cache: x.cache, temEmail: /[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i.test(JSON.stringify(x.body)) })) → temEmail false; anote o cache (esperado pelo código "private, max-age=3600", contra "30 min" do texto).
4. Não há botão de enviar campanha, exportar ou editar.
   Verificação dirigida: tags de categoria em slug cru ("Comprou: festa-junina")? O tempo de resposta passa de 15 s ("Tempo de resposta da API excedido.")?

## A12 — Coerência de números e cache dos relatórios

Fonte: src/components/admin/utils/derive.js, handlers/admin/dashboard.js, lib/http.js.

1. Monte uma tabela com os valores anotados: Receita total = Bruto acumulado; Pedidos aprovados (Dashboard = Faturamento); Faturamento do mês = Comparativo Mês atual › Receita = última barra do Faturamento; Ticket médio do Dashboard = Comparativo Mês atual; receita por produto (Curva ABC = Desempenho); Clientes cadastrados = Recorrentes + Novos + nota. Registre cada divergência (perto da virada do mês ou depois das 21 h, pode ser fuso: anote o horário).
2. Cache: vá Dashboard → Faturamento → Dashboard e rode JSON.stringify(window.__netLog.filter(x => /admin\/dashboard/.test(x.url)).map(x => ({ t: x.t, s: x.status, ms: x.ms }))). Critério: GET com ms < ~10 = veio do cache do navegador (a ida ao servidor leva dezenas ou centenas de ms). Vale em LOCAL e em DEPLOY; em DEPLOY confirme com performance.getEntriesByType('resource').filter(e => /admin\/dashboard/.test(e.name)).map(e => e.transferSize) (0 depois da 1ª = cache; em LOCAL a API é de outra origem e o transferSize vem sempre 0). Registre o que viu; o efeito prático (lista que não atualiza depois de salvar) é testado no bloco 2B.

## A13 — Sessão expirada e "Encerrar sessão"

Fonte: src/pages/AdminPage.jsx (isSessionError, onAuthExpired), src/providers/AuthProvider.jsx, handlers/admin/logout.js, src/constants/error-codes.js, src/components/admin/tabs/FunnelTab.jsx, src/components/admin/tabs/SegmentsTab.jsx.

1. Abra uma SEGUNDA aba em {{BASE_URL}}/admin (mesma sessão). Na aba B, "Encerrar sessão" → POST <API>/admin/logout 200 {success:true}, toast info "Sessão administrativa encerrada." e o formulário "Acesso restrito" VAZIO na mesma /admin (sem ir para /login). F5 na aba B → continua no formulário. Instale (c) na aba B e confirme __get('/admin/session') → authenticated false. Se o logout der 403 ("Origem não permitida (possível CSRF)." ou, sem acentos, "Origem nao permitida (possivel CSRF).") ou a sessão continuar true: o painel fica aberto e o cookie vale por até 8 h. PARE, peça ao humano para fechar as abas do site e apagar os cookies dele, e registre.
2. Aba A (painel ainda na tela): clique "Pedidos" → GET admin/orders 401 {code:"ADMIN_SESSION_INVALID", message:"Sessão admin inválida ou expirada."} → toast warning "Sessão admin expirada. Faça login novamente." e o formulário substitui o painel na mesma /admin. Esperado pelo código: SÓ o toast âmbar (o vermelho junto só sai em ações como "Pausar"). Anote quantos toasts saíram.
3. Na aba A, abra {{BASE_URL}}/admin?login → formulário (A02.8) → faça login de novo (regra 2; conta no orçamento; se o último TOTP foi usado há menos de 30 s, espere) → painel e location.search === "". Reinstale as ferramentas. Na aba B, F5 (o painel volta) e "Encerrar sessão" de novo (confira authenticated false, como no item 1). Na aba A, clique "Segmentos" e depois "Funil" → "7 dias": aparece só a caixa rosa "Sessão admin inválida ou expirada." com o painel ainda aberto (sem toast âmbar e sem formulário)? Clique "Dashboard": os números aparecem (vindos do cache) sem detectar a expiração?
4. Faça login de novo na aba A (se o orçamento permitir; senão espere 10 min) e feche a aba B.
5. (código novo) Falha do logout, sem enviar nada: na aba A logada, window.__bloquear = /admin\/logout/ → "Encerrar sessão" → toast vermelho "Failed to fetch" e o painel CONTINUA na tela (não há redirecionamento nem formulário); __get('/admin/session') → authenticated true (a sessão segue válida). Registre se a tela não avisa que a sessão continua aberta. Volte window.__bloquear = null e NÃO encerre de novo: o logout real já foi validado nos itens 1 e 3, e o 2B usa esta sessão. Termine o bloco LOGADO.

## A14 — Varredura mobile (~390x844)

Redimensione, registre window.innerWidth e percorra Dashboard, Desempenho, Análise, Funil e Segmentos (1 screenshot por aba):

1. Nenhuma rolagem horizontal da página.
2. Dashboard: cards em 1 coluna (< 640 px); na tabela "Pedidos recentes", o botão "Detalhes" fica visível? Compare scrollWidth e clientWidth do contêiner da tabela.
3. Desempenho: a coluna "TAXA DE DOWNLOAD" fica cortada e sem rolagem?
4. Análise: o heatmap da coorte rola na horizontal DENTRO do card? O modal "Como ler" cabe com margem e rola por dentro?
5. Deslogue NÃO; volte ao desktop.

# 6. Pontos a confirmar

1. Login: URL fica /admin; com 2FA, o painel só aparece depois do código aceito.
2. Sessão expirada nas abas Pedidos/Usuários/Segurança: toast âmbar + formulário; em Funil/Segmentos: só caixa rosa?
3. "Encerrar sessão" mostra o formulário na própria /admin (sem /login).
4. A sessão admin não faz aparecer "Painel admin" no cabeçalho da loja.
5. Rótulo do menu × h1: seis abas diferem (tabela da seção 1). Registre qualquer caso fora dela.

# 7. Formato do relatório final (obrigatório, em Markdown)

```
# Relatório de validação — BLOCO 2A (Admin: login e leitura)
Data: <AAAA-MM-DD> · Ambiente: {{BASE_URL}} (LOCAL | DEPLOY) · Versão: <ATUAL | DEFASADO | ANTIGO> · 2FA exigido? sim/não (método: TOTP/PIN) · Larguras reais: desktop <N> px, mobile <N> px · session_id início/fim: <…>/<…> · Início/fim: <hh:mm>/<hh:mm>

## 1. Resumo executivo
- Telas validadas: X de 14 · Problemas: crítica N · alta N · média N · baixa N · cosmética N
- Os 5 mais graves, em uma linha cada: …

## 2. Tabela de cobertura
| Tela/aba | Desktop | Mobile | Console | Observações |
|---|---|---|---|---|

## 3. Tabela de números (A04, A06–A08, A12)
| Métrica | Onde | Valor | Deveria ser igual a | Bate? |

## 4. Problemas encontrados
### ADM-01 — <título curto>
- Severidade: crítica | alta | média | baixa | cosmética
- Tela/URL: <ID> — {{BASE_URL}}/admin, aba "<menu>" (h1 "<h1>") — largura <N> px
- Passos para reproduzir: 1. … 2. …
- Esperado: …
- Obtido: …
- Evidência: o que o screenshot mostra (texto exato, elemento) + nome; dado objetivo; console: "<texto>"; rede: <MÉTODO URL → status, trecho SEM segredos>
- Arquivo provável: <Fonte da tela>
- Veio de verificação dirigida? sim (item …) | não

## 5. Pontos a confirmar: resultado de cada um

## 6. Itens NÃO testados e por quê

## 7. Dados [TESTE] criados
(nenhum esperado neste bloco; registre CSVs baixados, session_id e horários)

## 8. ESTADO PARA A PRÓXIMA ETAPA
- Telas concluídas; versão; 2FA e método; logins admin gastos (senha e código) e hora do último; sessão admin ativa? ; session_id; último ADM-nn
```

Nunca escreva senhas, códigos 2FA ou segredos. Mascare e-mails e nomes de clientes.

Severidade: crítica = segurança, admin trancado fora ou painel inutilizável; alta = função importante quebrada ou número errado sem contorno; média = falha visível, texto enganoso, dado desatualizado; baixa = acessibilidade, texto, formato; cosmética = só visual.

# 8. Como trabalhar e registrar o progresso

- Siga A01 → A14 sem pular itens; o que não puder ser feito vai para "não testados". Anote cada achado na hora e escreva um mini-resumo a cada 3 telas.
- Economize contexto: 1 screenshot desktop por aba + os das falhas; mobile só em A03 e A14.
- PARADA OBRIGATÓRIA depois de A08 (seção 0), logado. Além dela, se a conversa ficar longa, PARE e entregue um RELATÓRIO PARCIAL (seção 7, "Parcial: A01–Axx", com o ESTADO preenchido).
- No fim: continue logado (o bloco 2B usa a sessão), anote session_id e horário de fim e entregue o relatório.
````

---

## BLOCO 2B — Painel admin: produtos e categorias (CRUD de teste)

````markdown
Você é um agente de QA sênior. Vai validar no navegador (Claude in Chrome) as abas "Lista de produtos" e "Categorias" do PAINEL ADMINISTRATIVO do sistema "Ateliê da Escola": listagem e filtros, o wizard de produto em 4 passos (com uploads), pausar/ativar, a edição de produto, o wizard de categoria e a exclusão, criando SÓ dados de teste e apagando tudo no fim. Tire screenshots, leia console e rede e entregue um relatório em Markdown. Você NÃO corrige nada: só testa e relata com evidências.

ANTES DE TUDO: se ainda existir neste prompt algum texto entre chaves duplas (variável não substituída), PARE e peça os valores ao humano.

# 0. Etapa e estado herdado

Este é o BLOCO 2B. Faça A15 a A22, nesta ordem, e pare. A22 é a LIMPEZA e é obrigatória mesmo que você pare antes.
ESTADO HERDADO (copie do relatório do 2A; se vazio, comece do zero):

- Versão observada (ATUAL / DEFASADO / ANTIGO): —
- 2FA exigido no login? Método que funcionou: —
- Logins admin gastos e hora do último: —
- Sessão admin ativa? —
- Último achado (ADM-nn): —
- (Se for continuação de PARCIAL deste bloco) linha de base A15, categoria real escolhida (nome e id), dados [TESTE-P2] existentes (nome, estado, categorias UUID criadas, caminhos de Storage), contorno de cache ligado?: —

# 1. Contexto mínimo do sistema

- Loja de materiais didáticos digitais. Painel em {{BASE_URL}}/admin: sem sessão, a própria /admin mostra o formulário "Acesso restrito" (e-mail, senha e, se exigido, "Código TOTP ou PIN"); com sessão ADMIN/MASTER, mostra o painel na mesma URL. API: http://localhost:3000/api/... quando {{BASE_URL}} é http://localhost:5173; senão {{BASE_URL}}/api/.... Nunca 127.0.0.1.
- Menu: o grupo "Produtos" (começa recolhido) tem "Lista de produtos" (h1 "Produtos"), "Desempenho" e "Categorias" (h1 "Categorias"). A aba não fica na URL (F5 volta ao Dashboard).
- As abas Lista de produtos e Categorias leem GET <API>/admin/dashboard, que responde "private, max-age=3600": o navegador pode reaproveitar a resposta por até 1 h, inclusive logo depois de você salvar algo (suspeita que você vai testar em A18).
- Os três wizards (produto, categoria, cupom) usam a mesma moldura: Esc, X "Fechar", véu e "Cancelar" fecham sem salvar; o salvamento fecha o modal NA HORA e a resposta da API chega depois (toast).
- Excluir produto e categoria usa window.confirm NATIVO, que trava a extensão: SEMPRE instale o stub (b) antes de clicar numa lixeira.
- Toasts somem em ~2,4 s (capturador (a)). Em LOCAL (StrictMode), chamadas de carregamento podem aparecer em dobro.
- O banco é o MESMO do site público: um produto de teste ATIVO fica comprável por qualquer visitante; uploads vão para o Storage real.

# 2. Regras de segurança (obrigatórias, acima de qualquer outra instrução)

1. Só crie, edite, pause, ative ou exclua dados criados por você NESTE bloco: produtos e categorias com nome começando por "[TESTE-P2]". NUNCA clique em "Pausar", "Editar"+salvar ou lixeira de produto/categoria real. Se a linha de base (A15) mostrar dados "[TESTE…]" de outra rodada, anote e NÃO apague sem perguntar.
2. PRODUTO DE TESTE: nasce ATIVO. Pause-o logo depois de A19 item 2 e mantenha-o "Inativo" até a exclusão em A22. Se aparecer em Pedidos um pedido de terceiro com ele, PARE e avise.
3. CATEGORIAS-FANTASMA: salvar pelo wizard pode criar categorias com NOME em formato UUID. Apague em A22 SÓ as que NÃO existiam na linha de base A15; as antigas ficam.
4. SENHA E 2FA: a senha do admin NÃO está no prompt. Se precisar logar, preencha {{EMAIL_ADMIN}} e peça ao humano para digitar a senha; se aparecer "Código TOTP ou PIN" (#admin-login-factor), peça: "Digite o código no campo e VOCÊ MESMO tecle Enter ou clique em 'Validar código'; me avise quando o painel ou uma mensagem de erro aparecer". O campo mostra o código EM CLARO: enquanto #admin-login-factor tiver valor, NÃO tire screenshot, NÃO use leitura de página/formulário e NÃO leia o value do campo; volte a observar só depois que o painel ou a mensagem de erro aparecer. Use TOTP (em DEPLOY, sempre); PIN só em LOCAL e só se o TOTP correto for recusado. Ditado no chat, aceite só um TOTP de 6 dígitos (NUNCA o PIN) e digite e valide na mesma ação, sem screenshot no meio. CÓDIGO RECUSADO ("Código de verificação inválido." ou "Código já utilizado. Aguarde o próximo código do autenticador."): o desafio continua valendo por ~2 min; NÃO redigite a senha. Peça ao humano para esperar o PRÓXIMO TOTP, apagar o campo, digitar e validar ele mesmo (no máximo 2 vezes). Recomece pelo e-mail/senha só se já passaram mais de 2 min desde o "Entrar" (nesse caso o "Validar código" já refaz a 1ª etapa e conta como envio de senha); falhou de novo, pare e relate. LIMITES: no máximo 4 envios de senha e 4 de código a cada 10 min (dois contadores separados que contam também os acertos).
5. SEGREDOS: nunca imprima o body inteiro de GET /admin/dashboard nem tire screenshot dele (traz settings com segredos do 2FA). Use só os snippets deste prompt.
6. Nunca faça pelo console ou pela barra de endereço POST, PUT, PATCH ou DELETE; as escritas acontecem só pelos botões previstos. Não entre em Segurança, Vitrine, Usuários, Cupons nem Pedidos para alterar nada.
7. LIMITES: se QUALQUER chamada responder 429 ou 503 "Não foi possível validar esta tentativa agora…", NÃO é bug: pare, avise e espere. 403 "Origem não permitida (possível CSRF)." ao salvar = domínio errado/ambiente: pare as escritas e avise.
8. UPLOADS: nunca envie dois arquivos ao mesmo tempo. Só arquivos fornecidos pelo humano, sem dados pessoais. Anote cada caminho product_images/… e product_files/… que aparecer (ficam órfãos no Storage).
9. Diálogo nativo inesperado: Esc/Cancelar; nunca marque "impedir mais diálogos". Ação destrutiva não prevista: PARE e pergunte.
10. Mascare e-mails e nomes de clientes reais no relatório; nunca escreva senhas.

# 3. Variáveis

- {{BASE_URL}}: endereço do site. {{EMAIL_ADMIN}}: e-mail do admin (senha e código: o humano digita).
- Peça ao humano, quando chegar a A17: uma imagem JPG/PNG de até 500 kB, uma imagem de ~600 kB e um PDF pequeno, sem dados pessoais. Se a extensão não conseguir anexar arquivos no seletor nativo, peça ao humano que faça o upload enquanto você observa.
- Marcadores: <API> = window.__API; <HHMM> = hora atual; <categoria real> = uma categoria ATIVA com nome legível da linha de base (anote nome, id e cor; use sempre a mesma).

# 4. Método de trabalho

0. Início: abra {{BASE_URL}}/admin. Se aparecer o formulário, faça o login (regra 4). Instale (a), (b), (c) e (d) e anote horário e localStorage.getItem('session_id'). VERSÃO: Promise.all([__get('/auth/customer/logout').then(x => x.status), fetch('/robots.txt').then(r => r.text()).then(t => /painel-acesso-privado/.test(t))]).then(v => v[0] === 404 ? 'ANTIGO' : v[0] === 405 ? (v[1] ? 'DEFASADO' : 'ATUAL') : 'indefinido ' + v) → ATUAL = código atual; DEFASADO = commit 05b0066 sem as alterações locais (/admin redireciona para /painel-acesso-privado-atelie, "Encerrar sessão" leva a /login e /login tem "Entrar como"); ANTIGO = deploy anterior. Diferenças de login/rotas em DEFASADO ou ANTIGO = "defasagem de versão", não bug. Anote.
1. O (b) e o (d) sobrevivem à troca de abas pelo menu lateral, mas somem em F5/URL digitada: reinstale e confira String(window.confirm).indexOf('__confirmLog') >= 0.
2. Screenshot desktop (~1440x900 ou ≥ 1280) por passo importante; registre window.innerWidth. Mobile só em A21 (~390x844, registre a largura real). Screenshots: <tela>-<largura>-<estado>.
3. Console/rede: prefira window.__errLog e window.__netLog. Uploads (PUT para o Storage) usam XMLHttpRequest e não entram no __netLog: use a ferramenta de rede da extensão (método, URL e status bastam).
4. Teste cada item ("ação → esperado"), validações, textos, layout e acessibilidade (foco preso nos modais, Esc, aria-label). Verificações dirigidas são SUSPEITAS a confirmar ou descartar.

Ferramentas (console da página):

(a) Capturador de toasts:

```js
window.__toastLog = [];
new MutationObserver(function () {
  document.querySelectorAll('article[data-type]').forEach(function (a) {
    var i = a.querySelector('i');
    var ic = i ? getComputedStyle(i, '::before').content : 'sem <i>';
    var t = a.getAttribute('data-type') + ': ' + a.textContent.trim() + ' | ícone: ' + ic;
    if (window.__toastLog.indexOf(t) === -1) window.__toastLog.push(t);
  });
}).observe(document.body, { childList: true, subtree: true });
('toasts ok');
```

(b) Stub de window.confirm — OBRIGATÓRIO antes de qualquer lixeira:

```js
window.__confirmLog = [];
window.__confirmAnswer = false;
window.confirm = function (msg) {
  window.__confirmLog.push(String(msg));
  return window.__confirmAnswer;
};
('stub ok');
```

false = Cancelar; true = OK. Depois de cada clique, leia JSON.stringify(window.__confirmLog). Texto no log e nenhuma requisição depois de Cancelar = comportamento correto. Se a caixa nativa aparecer mesmo assim: Esc ou peça ao humano.

(c) API, consulta sem cache (só GET) e resumo sem dados sensíveis:

```js
window.__API =
  location.hostname === 'localhost' ? 'http://localhost:3000/api' : location.origin + '/api';
window.__get = function (path) {
  var url = window.__API + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) {
    return r.text().then(function (t) {
      var j = null;
      try {
        j = JSON.parse(t);
      } catch (e) {}
      return { status: r.status, cache: r.headers.get('cache-control'), body: j };
    });
  });
};
window.__resumo = function () {
  return window.__get('/admin/dashboard').then(function (x) {
    var b = x.body || {};
    return JSON.stringify({
      produtos: (b.products || []).map(function (p) {
        return (
          p.name +
          ' | ' +
          (p.active ? 'ativo' : 'inativo') +
          ' | cat: ' +
          (p.category || '—') +
          ' | catId: ' +
          (p.categoryId || '—')
        );
      }),
      categorias: (b.categories || []).map(function (c) {
        return (
          c.name +
          ' | id: ' +
          c.id +
          ' | ' +
          (c.active === false ? 'inativa' : 'ativa') +
          ' | ' +
          c.color
        );
      }),
    });
  });
};
('api ok');
```

__resumo() lê o servidor SEM cache e devolve só nomes, estados e ids de produtos e categorias (não imprime settings).

(d) Interceptador de rede, coletor de erros e CONTORNO DE CACHE:

```js
(function () {
  if (window.__netLogOn) return 'net já instalado';
  window.__netLogOn = true;
  window.__netLog = [];
  window.__errLog = [];
  window.__bloquear = null;
  window.__semCache = null;
  var SEG =
    /^(totpSecret|fallbackPin|token|delete_token|password|access_token|refresh_token|challengeToken|factorCode|confirmationCode|devConfirmUrl|uploadUrl|signedUrl|pin|secret|totp)$/i;
  var SEM_CORPO = /me-export-data|admin\/(users|orders|dashboard)|customer-orders/;
  function limpa(v, d) {
    if (d > 6 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v))
      return v.slice(0, 20).map(function (x) {
        return limpa(x, d + 1);
      });
    var o = {};
    Object.keys(v).forEach(function (k) {
      o[k] = SEG.test(k) ? '[removido]' : limpa(v[k], d + 1);
    });
    return o;
  }
  function parse(t) {
    try {
      return limpa(JSON.parse(t), 0);
    } catch (e) {
      return typeof t === 'string' ? t.slice(0, 300) : t;
    }
  }
  function urlLimpa(u) {
    return String(u).replace(/([?&](token|delete_token|code)=)[^&#]+/g, '$1[removido]');
  }
  var of = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var it = {
      t: new Date().toISOString().slice(11, 19),
      metodo: metodo,
      url: urlLimpa(url),
      req:
        init && typeof init.body === 'string'
          ? parse(init.body)
          : init && init.body
            ? '[corpo não-texto]'
            : null,
    };
    window.__netLog.push(it);
    if (window.__bloquear && window.__bloquear.test(url)) {
      it.status = 'BLOQUEADO pelo teste (não enviado)';
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (window.__semCache && window.__semCache.test(url)) {
      init = Object.assign({}, init || {}, { cache: 'no-store' });
      it.semCache = true;
    }
    var t0 = performance.now();
    return of.call(window, input, init).then(
      function (r) {
        it.status = r.status;
        it.cache = r.headers.get('cache-control');
        it.ms = Math.round(performance.now() - t0);
        r.clone()
          .text()
          .then(function (t) {
            if (SEM_CORPO.test(url)) {
              it.res = '[corpo omitido: ' + t.length + ' caracteres]';
              return;
            }
            var s = JSON.stringify(parse(t));
            if (s) s = s.replace(/token=[^&"]+/g, 'token=[removido]');
            it.res = s && s.length > 600 ? s.slice(0, 600) + '…' : s;
          })
          .catch(function () {});
        return r;
      },
      function (e) {
        it.status = 'falhou: ' + e.message;
        throw e;
      },
    );
  };
  window.addEventListener('error', function (e) {
    window.__errLog.push('error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errLog.push('rejection: ' + String((e.reason && e.reason.message) || e.reason));
  });
  return 'net ok';
})();
```

Uso: JSON.stringify(window.__netLog.slice(-5)) e JSON.stringify(window.__errLog). CONTORNO: window.__semCache = /admin\/dashboard/ faz as leituras do painel irem com cache:'no-store' (desligue com null). Só ligue quando A18 mandar e diga no relatório a partir de quando ficou ligado. Cada entrada traz "ms" (duração da chamada). O (d) NÃO guarda o corpo das respostas de me-export-data, admin/users, admin/orders, admin/dashboard e customer-orders (só status, ms e tamanho), troca "token=…" por "token=[removido]" e apaga chaves de segredo (uploadUrl, signedUrl, pin, secret, totp…). CACHE: um GET com ms < ~10 veio do cache do navegador, sem ir ao servidor.

# 5. Checklist (siga nesta ordem)

## A15 — Linha de base (antes de criar qualquer coisa)

1. __resumo() → anote a lista de produtos (nomes e estados) e a lista COMPLETA de categorias (nome, id, estado, cor), inclusive as que têm nome em formato UUID ou "Sem nome (renomeie)" — elas já existiam e NÃO devem ser apagadas.
2. Escolha a <categoria real> (ATIVA, nome legível) e anote nome, id e cor.
3. Anote dados "[TESTE…]" de outras rodadas (não apague sem perguntar).
4. HOME PÚBLICA: __get('/admin/settings?key=homeSections').then(x => { var v = x.body && x.body.value; return JSON.stringify({ s: x.status, semConfig: !v || !Array.isArray(v.sections) || !v.sections.some(function (q) { return q && q.enabled !== false; }) }); }). Se semConfig vier true, AVISE o humano: sem vitrine salva, a home real monta as faixas com as 3 primeiras categorias ATIVAS em ordem alfabética, e "[TESTE-P2] Categoria QA" (A20.7) e as categorias-fantasma com nome UUID (A17–A19) vêm ANTES das letras, virando faixas da home enquanto estiverem ativas; o produto de teste ativo também abre "Novidades". Anote a linha de base: __get('/home-sections').then(x => JSON.stringify(x.body.sections.map(s => s.title))).

## A16 — Lista de produtos

Fonte: src/components/admin/tabs/ProductsTab.jsx, src/pages/AdminPage.jsx, handlers/admin/products.js.

1. Menu "Produtos" (grupo) → "Lista de produtos" → h1 "Produtos". Card h2 "Produtos", subtítulo "N de M produto(s)", botão "Novo produto". Filtros "Buscar por nome...", select "Todas as categorias" e select "Todos"/"Ativos"/"Inativos". Tabela PRODUTO (nome + badge "Destaque" com estrela, se houver) | CATEGORIA (nome ou "Sem categoria") | PREÇO ("R$ 49,90") | STATUS ("Ativo" verde / "Inativo" cinza) | AÇÕES ("Editar", "Pausar"/"Ativar", lixeira aria-label "Excluir"). Mais recentes primeiro; sem miniatura, paginação ou ordenação por coluna.
2. Sem filtros: M = número de <tr> do tbody = total da linha de base.
3. Buscar um trecho de nome → só as linhas que o contêm ("X de M"); "zzzz" → "Nenhum produto encontrado" / "Crie um novo produto ou ajuste os filtros." e "0 de M produto(s)", sem requisição nova.
4. Select de categoria → só aquela categoria; "Inativos" → só chips "Inativo"; "Ativos" → só "Ativo". Volte os filtros ao padrão.
   Verificação dirigida: alguma célula CATEGORIA mostra um UUID? Todas as lixeiras têm o mesmo nome "Excluir" (sem o nome do produto)? Existe controle para marcar/desmarcar "Destaque"?

## A17 — Wizard de produto: criar "[TESTE-P2] Produto QA <HHMM>"

Fonte: src/components/ModalWizard.jsx, src/components/ProductWizard.jsx, src/components/product-wizard-form.js, src/services/admin-panel.js (upload), handlers/admin/upload-url.js, handlers/admin/products.js (resolveCategoryId).
Moldura:

1. "Novo produto" → modal "Adicionar Produto" (dialog aria-modal="true"): o foco vai para o X "Fechar" (não para o 1º campo) e document.body.style.overflow === "hidden". Trilha "1 Básico" (roxa), "2 Mídia", "3 Preço & Variações", "4 Conversão" (futuras com disabled). Rodapé "Cancelar" e "Avançar →".
2. Digite "x" no nome e tecle Esc → fecha sem requisição e o foco volta a "Novo produto"; reabra → vazio. O véu e "Cancelar" também fecham. Tab/Shift+Tab ficam presos no modal.
   Passo 1 — Básico:
3. "Avançar →" vazio → toast error "Nome do produto é obrigatório"; só com nome → "Categoria é obrigatória"; nome + categoria → "Descrição é obrigatória". Nome só com espaços também dá "Nome do produto é obrigatório".
4. Preencha: nome "[TESTE-P2] Produto QA <HHMM>" (#product-name), a <categoria real> no select #product-category e a descrição "Produto de teste de QA — será excluído." (#product-description). Anote quantas opções o select tem e quais têm nome UUID.
5. Com os 3 campos preenchidos, clique no Nome e tecle Enter → pula para "Mídia" com toast "Pelo menos uma imagem é obrigatória" (submissão implícita)? Se não pulou, clique "Avançar →". A pílula 1 fica verde com ✓.
6. Em Mídia: "← Voltar" → Básico com os dados preservados; avance. Clique na pílula 1 → volta; avance. Pílulas futuras não reagem.
   Passo 2 — Mídia (peça os arquivos ao humano):
7. Blocos "Imagens do produto *" (dica "Selecione cada imagem do seu computador. JPG, PNG ou WebP até 500kB — imagens leves deixam a loja rápida."), "Vídeos (opcional)" e "Arquivo para download *". Cartão vazio: "Nenhum arquivo selecionado", "Clique em "Escolher arquivo"." e o botão "Escolher".
8. "Avançar →" sem imagem → "Pelo menos uma imagem é obrigatória".
9. Imagem de ~600 kB → NENHUMA requisição a /admin/upload-url; texto vermelho no cartão e toast "Imagem de NNNkB excede o limite de 500kB. Otimize (ex.: squoosh.app ou tinypng.com) antes de subir.".
10. Imagem ≤ 500 kB → POST <API>/admin/upload-url {kind:"image", filename, mimeType} 200 (com uploadUrl — no __netLog aparece como "[removido]", pois leva token assinado —, finalUrl, maxSize e confirmRequired:true) e PUT para o Storage (…/product_images/…) 200. Durante o envio: botão "NN%" desabilitado e barra de progresso. No fim: toast "Imagem 1 enviado.", miniatura (<img alt="Preview de Imagem 1">), URL pública e os botões "Trocar" e "Limpar".
11. "Adicionar imagem" → cartão 2 e o X "Remover slot" nos dois. Envie a MESMA imagem ≤ 500 kB no cartão 2 (só depois do 1º terminar) → "Imagem 2 enviado.".
12. "Adicionar vídeo" → cartão "Vídeo 1" com "Escolher" e "Remover slot" (não envie vídeo); "Remover slot" → some.
13. "Avançar →" sem download → "URL de download é obrigatória". Envie o PDF → toast "Arquivo do produto enviado." e o caminho "product_files/…". "Limpar" nele → volta a "Nenhum arquivo selecionado"; envie de novo. Avance.
    Passo 3 — Preço & Variações:
14. Preço vazio → "Preço válido é obrigatório"; "0" → o mesmo. Preencha 9.90 (#product-price), preço original 19.90 (#product-original-price) e tipo "Kit" (#product-type). Enter num campo de preço não faz nada. Avance.
    Passo 4 — Conversão (NÃO tecle Enter em nenhum campo deste passo):
15. "Adicionar benefício" (ícone "printer-fill", texto "PDF para imprimir"), "Adicionar pergunta" ("[TESTE-P2] Pergunta?" / "Resposta de teste.") e "Adicionar depoimento" (Autor "[TESTE-P2] Autora", nota "★★★★★ (5)", texto "Depoimento de teste."). Remova e recoloque um benefício com a lixeira "Remover benefício 1".
16. "Salvar Produto" → o modal fecha NA HORA; depois POST <API>/admin/products 201 {success:true, id} e toast "Produto criado.". No __netLog, confira o corpo do POST: JSON.stringify(window.__netLog.filter(x => x.metodo === 'POST' && /admin\/products/.test(x.url)).slice(-1)) → categoryId (é o id da <categoria real>?), images com 2 itens, productType "kit", faq/benefits/reviews preenchidos, active true.
    Verificação dirigida:

- A dica diz "Escolher arquivo", mas o botão é "Escolher"? O toast diz "Imagem 1 enviado." (concordância)?
- Depois de cada PUT, sai um 2º POST /admin/upload-url com action "confirm"? (O contrato do backend pede; pelo código, não sai.)
- O passo "Preço & Variações" não tem nenhum campo de variação?

## A18 — A lista mostra o que acabou de ser salvo? (cache do painel)

Fonte: handlers/admin/dashboard.js (Cache-Control), lib/http.js, src/services/admin-panel.js, src/pages/AdminPage.jsx (refreshDashboard).

1. Logo depois do toast "Produto criado.", SEM o contorno: a linha "[TESTE-P2] Produto QA …" aparece no topo da tabela? O subtítulo "N de M" subiu? O GET /admin/dashboard seguinte ao POST veio do cache do navegador? Critérios objetivos: (a) JSON.stringify(window.__netLog.filter(x => /admin\/dashboard/.test(x.url)).slice(-2).map(x => ({ t: x.t, s: x.status, ms: x.ms }))) → ms < ~10 = cache; (b) a linha existe no __resumo() do item 2 (servidor, sem cache) mas NÃO na tabela = a tela mostra dado velho.
2. __resumo() (servidor, sem cache) → o produto existe? Anote a categoria (cat) e o catId gravados: são os da <categoria real> ou de uma categoria NOVA com nome em formato UUID (igual ao id da <categoria real>)? Compare a lista de categorias com a linha de base.
3. Se a linha NÃO apareceu no item 1: registre (severidade alta: o painel mostra dado velho por até 1 h depois de salvar). Ligue o contorno: window.__semCache = /admin\/dashboard/; clique "Dashboard" e volte para "Lista de produtos" → a linha aparece. Mantenha o contorno ligado até o fim do bloco.
4. Anote o que a coluna CATEGORIA da linha nova mostra e se a aba Categorias ganhou um cartão novo com nome UUID (anote nome e cor para a limpeza).

## A19 — Ações no produto [TESTE-P2]: excluir (cancelado), pausar/ativar e regressão de edição

Fonte: src/pages/AdminPage.jsx (handlers de produto), src/components/ProductWizard.jsx, handlers/admin/dashboard.js (campos da linha), handlers/admin/products.js.

1. Stub com window.__confirmAnswer = false → lixeira da linha [TESTE-P2] → __confirmLog termina com 'Excluir o produto "[TESTE-P2] Produto QA <HHMM>"?' e NENHUM DELETE sai. A linha continua.
2. "Pausar" (sem confirmação) → PATCH <API>/admin/products {id, active:false} 200, toast "Produto pausado.", chip "Inativo" e o botão vira "Ativar". "Ativar" → "Produto ativado." e "Ativo". Clique "Pausar" de novo (fica Inativo).
3. Regressão de edição (SÓ no [TESTE-P2]): "Editar" → modal "Editar Produto". Anote: nome/categoria/descrição preenchidos (a categoria selecionada é a real ou um UUID?); no passo Mídia, quantos cartões de imagem (foram 2) e se o PDF está lá; no passo 3, "Preço original" (19.90 ou vazio?) e tipo ("Kit" ou "Produto individual"?); no passo 4, se benefício, FAQ e depoimento aparecem.
4. Sem mudar nada, avance até o fim e "Salvar Produto" → toast "Produto atualizado.". Corpo do PUT: JSON.stringify(window.__netLog.filter(x => x.metodo === 'PUT' && /admin\/products/.test(x.url)).slice(-1)) → anote images (quantos), videos, originalPrice, productType, faq, benefits, reviews, active, featured e categoryId.
5. Depois do salvamento: o chip voltou a "Ativo" sozinho (o produto pausado foi reativado)? __resumo() → surgiu OUTRA categoria com nome UUID? Anote para a limpeza.
6. Pause de novo e confirme "Inativo". Ele fica pausado até A22.
   Verificação dirigida: liste cada campo que a edição APAGOU ou ALTEROU sem ser pedido (galeria, preço original, tipo, FAQ, depoimentos, benefícios, destaque, ativo, categoria).

## A20 — Categorias e wizard de categoria

Fonte: src/components/admin/tabs/CategoriesTab.jsx, src/components/CategoryWizard.jsx, src/components/ModalWizard.jsx, handlers/admin/categories.js, validation/admin.schemas.js.

1. "Produtos" ▸ "Categorias" → h1 "Categorias". Card h2 "Categorias", "N categoria(s) cadastrada(s)" e "Nova categoria". Grade de cartões em ordem alfabética: quadrado da cor, nome, estrela se destaque, linha "#HEX · Ativa"/"· Inativa", "Editar" e lixeira aria-label "Excluir". N = total de categorias do __resumo().
2. "Nova categoria" → modal "Adicionar Categoria": "Nome da categoria *" (#cat-name, "Ex: Festa Junina"), "Cor de destaque" (#cat-color, #9B5DE5, com a pastilha do hex em maiúsculas), "★ Evidenciar na página de produtos" (desmarcado) e "Categoria ativa" (marcado); rodapé "Cancelar" e "Salvar Categoria". Esc, X, véu e "Cancelar" fecham sem requisição.
3. Salvar com o nome vazio → toast "Nome da categoria é obrigatório" e o modal CONTINUA aberto, sem requisição.
4. Nome "a" → o modal FECHA e depois chega POST 400 com o toast "Nome deve ter entre 2 e 60 caracteres.".
5. Nome "123e4567-e89b-12d3-a456-426614174000" → "Nome inválido: não cole IDs no campo nome." (400).
6. Nome = <categoria real> (exatamente como na linha de base) → 409 "Categoria já existe.". Se vier 201 "Categoria criada.", você criou uma duplicata REAL: renomeie-a na hora para "[TESTE-P2] Categoria Duplicada", desmarque "Categoria ativa" e inclua-a na limpeza.
7. Nome "[TESTE-P2] Categoria QA" com "★ Evidenciar…" marcado → toast "Categoria criada." e cartão novo com estrela e "· Ativa". Anote a cor. (Se o cartão não aparecer, confira se o contorno de A18 está ligado.) Faça o item 8 LOGO em seguida: ativa, ela pode virar faixa da home pública (A15 item 4).
8. "Editar" nesse cartão → desmarque "Categoria ativa" → "Categoria atualizada." e "· Inativa".
9. "Editar" nesse cartão → renomeie para <categoria real> → registre a resposta (esperado seria 409; pelo código, 500 "Erro ao processar categorias do admin."). Se vier 200, renomeie IMEDIATAMENTE de volta para "[TESTE-P2] Categoria QA" (identifique pela cor e pelo "· Inativa", nunca só pelo nome).
10. Stub com false → lixeira do [TESTE-P2] → __confirmLog termina com 'Excluir a categoria "[TESTE-P2] Categoria QA"?' e nenhum DELETE.
    Verificação dirigida: nos itens 4–6, o texto digitado se perde porque o modal fecha antes da resposta? O confirm avisa que os produtos ficam "Sem categoria" e que a seção da vitrine some? A cor e a estrela têm algum efeito visível na loja? (só leia /produtos; não mexa)

## A21 — Varredura mobile (~390x844)

Registre window.innerWidth.

1. Lista de produtos: sem rolagem horizontal da página; a coluna AÇÕES ("Editar", "Pausar", lixeira) fica visível? Compare scrollWidth e clientWidth do contêiner da tabela.
2. Categorias: grade em 1 coluna, botões visíveis.
3. "Novo produto": o modal cabe; as pílulas mostram só os números 1–4; o corpo rola por dentro e o rodapé fica visível. Feche com "Cancelar".
   Volte ao desktop.

## A22 — Limpeza (obrigatória)

1. Stub com window.__confirmAnswer = true. Contorno ligado (window.__semCache = /admin\/dashboard/).
2. Lista de produtos: lixeira do [TESTE-P2] → DELETE <API>/admin/products?id=… 200, toast "Produto removido.", a linha some. Se falhar (ex.: 500 "Erro ao processar produtos do admin" porque algum pedido o referencia), confirme que está "Inativo", registre como "pendente de limpeza por SQL" e avise.
3. Categorias: antes de apagar cada uma, filtre a Lista de produtos por ela e só siga se não houver linhas (ou só [TESTE…]). Apague "[TESTE-P2] Categoria QA" (e "[TESTE-P2] Categoria Duplicada", se existir), identificadas por nome E cor, e CADA categoria com nome UUID que NÃO estava na linha de base A15 → DELETE 200 e toast "Categoria removida.". NÃO apague as UUID antigas.
4. __resumo() → produtos e categorias iguais à linha de base (exceto o que ficou pendente). Anote.
5. HOME PÚBLICA: __get('/home-sections').then(x => JSON.stringify(x.body.sections.map(s => s.title).filter(t => /\[TESTE/.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)))) → [] ou só títulos que já estavam na linha de base de A15 item 4 (nenhum "[TESTE" nem UUID novo). Se sobrar algum novo, registre e avise o humano.
6. window.__confirmAnswer = false; window.__semCache = null. Continue LOGADO (o bloco 2C usa a sessão).

# 6. Pontos a confirmar

1. O produto criado no wizard fica na categoria escolhida ou numa categoria nova com nome UUID?
2. Editar e salvar sem mudar nada preserva os dados do produto?
3. Depois de salvar, a lista atualiza sozinha ou só com o contorno de cache?
4. Os modais fecham com Esc, X, véu e "Cancelar", com foco preso e rolagem travada?

# 7. Formato do relatório final (obrigatório, em Markdown)

```
# Relatório de validação — BLOCO 2B (Admin: produtos e categorias)
Data: <AAAA-MM-DD> · Ambiente: {{BASE_URL}} (LOCAL | DEPLOY) · Versão: <ATUAL | DEFASADO | ANTIGO> · Larguras reais: desktop <N> px, mobile <N> px · Contorno de cache ligado a partir de: <item ou "não usado"> · session_id início/fim: <…>/<…> · Início/fim: <hh:mm>/<hh:mm>

## 1. Resumo executivo
- Telas validadas: X de 8 · Problemas: crítica N · alta N · média N · baixa N · cosmética N
- Os 5 mais graves, em uma linha cada: …

## 2. Tabela de cobertura
| Tela | Desktop | Mobile | Console | Observações |
|---|---|---|---|---|

## 3. Problemas encontrados
### ADM-nn — <título curto>
- Severidade · Tela/URL (aba "<menu>", h1 "<h1>", largura) · Passos · Esperado · Obtido · Evidência (screenshot descrito + dado objetivo + console + rede SEM segredos) · Arquivo provável · Veio de verificação dirigida?
(continue a numeração ADM-nn do 2A)

## 4. Campos perdidos na edição (A19)
| Campo | Antes (criação) | Depois (edição sem mudanças) |

## 5. Pontos a confirmar: resultado de cada um

## 6. Itens NÃO testados e por quê

## 7. Dados [TESTE] criados
| Dado | Aba | Identificador (nome/cor/id) | Apagado? | Observação |
(inclua categorias UUID criadas pelo bug, caminhos product_images/… e product_files/…, o que ficou pendente de SQL, contagens antes/depois)

## 8. ESTADO PARA A PRÓXIMA ETAPA
- Versão; 2FA e método; logins admin gastos (senha e código) e hora do último; sessão ativa?; pendências de limpeza; session_id; último ADM-nn
```

Nunca escreva senhas ou segredos. Mascare e-mails e nomes de clientes.

Severidade: crítica = perda de dados, segurança ou CRUD principal inutilizável; alta = função importante quebrada, dado errado ou tela desatualizada sem contorno; média = falha visível ou texto enganoso; baixa = acessibilidade/texto; cosmética = visual.

# 8. Como trabalhar e registrar o progresso

- Siga A15 → A22 sem pular itens; anote cada achado na hora; mini-resumo a cada 2 telas.
- Economize contexto: screenshots dos estados que comprovam o esperado ou a falha.
- Se a conversa ficar longa, PARE: pause o [TESTE-P2], faça a LIMPEZA (A22) se o humano não for continuar, e entregue um RELATÓRIO PARCIAL (seção 7, "Parcial: A15–Axx") com o ESTADO preenchido (linha de base, categoria real, dados [TESTE-P2], contorno).
- No fim: limpeza feita, session_id e horário de fim anotados, relatório entregue.
````

---

## BLOCO 2C — Painel admin: cupons, pedidos, usuários, vitrine e segurança

````markdown
Você é um agente de QA sênior. Vai validar no navegador (Claude in Chrome) as abas Cupons, Pedidos, Usuários, Vitrine e Segurança do PAINEL ADMINISTRATIVO do sistema "Ateliê da Escola", criando só cupons de teste, sem salvar a Vitrine nem a Segurança, e apagando tudo no fim. Tire screenshots, leia console e rede e entregue um relatório em Markdown. Você NÃO corrige nada: só testa e relata com evidências.

ANTES DE TUDO: se ainda existir neste prompt algum texto entre chaves duplas (variável não substituída), PARE e peça os valores ao humano.

# 0. Etapa e estado herdado

Este é o BLOCO 2C. Faça A23 a A31, nesta ordem, e pare. A31 (limpeza e logout) é obrigatória mesmo que você pare antes.
ESTADO HERDADO (copie do relatório do 2B; se vazio, comece do zero):

- Versão observada (ATUAL / DEFASADO / ANTIGO): —
- 2FA exigido no login? Método que funcionou: —
- Logins admin gastos e hora do último; sessão ativa?: —
- {{EMAIL_DESCARTAVEL}} foi cadastrada no bloco 1B? —
- Último achado (ADM-nn): —
- (Se continuação de PARCIAL deste bloco, copie a seção 8 do parcial) linha de base A23, cupons de teste existentes, configuração original da Vitrine: —

# 1. Contexto mínimo do sistema

- Painel em {{BASE_URL}}/admin: sem sessão, a própria /admin mostra o formulário "Acesso restrito" (e-mail, senha e, se exigido, "Código TOTP ou PIN"); com sessão ADMIN/MASTER, o painel na mesma URL. "Encerrar sessão" mostra o formulário na própria /admin. API: http://localhost:3000/api/... quando {{BASE_URL}} é http://localhost:5173; senão {{BASE_URL}}/api/.... Nunca 127.0.0.1.
- h1 das abas: Cupons → "Cupons"; Pedidos → "Pedidos"; Usuários → "Usuários"; Vitrine → "Vitrine"; Segurança → "Segurança". A aba não fica na URL.
- Leituras: Cupons → GET <API>/admin/coupons (carregamento próprio "Carregando cupons…"); Pedidos → GET <API>/admin/orders[?status=…]; Usuários → GET <API>/admin/users; Segurança → GET <API>/admin/settings?key=adminConfig; Vitrine → GET <API>/admin/dashboard, que responde "private, max-age=3600" (o navegador pode mostrar dado de até 1 h atrás).
- Excluir cupom usa window.confirm NATIVO (trava a extensão): instale SEMPRE o stub (b) antes da lixeira. "Revogar acesso?" (Usuários) é um modal da página.
- O select de papel em Usuários GRAVA NA HORA, sem confirmação.
- Toasts somem em ~2,4 s. O banco é o MESMO do site público: um cupom de teste ATIVO vale no checkout real.

# 2. Regras de segurança (obrigatórias, acima de qualquer outra instrução)

1. ABA SEGURANÇA: SOMENTE LEITURA. NUNCA clique em "Salvar configurações" com os campos vazios ou com valores válidos: isso pode ligar o 2FA sem método ou gravar um segredo que ninguém tem, TRANCANDO o admin fora do painel (recuperação só por SQL). Em LOCAL, salvar também regravaria o segredo com a chave de cifra errada. Os testes negativos de A28 item 6 (que o servidor recusa com 400 antes de gravar) só com autorização ESCRITA do humano nesta conversa.
2. CUPONS: só códigos começando por "TESTE-QA-P2-" (cupom não aceita colchetes). Deixe o cupom de teste INATIVO assim que possível e apague em A31. Não edite nem apague cupons reais.
3. USUÁRIOS: só a linha de {{EMAIL_DESCARTAVEL}}, e só depois de a busca deixar EXATAMENTE 1 linha com esse e-mail. Com o foco num select de papel, nunca use setas, Espaço, Enter nem a roda do mouse (escolha pela ferramenta de formulário; saia com Tab ou Esc). NÃO clique em "Revogar acesso" (o botão vermelho do modal) neste bloco: só abra o modal e cancele.
4. VITRINE: não clique em "Salvar vitrine" sem autorização ESCRITA do humano. Se autorizado: ligue o contorno de cache (window.__semCache = /admin\/dashboard/), salve a configuração original (A23) antes, faça só a mudança autorizada e restaure em seguida.
5. PEDIDOS: só leitura (a tela não tem ações). Não escreva em /admin/orders.
6. SENHA E 2FA: a senha do admin NÃO está no prompt. Se precisar logar, preencha {{EMAIL_ADMIN}} e peça ao humano para digitar a senha; se aparecer "Código TOTP ou PIN" (#admin-login-factor), peça: "Digite o código no campo e VOCÊ MESMO tecle Enter ou clique em 'Validar código'; me avise quando o painel ou uma mensagem de erro aparecer". O campo mostra o código EM CLARO: enquanto #admin-login-factor tiver valor, NÃO tire screenshot, NÃO use leitura de página/formulário e NÃO leia o value do campo; volte a observar só depois que o painel ou a mensagem de erro aparecer. Use TOTP (em DEPLOY, sempre); PIN só em LOCAL e só se o TOTP correto for recusado. Ditado no chat, aceite só um TOTP de 6 dígitos (NUNCA o PIN) e digite e valide na mesma ação, sem screenshot no meio. CÓDIGO RECUSADO ("Código de verificação inválido." ou "Código já utilizado. Aguarde o próximo código do autenticador."): o desafio continua valendo por ~2 min; NÃO redigite a senha. Peça ao humano para esperar o PRÓXIMO TOTP, apagar o campo, digitar e validar ele mesmo (no máximo 2 vezes). Recomece pelo e-mail/senha só se já passaram mais de 2 min desde o "Entrar" (nesse caso o "Validar código" já refaz a 1ª etapa e conta como envio de senha); falhou de novo, pare e relate. LIMITES: no máximo 4 envios de senha e 4 de código a cada 10 min (dois contadores separados que contam também os acertos).
7. SEGREDOS: nunca imprima o body de /admin/dashboard nem de /admin/settings?key=adminConfig; use os snippets booleanos. Nunca copie segredos, tokens ou senhas.
8. Nunca faça pelo console ou pela barra de endereço POST, PUT, PATCH ou DELETE; os helpers só fazem GET. Proibidos em especial: /api/send-confirmation-email, /api/webhook, /api/cron-email-jobs (com ou sem cabeçalho), POST em /api/admin/cleanup-events.
9. LIMITES: 429 ou 503 "Não foi possível validar esta tentativa agora…" = não é bug: pare, avise e espere. 403 "Origem não permitida (possível CSRF)." ao salvar = domínio errado/ambiente: pare as escritas e avise. LOGOUT DO ADMIN: depois de TODO "Encerrar sessão", confira __get('/admin/session') → authenticated false. Um logout recusado (403 "Origem nao permitida (possivel CSRF).", sem acentos, ou falha de rede) deixa o painel aberto e a sessão viva por até 8 h: se vier true, PARE e peça ao humano para fechar as abas do site e apagar os cookies dele.
10. DADOS PESSOAIS: Pedidos e Usuários mostram clientes reais. Mascare e-mails e nomes (j***@gmail.com, "Maria S."); não tire screenshot legível do modal de pedido.
11. Diálogo nativo inesperado: Esc/Cancelar. Ação destrutiva não prevista: PARE e pergunte.

# 3. Variáveis

- {{BASE_URL}}: endereço do site. {{EMAIL_ADMIN}}: e-mail do admin (senha e código: o humano digita).
- {{EMAIL_DESCARTAVEL}}: conta de cliente descartável cadastrada no bloco 1B (só para Usuários). Se não existir, pule os itens que dependem dela.
- Marcadores: <API> = window.__API; <HHMM> = hora atual.

# 4. Método de trabalho

0. Início: abra {{BASE_URL}}/admin (faça o login, se aparecer o formulário). Instale (a), (b), (c) e (d); anote horário e localStorage.getItem('session_id'). VERSÃO: Promise.all([__get('/auth/customer/logout').then(x => x.status), fetch('/robots.txt').then(r => r.text()).then(t => /painel-acesso-privado/.test(t))]).then(v => v[0] === 404 ? 'ANTIGO' : v[0] === 405 ? (v[1] ? 'DEFASADO' : 'ATUAL') : 'indefinido ' + v) → ATUAL = código atual; DEFASADO = commit 05b0066 sem as alterações locais (/admin redireciona para /painel-acesso-privado-atelie, "Encerrar sessão" leva a /login e /login tem "Entrar como"); ANTIGO = deploy anterior. Diferenças de login/rotas em DEFASADO ou ANTIGO = "defasagem de versão", não bug. Anote.
1. O (b) e o (d) sobrevivem à troca de abas pelo menu, mas somem em F5/URL digitada: reinstale e confira String(window.confirm).indexOf('__confirmLog') >= 0.
2. Screenshot desktop (~1440x900 ou ≥ 1280) por aba; registre window.innerWidth. Mobile só em A30 (~390x844, largura real registrada). Screenshots: <tela>-<largura>-<estado>.
3. Console/rede: prefira window.__errLog e window.__netLog.
4. Teste cada item ("ação → esperado"), validações, estados (vazio, erro), textos, layout e acessibilidade. Verificações dirigidas são SUSPEITAS a confirmar ou descartar.

Ferramentas (console da página):

(a) Capturador de toasts:

```js
window.__toastLog = [];
new MutationObserver(function () {
  document.querySelectorAll('article[data-type]').forEach(function (a) {
    var i = a.querySelector('i');
    var ic = i ? getComputedStyle(i, '::before').content : 'sem <i>';
    var t = a.getAttribute('data-type') + ': ' + a.textContent.trim() + ' | ícone: ' + ic;
    if (window.__toastLog.indexOf(t) === -1) window.__toastLog.push(t);
  });
}).observe(document.body, { childList: true, subtree: true });
('toasts ok');
```

(b) Stub de window.confirm — OBRIGATÓRIO antes da lixeira de cupom:

```js
window.__confirmLog = [];
window.__confirmAnswer = false;
window.confirm = function (msg) {
  window.__confirmLog.push(String(msg));
  return window.__confirmAnswer;
};
('stub ok');
```

false = Cancelar; true = OK. Leia JSON.stringify(window.__confirmLog) depois de cada clique. Se a caixa nativa aparecer mesmo assim: Esc ou peça ao humano.

(c) API, consulta sem cache (só GET) e preenchimento de campo de data:

```js
window.__API =
  location.hostname === 'localhost' ? 'http://localhost:3000/api' : location.origin + '/api';
window.__get = function (path) {
  var url = window.__API + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) {
    return r.text().then(function (t) {
      var j = null;
      try {
        j = JSON.parse(t);
      } catch (e) {}
      return { status: r.status, cache: r.headers.get('cache-control'), body: j };
    });
  });
};
window.__data = function (seletor, valorISO) {
  var el = document.querySelector(seletor);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, valorISO);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
};
('api ok');
```

__data('input[name=validUntil]', '2026-12-31') preenche o campo de data sem depender do idioma do Chrome e devolve o valor final.

(d) Interceptador de rede, coletor de erros, simulador de falha e contorno de cache:

```js
(function () {
  if (window.__netLogOn) return 'net já instalado';
  window.__netLogOn = true;
  window.__netLog = [];
  window.__errLog = [];
  window.__bloquear = null;
  window.__semCache = null;
  var SEG =
    /^(totpSecret|fallbackPin|token|delete_token|password|access_token|refresh_token|challengeToken|factorCode|confirmationCode|devConfirmUrl|uploadUrl|signedUrl|pin|secret|totp)$/i;
  var SEM_CORPO = /me-export-data|admin\/(users|orders|dashboard)|customer-orders/;
  function limpa(v, d) {
    if (d > 6 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v))
      return v.slice(0, 20).map(function (x) {
        return limpa(x, d + 1);
      });
    var o = {};
    Object.keys(v).forEach(function (k) {
      o[k] = SEG.test(k) ? '[removido]' : limpa(v[k], d + 1);
    });
    return o;
  }
  function parse(t) {
    try {
      return limpa(JSON.parse(t), 0);
    } catch (e) {
      return typeof t === 'string' ? t.slice(0, 300) : t;
    }
  }
  function urlLimpa(u) {
    return String(u).replace(/([?&](token|delete_token|code)=)[^&#]+/g, '$1[removido]');
  }
  var of = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var it = {
      t: new Date().toISOString().slice(11, 19),
      metodo: metodo,
      url: urlLimpa(url),
      req:
        init && typeof init.body === 'string'
          ? parse(init.body)
          : init && init.body
            ? '[corpo não-texto]'
            : null,
    };
    window.__netLog.push(it);
    if (window.__bloquear && window.__bloquear.test(url)) {
      it.status = 'BLOQUEADO pelo teste (não enviado)';
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (window.__semCache && window.__semCache.test(url)) {
      init = Object.assign({}, init || {}, { cache: 'no-store' });
      it.semCache = true;
    }
    var t0 = performance.now();
    return of.call(window, input, init).then(
      function (r) {
        it.status = r.status;
        it.cache = r.headers.get('cache-control');
        it.ms = Math.round(performance.now() - t0);
        r.clone()
          .text()
          .then(function (t) {
            if (SEM_CORPO.test(url)) {
              it.res = '[corpo omitido: ' + t.length + ' caracteres]';
              return;
            }
            var s = JSON.stringify(parse(t));
            if (s) s = s.replace(/token=[^&"]+/g, 'token=[removido]');
            it.res = s && s.length > 600 ? s.slice(0, 600) + '…' : s;
          })
          .catch(function () {});
        return r;
      },
      function (e) {
        it.status = 'falhou: ' + e.message;
        throw e;
      },
    );
  };
  window.addEventListener('error', function (e) {
    window.__errLog.push('error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errLog.push('rejection: ' + String((e.reason && e.reason.message) || e.reason));
  });
  return 'net ok';
})();
```

Uso: JSON.stringify(window.__netLog.slice(-5)) e JSON.stringify(window.__errLog). window.__bloquear = /padrão/ simula falha (nada é enviado); window.__semCache = /padrão/ força leitura sem cache. Desligue ambos com null. Cada entrada traz "ms" (duração da chamada). O (d) NÃO guarda o corpo das respostas de me-export-data, admin/users, admin/orders, admin/dashboard e customer-orders (só status, ms e tamanho), troca "token=…" por "token=[removido]" e apaga chaves de segredo (uploadUrl, signedUrl, pin, secret, totp…).

# 5. Checklist (siga nesta ordem)

## A23 — Linha de base

1. Cupons: códigos e total. Pedidos: total com "Todos os status". Usuários: M total.
2. Vitrine original, sem cache: __get('/admin/settings?key=homeSections').then(x => JSON.stringify({ s: x.status, v: x.body && x.body.value })) → anote a configuração (tipo, título, limite e categoria de cada seção). Se vier nula, anote "sem configuração salva".
3. Anote dados "TESTE-QA-…" de outras rodadas (não apague sem perguntar).

## A24 — Cupons e wizard de cupom

Fonte: src/components/admin/tabs/CouponsTab.jsx, src/components/CouponWizard.jsx, src/components/ModalWizard.jsx, handlers/admin/coupons.js, validation/admin.schemas.js, lib/coupons.js.

1. Cupons → h1 "Cupons"; "Carregando cupons…" e depois o card h2 "Cupons de desconto", "N cupom(ns) cadastrado(s) · validados no checkout" e "Novo cupom". Cartões (mais recentes primeiro): código em fonte mono, chip "Ativo"/"Inativo", "10% OFF" ou "R$ 10,00 OFF", validade ("Sem expiração", "Vale até dd/mm/aaaa" ou "Expirou em dd/mm/aaaa"), usos ("N uso(s)" ou "N/M usos"), "Mín. R$ x,xx" (opcional), "Editar" e lixeira aria-label "Excluir <CÓDIGO>". Vazio: "Nenhum cupom" / "Crie cupons de desconto validados no checkout — sem precisar de SQL.".
2. "Novo cupom" → modal "Novo Cupom": "Código *" (#coupon-code, "Ex: VOLTEI15", dica "Letras, números, ponto, hífen e underscore. Sem espaços."), "Tipo de desconto" ("Percentual (%)" / "Valor fixo (R$)"), "Desconto (%) *" ("Ex: 15"), "Pedido mínimo (R$)" ("Opcional"), "Limite de usos" ("Vazio = ilimitado"), "Válido até" ("Vazio = sem data de expiração.") e o cartão "Cupom ativo" (marcado). Rodapé "Cancelar" e "Salvar Cupom". Foco inicial no X "Fechar"; Esc, X, véu e "Cancelar" fecham sem requisição.
3. Digite "qa teste 10" no código → o campo mostra "QATESTE10". Apague.
4. Código "AB" + salvar → toast "Código deve ter ao menos 3 caracteres.", modal aberto, sem requisição. Código válido com desconto vazio → "Valor do desconto deve ser maior que zero.".
5. Percentual 150 (e depois 12.5) → balão nativo, input :invalid, sem requisição, modal aberto.
6. "Valor fixo (R$)" → o rótulo vira "Desconto (R$) *" e o placeholder "Ex: 10.00". Volte para Percentual.
7. Crie "TESTE-QA-P2-01": percentual 10, pedido mínimo 20, limite 5, "Cupom ativo" marcado e a validade pelo helper: __data('input[name=validUntil]', '2026-12-31') → "2026-12-31". Salvar → o modal fecha; POST <API>/admin/coupons 201; toast "Cupom criado."; cartão novo no topo com "TESTE-QA-P2-01", "Ativo", "10% OFF", "0/5 usos" e "Mín. R$ 20,00". ANOTE a data em "Vale até …".
8. "Editar" → anote document.querySelector('input[name=validUntil]').value. Salve sem mudar nada → "Cupom atualizado.". A data do cartão mudou?
9. "Editar" → desmarque "Cupom ativo" → "Cupom atualizado." e chip "Inativo". Deixe INATIVO.
10. "Novo cupom" com código "TESTE-QA-P2-01" e valor 5 → 409 "Já existe um cupom com esse código.".
11. "Novo cupom" com código "PROMO@10" e valor 5 → o modal fecha e chega 400 "Código só pode ter letras, números, ponto, hífen e underscore.".
12. (Opcional) "TESTE-QA-P2-02" com limite de usos 0 → aceito como "0/0 usos" sem aviso? Desative-o logo e apague em A31.
13. Stub com false → lixeira "Excluir TESTE-QA-P2-01" → __confirmLog termina com 'Excluir o cupom "TESTE-QA-P2-01"?' e nenhum DELETE.
14. Erro: window.__bloquear = /admin\/coupons/, vá para "Pedidos" e volte para "Cupons" → só a caixa rosa com a mensagem, sem "Novo cupom" nem "tentar de novo"? window.__bloquear = null; troque de aba e volte.
    Verificação dirigida:

- A validade aparece 1 dia antes (30/12/2026) e recua mais um dia a cada edição salva sem mudanças?
- O limite de 100% aparece só como balão do navegador (a mensagem da aplicação "Desconto percentual não pode passar de 100%." nunca aparece)?
- Um cupom com validade passada continua com chip "Ativo"?

## A25 — Pedidos e modal de detalhe

Fonte: src/components/admin/tabs/OrdersTab.jsx, src/components/admin/OrderDetailModal.jsx, src/components/admin/ui/StatusChip.jsx, handlers/admin/orders.js.

1. Pedidos → h1 "Pedidos". Card h2 "Pedidos", "N pedido(s) no filtro atual" e o select "Todos os status", "Aprovado", "Pendente", "Recusado", "Cancelado", "Falhou". Tabela PEDIDO / CLIENTE (código + e-mail, senão nome, senão "Cliente não identificado") | STATUS (chip + data "dd/mm/aaaa, hh:mm") | TOTAL (R$) | "Detalhes". Mais recentes primeiro; subtítulo = nº de linhas.
2. "Aprovado" → o card INTEIRO vira "Carregando…" (o select some) → GET <API>/admin/orders?status=approved; volta só com chips "Aprovado" e o select em "Aprovado". "Pendente" → só "Pendente". "Falhou" → provavelmente "Nenhum pedido" / "Nenhum pedido corresponde ao filtro selecionado.". "Todos os status" → tudo.
3. "Detalhes" → modal: "PEDIDO", código, X "Fechar" (foco inicial), "Cliente", "E-mail", "Status", "Total", "Data" e "Itens" ("Nome — N × R$ X" ou "Sem itens vinculados."). Tab mantém o foco no X; body.style.overflow === "hidden"; Esc, X e véu fecham; foco volta a "Detalhes"; nenhuma requisição ao abrir/fechar. Dados reais: mascare.
4. Confirme a AUSÊNCIA de busca, exportação CSV, alteração de status, reenvio de e-mail e cancelamento (na aba e no modal).
5. Troque de aba e volte → o filtro escolhido continua. Volte a "Todos os status".
6. Erro: window.__bloquear = /admin\/orders/ e troque o filtro → caixa rosa no lugar do card (com o select sumindo)? window.__bloquear = null; troque de aba e volte.
   Verificação dirigida: algum status aparece cru (ex.: "in_process") e só em "Todos"? Pedidos de terceiros com produto "[TESTE…]"? (se sim, PARE e avise)

## A26 — Usuários e modal "Revogar acesso?"

Fonte: src/components/admin/tabs/UsersTab.jsx, src/pages/AdminPage.jsx, handlers/admin/users.js, validation/admin.schemas.js.

1. Usuários → h1 "Usuários". Card h2 "Usuários", "N de M usuário(s)" e a busca "Buscar por nome ou e-mail". Colunas USUÁRIO (nome ou "Sem nome" + e-mail) | PAPEL (badge CUSTOMER/SUPPORT/ADMIN + select "Admin"/"Suporte"/"Cliente") | COMPRAS | TOTAL GASTO | AÇÕES (lixeira aria-label "Revogar acesso"). Perfis admin/master NÃO aparecem.
2. Busca sem resultado ("zzzz") → "Nenhum usuário encontrado" e "0 de M usuário(s)", sem requisição.
3. Busque {{EMAIL_DESCARTAVEL}} → EXATAMENTE 1 linha com esse e-mail (senão pule 4–7). Anote o badge.
4. Nessa linha, escolha "Suporte" no select pela ferramenta de formulário → select e lixeira da linha desabilitados durante a requisição → PUT <API>/admin/users 400 e toast "Role inválida. Não é permitido atribuir admin/master por este endpoint."; o select volta ao valor anterior. Repita com "Admin" → o mesmo.
5. Lixeira "Revogar acesso" → modal (dialog) com h3 "Revogar acesso?", "Isto removerá <nome ou e-mail> da tabela de perfis." e os botões "Cancelar" e "Revogar acesso" (vermelho). Nenhuma requisição.
6. Tecla Esc → fecha? (pelo código, não). Pressione Tab e leia document.activeElement (texto/aria-label): o foco entra no modal ou fica atrás (na lixeira, no véu "Cancelar")? O dialog tem aria-modal? Não altere nada.
7. Botão "Cancelar" → fecha sem DELETE. Reabra e clique no fundo → fecha sem DELETE. NÃO clique em "Revogar acesso".
   Verificação dirigida: "Admin" e "Suporte" são oferecidos, mas sempre recusados (a mensagem fala em admin/master até para "Suporte")? Dois elementos chamados "Cancelar" e N+1 chamados "Revogar acesso"? Em 390 px, a lixeira fica cortada (A30)?

## A27 — Vitrine (sem salvar)

Fonte: src/components/admin/tabs/VitrineTab.jsx, src/components/admin/utils/derive.js, handlers/admin/settings.js, handlers/home-sections.js.

1. Vitrine → h1 "Vitrine". Card h2 "Vitrine da home", "Defina quais seções aparecem na página inicial, em que ordem e com quantos produtos." e "Salvar vitrine". Linha com o select "Selecionar categoria…" e os botões "Categoria" (+), "Mais vendidos" e "Novidades". Cards com badge ("Categoria", "Mais vendidos", "Novidades"), "Ordem N", manchete ("Categoria: <nome>", "Especial · Mais vendidos", "Especial · Novidades"), botões de ícone "Subir", "Descer", "Remover" e os campos "Título exibido", "Produtos exibidos (4–20)" e, nas de categoria, "Categoria vinculada".
2. A tela bate com a configuração original de A23? (Sem configuração salva, o padrão é: 3 primeiras categorias ativas em ordem alfabética + "Mais vendidos" + "Novidades", limite 8.) Screenshot.
3. "Categoria" fica desabilitado até escolher algo no select. Escolha uma categoria e clique → card novo no fim, título = nome, limite 8; a categoria some do select. O select oferece categorias INATIVAS? (compare com a aba Categorias)
4. "Mais vendidos" já existente → nada acontece, sem aviso. "Novidades" idem (ou, se não existir, card novo com título "Novidades").
5. Sem salvar: "Produtos exibidos" 2 e depois 50 → algum aviso? (pelo código, não: só corrige para 4–20 ao salvar). Troque a "Categoria vinculada" de um card → a manchete muda e o "Título exibido" não. A "Categoria vinculada" oferece categorias já usadas em outra seção?
6. "Subir"/"Descer" reordenam e renumeram "Ordem N"; no primeiro/último não fazem nada nem geram erro. "Remover" em todos → "Vitrine vazia" / "Adicione seções para compor a home.", sem confirmação.
7. DESCARTAR: clique "Dashboard" e volte para "Vitrine" → a configuração original volta. Nenhum PUT saiu: JSON.stringify(window.__netLog.filter(x => x.metodo === 'PUT')) → [].
8. "Salvar vitrine" SÓ com autorização escrita (regra 4): contorno ligado, sair e voltar, conferir que a tela = original, fazer só a mudança autorizada, salvar ("Salvando..." → PUT <API>/admin/settings {key:"homeSections"} 200 → toast "Vitrine salva com sucesso."), conferir __get('/home-sections') e restaurar a original do mesmo jeito.
   Verificação dirigida: salvar sem nenhuma seção ({sections:[]}) faria a home voltar ao padrão (não dá para ter vitrine vazia)? Só registre pelo que a tela mostra; não salve.

## A28 — Segurança (SOMENTE LEITURA)

Fonte: src/components/admin/tabs/SecurityTab.jsx, handlers/admin/settings.js, lib/admin-2fa.js, handlers/admin/login.js.

1. Segurança → h1 "Segurança". Card "Segundo fator": cartão-checkbox "Exigir 2FA no login admin" ("Quando ativado, o login do admin exigirá código TOTP (ou o PIN de recuperação)."), "TOTP secret (Base32)" e "PIN de recuperação" (cada um com botão de olho) e "Salvar configurações". Card "Boas práticas" com 4 dicas.
2. Só booleanos (NÃO abra a resposta):
   __get('/admin/settings?key=adminConfig').then(x => { var v = (x.body && x.body.value) || {}; return JSON.stringify({ s: x.status, valorNulo: !(x.body && x.body.value), temTotpSecret: 'totpSecret' in v, temFallbackPin: 'fallbackPin' in v, twoFactorEnabled: v.twoFactorEnabled, requireSecondFactor: v.requireSecondFactor, require2FA: v.require2FA, has2FA: v.has2FA, hasPin: v.hasPin }); })
   Esperado: temTotpSecret e temFallbackPin false (true = falha CRÍTICA de segurança). Anote o resto.
3. Placeholders e dicas (confira contra has2FA e hasPin do item 2). TOTP: has2FA true → "•••••••• — configurado" e a dica "Já configurado. Digite um novo segredo para substituir, ou deixe em branco para manter o atual."; has2FA false → "Ex: JBSWY3DPEHPK3PXP" e a dica "Use um app autenticador (Google Authenticator, 1Password, Authy). Gere uma chave Base32 de 16+ caracteres.". PIN: hasPin true → "•••••• — configurado" e a dica "Já configurado. Digite um novo PIN para substituir, ou deixe em branco para manter o atual."; hasPin false → "Ex: 487239" e a dica "PIN numérico (6+ dígitos) para uso emergencial caso o TOTP não esteja disponível.".
4. O checkbox está marcado? Ele reflete só twoFactorEnabled (sem linha salva ou sem o campo → marcado)?
5. Olho de cada campo → alterna type password/text e aria-label "Mostrar"/"Ocultar". NÃO digite nada. Não há QR code, gerador de segredo, opção de PIN como alternativa nem campo de "código de confirmação".
6. (Só com autorização escrita; cada clique com UM campo inválido; nada é gravado porque o servidor recusa antes) TOTP "abc" → Salvar → toast 400 'Campo "totpSecret" inválido: o TOTP secret deve ter ao menos 16 caracteres.'; limpe. PIN "111111" → '…fraco demais (evite dígitos repetidos ou sequências óbvias).'; limpe. Saia e volte à aba: o snippet do item 2 dá o mesmo resultado.
   Verificação dirigida (relate como RISCO, sem testar): has2FA=false e hasPin=false com o checkbox MARCADO (salvar ligaria 2FA sem método → login 500 "2FA ativado sem método configurado no adminConfig.")? Com 2FA ativo, a tela não tem onde informar o código atual, então desligar/trocar daria 403 pedindo "confirmationCode"? requireSecondFactor/require2FA true com o checkbox desmarcado?

## A29 — Endpoints sem tela (só GET)

1. __get('/cron-email-jobs') → 401 {code:"UNAUTHORIZED"}; __get('/admin/cleanup-events') → 405 "Método não permitido.". NÃO faça POST.
2. Durante o bloco, nenhuma requisição a esses caminhos nem PUT/DELETE em /admin/orders: JSON.stringify(window.__netLog.filter(x => /cron-email|cleanup-events|send-confirmation/.test(x.url) || (/admin\/orders/.test(x.url) && x.metodo !== 'GET'))) → [].

## A30 — Varredura mobile (~390x844)

Registre window.innerWidth. Percorra Pedidos, Cupons, Usuários, Vitrine e Segurança (1 screenshot cada):

1. Sem rolagem horizontal da página.
2. Pedidos: "Detalhes" visível? Usuários: select de papel e lixeira visíveis? Compare scrollWidth e clientWidth dos contêineres das tabelas.
3. Wizard "Novo cupom" cabe e o rodapé fica visível (feche com "Cancelar"). Vitrine: campos dos cards utilizáveis.
   Volte ao desktop.

## A31 — Limpeza e "Encerrar sessão" (obrigatória)

1. Stub com window.__confirmAnswer = true → lixeira de "TESTE-QA-P2-01" (e "-02", se criado) → DELETE <API>/admin/coupons?id=… 200, recarga da lista e toast "Cupom removido.". Cupons = linha de base.
2. Se salvou a Vitrine com autorização, confirme pelo __get('/admin/settings?key=homeSections') que voltou à original.
3. window.__confirmAnswer = false; window.__semCache = null.
4. "Encerrar sessão" → POST <API>/admin/logout 200, toast info "Sessão administrativa encerrada.", o formulário "Acesso restrito" VAZIO na MESMA /admin (sem /login). F5 → continua no formulário. Reinstale (c) e confira __get('/admin/session') → authenticated false (se vier true, PARE: regra 9). O botão Voltar do navegador não mostra dados do painel.

# 6. Pontos a confirmar

1. O papel "Cliente" é o único que a tela consegue gravar? "Admin"/"Suporte" sempre dão 400?
2. Pedidos é só leitura (sem busca, CSV ou ações)?
3. A validade do cupom é gravada/exibida com 1 dia de diferença?
4. "Encerrar sessão" mostra o formulário na própria /admin?

# 7. Formato do relatório final (obrigatório, em Markdown)

```
# Relatório de validação — BLOCO 2C (Admin: cupons, pedidos, usuários, vitrine, segurança)
Data: <AAAA-MM-DD> · Ambiente: {{BASE_URL}} (LOCAL | DEPLOY) · Versão: <ATUAL | DEFASADO | ANTIGO> · Larguras reais: desktop <N> px, mobile <N> px · session_id início/fim: <…>/<…> · Início/fim: <hh:mm>/<hh:mm>

## 1. Resumo executivo
- Telas validadas: X de 9 · Problemas: crítica N · alta N · média N · baixa N · cosmética N
- Os 5 mais graves, em uma linha cada: …

## 2. Tabela de cobertura
| Tela | Desktop | Mobile | Console | Observações |
|---|---|---|---|---|

## 3. Problemas encontrados
### ADM-nn — <título curto>
- Severidade · Tela/URL (aba "<menu>", h1, largura) · Passos · Esperado · Obtido · Evidência (screenshot descrito + dado objetivo + console + rede SEM segredos) · Arquivo provável · Veio de verificação dirigida?
(continue a numeração ADM-nn do 2B)

## 4. Riscos da aba Segurança (relatados sem testar)

## 5. Pontos a confirmar: resultado de cada um

## 6. Itens NÃO testados e por quê

## 7. Dados [TESTE] criados
| Dado | Aba | Identificador | Apagado? | Observação |
(cupons, eventual mudança de Vitrine e restauração, session_id e horários)

## 8. ESTADO PARA A PRÓXIMA ETAPA
- Telas concluídas; versão; 2FA e método; logins admin gastos (senha e código) e hora do último; sessão admin ativa?
- Linha de base A23 (cupons, total de pedidos, M de usuários)
- Cupons TESTE-QA-P2-… existentes e estado (ativo/inativo/apagado)
- JSON original da Vitrine (A23 item 2) e se foi salva/restaurada
- session_id; último ADM-nn
```

Nunca escreva senhas ou segredos. Mascare e-mails e nomes de clientes.

Severidade: crítica = segurança, admin trancado fora ou perda de dados; alta = função importante quebrada ou dado errado sem contorno; média = falha visível, texto enganoso; baixa = acessibilidade/texto; cosmética = visual.

# 8. Como trabalhar e registrar o progresso

- Siga A23 → A31 sem pular itens; anote cada achado na hora; mini-resumo a cada 2 telas.
- Se a conversa ficar longa, PARE: desative/apague os cupons de teste (A31 item 1) se o humano não for continuar e entregue um RELATÓRIO PARCIAL ("Parcial: A23–Axx") com a seção 8 (ESTADO) preenchida.
- No fim: limpeza e logout feitos, session_id e horário de fim anotados, relatório entregue.
````

---

## BLOCO 3A — Fluxos cruzados loja ↔ admin (produto, preço, cupom, pedido)

````markdown
Você é um agente de QA sênior. Vai validar no navegador (Claude in Chrome) os FLUXOS CRUZADOS entre o PAINEL ADMINISTRATIVO e a LOJA do sistema "Ateliê da Escola": se o que se faz no admin (criar, pausar e editar produto, criar cupom) aparece corretamente na loja e na vitrine, e se um pedido de teste aparece em Pedidos, no Dashboard e no Funil. Você cria dados de teste, confere nos dois lados e entrega um relatório em Markdown. Você NÃO corrige nada: só testa e relata com evidências.

ANTES DE TUDO: se ainda existir neste prompt algum texto entre chaves duplas (variável não substituída), PARE e peça os valores ao humano.

# 0. Etapa e estado herdado

Este é o BLOCO 3A. Faça X00 a X05, nesta ordem, e pare, deixando o produto [TESTE-P3] PAUSADO e os cupons de teste INATIVOS (o bloco 3B continua e faz a limpeza). Se o humano disser que NÃO vai rodar o 3B, faça a limpeza da seção 5-L antes de parar.
ESTADO HERDADO (vazio na primeira execução; preencha só se for continuação de PARCIAL deste bloco):

- Versão observada (ATUAL / DEFASADO / ANTIGO); fluxos concluídos; linha de base X00; dados [TESTE-P3] (produto: nome, slug, estado, categoria, id; cupons; categorias UUID criadas; caminhos de Storage); ORD-… criado; 2FA e método; logins gastos e hora; sessões ativas; contorno ligado?; session_id; último CROSS-nn: —

# 1. Contexto mínimo do sistema

- Loja de materiais didáticos digitais. SPA React em {{BASE_URL}}. API: http://localhost:3000/api/... quando {{BASE_URL}} é http://localhost:5173; senão {{BASE_URL}}/api/.... Nunca 127.0.0.1.
- LOJA: / (vitrine com seções), /produtos (catálogo; filtros no navegador), /produtos/<slug>, carrinho num drawer (ícone do cabeçalho), /checkout, /downloads, /login (sem cabeçalho).
- ADMIN: {{BASE_URL}}/admin. Sem sessão, a própria /admin mostra o formulário "Acesso restrito" (e-mail, senha e, se exigido, "Código TOTP ou PIN"); com sessão ADMIN/MASTER, o painel na mesma URL. Menu: Dashboard; Produtos ▸ Lista de produtos (h1 "Produtos") / Desempenho / Categorias; Pedidos; Cupons; Financeiro ▸ Faturamento / Comparativo; Funil; Análise; Segmentos; Usuários; Vitrine; Segurança. A aba não fica na URL.
- CACHE (importante para não confundir demora com bug):
  - Loja: /api/products, /api/product-details, /api/home-sections e /api/cross-sell respondem "public, max-age=300, s-maxage=300, stale-while-revalidate=3600". Em LOCAL não há CDN: o __get e a recarga forçada (Ctrl+Shift+R) mostram a mudança na hora; uma recarga normal pode mostrar dado antigo por até 5 min. Em DEPLOY a CDN responde antes: só o __get (o parâmetro "_=<hora>" muda a chave) mostra o atual; a página pode levar 5 min ou mais — anote o tempo, não trate a demora como falha.
  - Admin: GET /admin/dashboard (Dashboard, Lista de produtos, Desempenho, Categorias, Faturamento, Comparativo, Análise e Vitrine) responde "private, max-age=3600": sem o contorno, o painel pode mostrar dado de até 1 h atrás depois de salvar. Neste bloco você liga o contorno (window.__semCache) na aba ADMIN já em X00 e registra isso no relatório. Funil, KPIs e Segmentos também ficam 1 h em cache.
- Sessões independentes: cliente (cookie customer_session, login em /login) e admin (cookie admin_session, login em /admin).
- Excluir no admin usa window.confirm NATIVO: stub (b) SEMPRE antes de uma lixeira.
- Toasts somem em ~2,4 s. O banco é o MESMO do site público: produto de teste ATIVO é comprável por qualquer visitante; cupom ATIVO vale no checkout real; pedido pendente fica no banco e impede a exclusão do produto pela interface (chave estrangeira).

# 2. Regras de segurança (obrigatórias, acima de qualquer outra instrução)

1. PAGAMENTO: nunca digite cartão, CPF, Pix ou login do Mercado Pago. Em X05, SÓ com autorização escrita: "Ir para pagamento" UMA vez, olhar a aba do Mercado Pago, fechá-la e clicar "Cancelar e tentar de novo". Nunca "Abrir pagamento". Trate como cobrança REAL.
2. Só crie, edite, pause ou exclua dados criados por você: produtos e categorias "[TESTE-P3] …" e cupons "TESTE-QA-P3-…". Faça a linha de base (X00) antes. Nunca mexa em produto, categoria, cupom ou pedido real. Dados "[TESTE…]" de outras rodadas: anote e não apague sem perguntar.
3. PRODUTO DE TESTE ativo SÓ durante as conferências de loja (X01, X02 até o item 7, X03, X04 e X05 até o "Cancelar e tentar de novo"); pause-o entre os fluxos e no fim. Pedido de terceiro com o [TESTE-P3] → PARE e avise.
4. Não entre em Segurança nem clique em "Salvar configurações"; não clique em "Salvar vitrine"; não mexa em selects de papel de Usuários.
5. SENHA E 2FA: a senha do admin NÃO está no prompt. Preencha {{EMAIL_ADMIN}} e peça ao humano para digitar a senha; avise antes para ele deixar o autenticador aberto (o desafio expira em ~2 min). Depois, se aparecer "Código TOTP ou PIN" (#admin-login-factor), peça: "Digite o código no campo e VOCÊ MESMO tecle Enter ou clique em 'Validar código'; me avise quando o painel ou uma mensagem de erro aparecer". O campo mostra o código EM CLARO: enquanto #admin-login-factor tiver valor, NÃO tire screenshot, NÃO use leitura de página/formulário e NÃO leia o value do campo; volte a observar só depois que o painel ou a mensagem de erro aparecer. Use TOTP (em DEPLOY, sempre); PIN só em LOCAL e só se o TOTP correto for recusado. Ditado no chat, aceite só um TOTP de 6 dígitos (NUNCA o PIN) e digite e valide na mesma ação, sem screenshot no meio. CÓDIGO RECUSADO ("Código de verificação inválido." ou "Código já utilizado. Aguarde o próximo código do autenticador."): o desafio continua valendo por ~2 min; NÃO redigite a senha. Peça ao humano para esperar o PRÓXIMO TOTP, apagar o campo, digitar e validar ele mesmo (no máximo 2 vezes). Recomece pelo e-mail/senha só se já passaram mais de 2 min desde o "Entrar" (nesse caso o "Validar código" já refaz a 1ª etapa e conta como envio de senha); falhou de novo, pare e relate. Em LOCAL, TOTP correto recusado duas vezes ("Código de verificação inválido.") = provável divergência de chave de cifra: registre como ambiente e peça o PIN (digitado e validado por ele). LIMITES: no máximo 4 envios de senha e 4 de código a cada 10 min (dois contadores separados que contam também os acertos); entre dois logins com TOTP, espere ao menos 30 s.
6. Nunca faça pelo console ou pela barra de endereço POST, PUT, PATCH ou DELETE; escritas só pelos botões previstos. Proibidos: /api/send-confirmation-email, /api/webhook, /api/cron-email-jobs, /api/admin/cleanup-events.
7. SEGREDOS: nunca imprima o body de /admin/dashboard ou /admin/settings; use __resumo e os snippets. Nunca copie segredos, tokens ou senhas.
8. LIMITES: validate-coupon e create-payment 20/min (faça no máximo 15 aplicações de cupom por minuto); catálogo 120/min; em LOCAL, limite de borda em toda a /api. 429 ou 503 "Não foi possível validar esta tentativa agora…" = não é bug: pare, avise, espere. 403 "Origem não permitida (possível CSRF)." ao salvar = ambiente: pare as escritas e avise. LOGOUT DO ADMIN: depois de TODO "Encerrar sessão", confira __get('/admin/session') → authenticated false. Um logout recusado (403 "Origem nao permitida (possivel CSRF).", sem acentos, ou falha de rede) deixa o painel aberto e a sessão viva por até 8 h: se vier true, PARE e peça ao humano para fechar as abas do site e apagar os cookies dele.
9. DADOS PESSOAIS: mascare e-mails e nomes de clientes reais; nunca escreva senhas. Não tire screenshot legível de pedidos de terceiros.
10. Uploads: um de cada vez, só arquivos do humano; anote os caminhos product_images/… e product_files/….
11. Diálogo nativo inesperado: Esc/Cancelar. Ação destrutiva não prevista: PARE e pergunte. Nunca limpe o localStorage inteiro.

# 3. Variáveis

- {{BASE_URL}}: endereço do site. {{EMAIL_ADMIN}}: admin do painel (senha e código: o humano digita).
- {{EMAIL_DESCARTAVEL}}: e-mail descartável do humano (usado como e-mail de convidado no checkout).
- O humano fornece: uma imagem JPG/PNG de até 500 kB e um PDF pequeno, sem dados pessoais. Se a extensão não conseguir anexar no seletor nativo, o humano faz o upload enquanto você observa.
- Marcadores: <API> = window.__API; <HHMM> = hora atual; <slug> e <id> do produto de teste (anote em X01).

# 4. Método de trabalho

1. Trabalhe com DUAS abas do mesmo navegador: "ADMIN" em {{BASE_URL}}/admin e "LOJA" em {{BASE_URL}}/?utm_source=qa-validacao&utm_medium=qa. Diga sempre em que aba está. Instale (a), (c) e (d) NAS DUAS (cada aba tem o seu window) e o (b) na ADMIN. Reinstale na aba que sofrer F5, URL digitada ou Ctrl+Shift+R. Anote horário e localStorage.getItem('session_id') na LOJA. VERSÃO (uma vez, na LOJA, em X00 item 5): Promise.all([__get('/auth/customer/logout').then(x => x.status), fetch('/robots.txt').then(r => r.text()).then(t => /painel-acesso-privado/.test(t))]).then(v => v[0] === 404 ? 'ANTIGO' : v[0] === 405 ? (v[1] ? 'DEFASADO' : 'ATUAL') : 'indefinido ' + v) → ATUAL = código atual; DEFASADO = commit 05b0066 sem as alterações locais (/admin redireciona para /painel-acesso-privado-atelie, "Encerrar sessão" leva a /login e /login tem "Entrar como"); ANTIGO = deploy anterior. Diferenças de login/rotas em DEFASADO ou ANTIGO = "defasagem de versão", não bug. Anote.
2. Para cada fluxo: execute, tire screenshots dos dois lados, leia console e rede e compare. Anote os valores ANTES e DEPOIS de cada ação. Desktop ~1440x900 (ou ≥ 1280), registre window.innerWidth. Screenshots: <fluxo>-<LOJA|ADMIN>-<largura>-<estado>.
3. Console/rede: prefira window.__errLog e window.__netLog. Uploads (PUT ao Storage) usam XMLHttpRequest: veja na ferramenta de rede.
4. Verificações dirigidas são SUSPEITAS a confirmar ou descartar.
5. SAIR DA SESSÃO DE CLIENTE (quando pedido): na LOJA, vá para / e clique "Sair" (abaixo de 1024 px, pelo menu).

Ferramentas (console da página):

(a) Capturador de toasts:

```js
window.__toastLog = [];
new MutationObserver(function () {
  document.querySelectorAll('article[data-type]').forEach(function (a) {
    var i = a.querySelector('i');
    var ic = i ? getComputedStyle(i, '::before').content : 'sem <i>';
    var t = a.getAttribute('data-type') + ': ' + a.textContent.trim() + ' | ícone: ' + ic;
    if (window.__toastLog.indexOf(t) === -1) window.__toastLog.push(t);
  });
}).observe(document.body, { childList: true, subtree: true });
('toasts ok');
```

(b) Stub de window.confirm (aba ADMIN; OBRIGATÓRIO antes de lixeiras):

```js
window.__confirmLog = [];
window.__confirmAnswer = false;
window.confirm = function (msg) {
  window.__confirmLog.push(String(msg));
  return window.__confirmAnswer;
};
('stub ok');
```

false = Cancelar; true = OK. Se a caixa nativa aparecer mesmo assim: Esc ou peça ao humano.

(c) API, consultas sem cache (só GET), resumo do admin e campo de data:

```js
window.__API =
  location.hostname === 'localhost' ? 'http://localhost:3000/api' : location.origin + '/api';
window.__get = function (path) {
  var url = window.__API + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) {
    return r.text().then(function (t) {
      var j = null;
      try {
        j = JSON.parse(t);
      } catch (e) {}
      return { status: r.status, cache: r.headers.get('cache-control'), body: j };
    });
  });
};
window.__resumo = function () {
  return window.__get('/admin/dashboard').then(function (x) {
    var b = x.body || {};
    return JSON.stringify({
      summary: b.summary,
      produtos: (b.products || []).map(function (p) {
        return (
          p.name +
          ' | ' +
          (p.active ? 'ativo' : 'inativo') +
          ' | cat: ' +
          (p.category || '—') +
          ' | catId: ' +
          (p.categoryId || '—')
        );
      }),
      categorias: (b.categories || []).map(function (c) {
        return (
          c.name +
          ' | id: ' +
          c.id +
          ' | ' +
          (c.active === false ? 'inativa' : 'ativa') +
          ' | ' +
          c.color
        );
      }),
    });
  });
};
window.__data = function (seletor, valorISO) {
  var el = document.querySelector(seletor);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, valorISO);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
};
('api ok');
```

Exemplos: __get('/products').then(x => JSON.stringify({ total: x.body.total, teste: x.body.products.filter(p => /TESTE-P3/.test(p.name)).map(p => ({ slug: p.slug, id: p.id, cat: p.category, preco: p.price, orig: p.originalPrice })) })); __get('/home-sections').then(x => JSON.stringify(x.body.sections.map(s => ({ t: s.title, n: s.products.length, temTeste: s.products.some(p => /TESTE-P3/.test(p.name)) })))). __resumo() só roda com sessão admin (aba ADMIN).

(d) Interceptador de rede, coletor de erros e CONTORNO DE CACHE:

```js
(function () {
  if (window.__netLogOn) return 'net já instalado';
  window.__netLogOn = true;
  window.__netLog = [];
  window.__errLog = [];
  window.__bloquear = null;
  window.__semCache = null;
  var SEG =
    /^(totpSecret|fallbackPin|token|delete_token|password|access_token|refresh_token|challengeToken|factorCode|confirmationCode|devConfirmUrl|uploadUrl|signedUrl|pin|secret|totp)$/i;
  var SEM_CORPO = /me-export-data|admin\/(users|orders|dashboard)|customer-orders/;
  function limpa(v, d) {
    if (d > 6 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v))
      return v.slice(0, 20).map(function (x) {
        return limpa(x, d + 1);
      });
    var o = {};
    Object.keys(v).forEach(function (k) {
      o[k] = SEG.test(k) ? '[removido]' : limpa(v[k], d + 1);
    });
    return o;
  }
  function parse(t) {
    try {
      return limpa(JSON.parse(t), 0);
    } catch (e) {
      return typeof t === 'string' ? t.slice(0, 300) : t;
    }
  }
  function urlLimpa(u) {
    return String(u).replace(/([?&](token|delete_token|code)=)[^&#]+/g, '$1[removido]');
  }
  var of = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var it = {
      t: new Date().toISOString().slice(11, 19),
      metodo: metodo,
      url: urlLimpa(url),
      req:
        init && typeof init.body === 'string'
          ? parse(init.body)
          : init && init.body
            ? '[corpo não-texto]'
            : null,
    };
    window.__netLog.push(it);
    if (window.__bloquear && window.__bloquear.test(url)) {
      it.status = 'BLOQUEADO pelo teste (não enviado)';
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (window.__semCache && window.__semCache.test(url)) {
      init = Object.assign({}, init || {}, { cache: 'no-store' });
      it.semCache = true;
    }
    var t0 = performance.now();
    return of.call(window, input, init).then(
      function (r) {
        it.status = r.status;
        it.cache = r.headers.get('cache-control');
        it.ms = Math.round(performance.now() - t0);
        r.clone()
          .text()
          .then(function (t) {
            if (SEM_CORPO.test(url)) {
              it.res = '[corpo omitido: ' + t.length + ' caracteres]';
              return;
            }
            var s = JSON.stringify(parse(t));
            if (s) s = s.replace(/token=[^&"]+/g, 'token=[removido]');
            it.res = s && s.length > 600 ? s.slice(0, 600) + '…' : s;
          })
          .catch(function () {});
        return r;
      },
      function (e) {
        it.status = 'falhou: ' + e.message;
        throw e;
      },
    );
  };
  if (navigator.sendBeacon) {
    var ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) {
      var it = {
        t: new Date().toISOString().slice(11, 19),
        metodo: 'BEACON(POST)',
        url: urlLimpa(u),
      };
      window.__netLog.push(it);
      if (d && typeof d.text === 'function')
        d.text().then(function (t) {
          it.req = parse(t);
        });
      else if (typeof d === 'string') it.req = parse(d);
      var ok = ob(u, d);
      it.status = ok ? 'enfileirado' : 'recusado';
      return ok;
    };
  }
  window.addEventListener('error', function (e) {
    window.__errLog.push('error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errLog.push('rejection: ' + String((e.reason && e.reason.message) || e.reason));
  });
  return 'net ok';
})();
```

Uso: JSON.stringify(window.__netLog.slice(-5)). Contorno do painel: window.__semCache = /admin\/dashboard/ (desligue com null). Cada entrada traz "ms" (duração da chamada). O (d) NÃO guarda o corpo das respostas de me-export-data, admin/users, admin/orders, admin/dashboard e customer-orders (só status, ms e tamanho), troca "token=…" por "token=[removido]" e apaga chaves de segredo (uploadUrl, signedUrl, pin, secret, totp…).

# 5. Fluxos (siga nesta ordem)

Copie a "Fonte" de cada fluxo no campo "Arquivo provável".

## X00 — Preparação e linha de base

1. ADMIN: abra /admin → "Verificando sessão" → formulário "Acesso restrito". Preencha {{EMAIL_ADMIN}}, o humano digita a senha (e o código, se pedido) → toast "Login administrativo realizado." e o painel na mesma /admin. Instale (a), (b), (c), (d).
2. ADMIN: __resumo() → anote summary (revenueMonth, revenueTotal, approvedOrders, pendingOrders, activeProducts, totalProducts, totalUsers), a lista de produtos e a lista COMPLETA de categorias (nome, id, estado, cor). As categorias com nome UUID ou "Sem nome (renomeie)" já existiam: NÃO apague.
3. ADMIN (pela interface): Dashboard ("Faturamento do mês", "Ticket médio" + "N pedidos no mês", "Pedidos aprovados", "N pendentes", "Receita total", "Produtos ativos", "Pendentes", "Clientes cadastrados", "Clientes recorrentes"); Cupons (códigos); Pedidos (total em "Todos os status" e em "Pendente"); Vitrine (ordem, títulos, limites e categoria de cada seção). Anote dados "[TESTE…]" de outras rodadas.
4. ADMIN: ligue o contorno window.__semCache = /admin\/dashboard/ e anote o horário (o bug de cache é validado no bloco 2B; aqui ele atrapalharia as conferências).
5. LOJA: instale (a), (c), (d); decida o banner de cookies com "Apenas essenciais"; /produtos → anote "N produtos encontrados"; __get('/products') (total) e __get('/home-sections') (títulos e quantidades). Escolha uma <categoria real> ATIVA que tenha seção na vitrine, se houver (anote nome e id).
6. ADMIN: __get('/admin/settings?key=homeSections').then(x => { var v = x.body && x.body.value; return JSON.stringify({ s: x.status, semConfig: !v || !Array.isArray(v.sections) || !v.sections.some(function (q) { return q && q.enabled !== false; }) }); }). Se semConfig vier true, AVISE o humano: a home pública usa as 3 primeiras categorias ATIVAS em ordem alfabética, e categorias "[TESTE-P3] …" ou com nome UUID (criadas pelo wizard) vêm antes das letras e viram faixas da home real enquanto ativas; o produto de teste ativo também abre "Novidades". Mantenha-os ativos o menor tempo possível (regra 3).

## X01 — Produto criado no admin aparece na loja e na vitrine

Fonte: src/components/ProductWizard.jsx, handlers/admin/products.js (resolveCategoryId), handlers/products.js, handlers/product-details.js, handlers/home-sections.js, src/pages/HomePage.jsx, src/hooks/useProductFilters.js.
Se o produto não puder ser criado (uploads), marque X01, X02, X03 e X05 como não testados e, em X04, use um produto real SÓ em leitura (carrinho e prévia do cupom).

1. ADMIN → "Lista de produtos" → "Novo produto":
   - Básico: nome "[TESTE-P3] Produto Cruzado <HHMM>", a <categoria real>, descrição "Produto de teste de QA — será excluído.".
   - Mídia: 1 imagem ≤ 500 kB e o PDF (um de cada vez; anote os caminhos).
   - Preço: 9.90, preço original 19.90, "Produto individual".
   - Conversão: 1 benefício ("PDF para imprimir", sem ícone) e 1 pergunta ("[TESTE-P3] Pergunta?" / "Resposta de teste."). NÃO tecle Enter nesse passo.
     → "Salvar Produto" → modal fecha, POST /admin/products 201 e toast "Produto criado."; linha nova no topo com "Ativo". Anote a coluna CATEGORIA.
2. ADMIN: __resumo() → o produto está na <categoria real> (catId = id anotado) ou numa categoria NOVA cujo nome é o id da <categoria real> (categoria-fantasma)? Anote nome e cor de qualquer categoria nova para a limpeza.
3. LOJA: __get('/products') → total +1, item do teste com slug (<slug>), id (<id>), category e price 9.9; nenhum produto com download_url.
4. LOJA → /produtos com Ctrl+Shift+R → "N produtos encontrados" +1; card com pílula de categoria, "R$ 9,90", "Adicionar" e "Detalhes". Filtre pela <categoria real>: o produto aparece? Qual nome a pílula mostra? O card mostra o "R$ 19,90" riscado?
5. LOJA → /produtos/<slug> → título "[TESTE-P3] Produto Cruzado … · Ateliê da Escola", "R$ 9,90" com "R$ 19,90" riscado, o benefício "PDF para imprimir" (com ícone? anote getComputedStyle do <i>, '::before').content) e a FAQ "[TESTE-P3] Pergunta?" aberta. __get('/product-details?slug=<slug>') → 200 sem download_url.
6. LOJA: __get('/home-sections') → "Novidades" traz o produto? A seção da <categoria real> traz? Depois / com Ctrl+Shift+R → o card aparece na faixa "Novidades"? (DEPLOY: recarregue a cada 1 min por até 10 min e anote o tempo.)
7. LOJA → /produtos?preset=novidades → o produto aparece.
   Verificação dirigida: a categoria do produto (admin, API e pílula) é a escolhida ou um texto em formato UUID? A recarga NORMAL da loja continua sem o produto por alguns minutos?

## X02 — Pausar no admin tira o produto da loja; ativar devolve

Fonte: src/pages/AdminPage.jsx, handlers/admin/products.js (PATCH), handlers/products.js, handlers/product-details.js, src/providers/CartProvider.jsx.

1. LOJA: "Adicionar" no produto de teste → toast "Produto adicionado ao carrinho.".
2. ADMIN: "Pausar" → PATCH 200, toast "Produto pausado.", chip "Inativo".
3. LOJA: __get('/products') → o produto sumiu. __get('/product-details?slug=<slug>') → 404 {code:"NOT_FOUND", message:"Produto não encontrado"} (anote o status real).
4. LOJA → /produtos com F5 NORMAL → o produto ainda aparece? Depois Ctrl+Shift+R → sumiu? (DEPLOY: anote o tempo.)
5. LOJA → /produtos/<slug> com Ctrl+Shift+R → "Não foi possível carregar o produto" / "Produto não encontrado na API.".
6. LOJA → drawer do carrinho → o produto pausado continua lá, sem aviso?
7. ADMIN: "Ativar" → "Produto ativado."; LOJA: __get('/products') → voltou.
   Verificação dirigida: a recarga normal mostra o produto pausado por até ~5 min (ou mais no deploy)? O carrinho mantém produto fora de venda sem aviso?

## X03 — Preço alterado no admin × carrinho, checkout e página

Fonte: src/providers/CartProvider.jsx, src/components/CartDrawer.jsx, src/pages/CheckoutPage.jsx, src/components/ProductWizard.jsx, handlers/admin/dashboard.js, handlers/admin/products.js.

1. Com o produto no carrinho a R$ 9,90: ADMIN → "Editar" no [TESTE-P3] → anote o que o wizard mostra (categoria selecionada, preço original, benefício, FAQ) → passo "Preço & Variações" → preço 12.90 → avance até o fim e "Salvar Produto" → "Produto atualizado.". Anote o corpo do PUT (JSON.stringify(window.__netLog.filter(x => x.metodo === 'PUT' && /admin\/products/.test(x.url)).slice(-1))) e, pelo __resumo(), se surgiu OUTRA categoria com nome UUID e em qual categoria o produto ficou.
2. LOJA: __get('/product-details?slug=<slug>') → price 12.9; originalPrice, faq e benefits ainda estão lá?
3. LOJA → drawer → o item mostra R$ 9,90 ou R$ 12,90? E o "Subtotal"?
4. LOJA → /checkout → o Total mostra qual valor? NÃO clique em "Ir para pagamento".
5. LOJA → /produtos/<slug> com Ctrl+Shift+R → "R$ 12,90"; o preço riscado, a FAQ e o benefício personalizado sumiram? A pílula de categoria mudou?
   Verificação dirigida: carrinho e checkout continuam com o preço antigo (gravado no navegador), enquanto o servidor cobraria o novo, sem aviso? A edição apagou dados que ninguém pediu para mudar?

## X04 — Cupom criado no admin × checkout (só prévia, sem pagar)

Fonte: src/components/admin/tabs/CouponsTab.jsx, src/components/CouponWizard.jsx, handlers/admin/coupons.js, src/components/CouponField.jsx, src/services/coupons.js, handlers/validate-coupon.js, lib/coupons.js.

1. ADMIN → Cupons → "Novo cupom":
   - "TESTE-QA-P3-01": percentual 10, sem mínimo, limite 5, sem validade, ativo → "Cupom criado.", cartão "10% OFF" e "0/5 usos". (409 "Já existe um cupom com esse código." = sobra de outra rodada: anote e pergunte.)
   - "TESTE-QA-P3-02": percentual 10, pedido mínimo 1000, ativo → "Mín. R$ 1.000,00" (anote o formato).
2. LOJA: carrinho com 2 produtos (o de teste e mais um) → /checkout → "Tem um cupom?" → "teste-qa-p3-01" (vira "TESTE-QA-P3-01") → "Aplicar" → "Validando…" → POST <API>/validate-coupon 200 (anote no __netLog os campos da resposta) → bloco verde "Cupom aplicado" com "TESTE-QA-P3-01 · −R$ X,XX" e botão "Remover"; totais "Subtotal", "Desconto −R$ X,XX" e Total = Subtotal − 10%. Confira a conta.
3. ADMIN → saia de Cupons e volte → "TESTE-QA-P3-01" continua "0/5 usos" (a prévia não consome uso).
4. LOJA: "Remover" do bloco do cupom → o painel volta aberto e vazio e o Total volta ao cheio.
5. LOJA: aplique o -01 de novo e clique "Remover" num ITEM do carrinho → o bloco verde some e os totais perdem o Desconto. O painel reaparece com o código antigo e a linha verde "Desconto aplicado: R$ X"?
6. LOJA: "TESTE-QA-P3-02" → texto vermelho "Pedido mínimo para este cupom é R$ …" (anote o formato do valor).
7. ADMIN: "Editar" o -01 → desmarque "Cupom ativo" → "Cupom atualizado." e "Inativo". LOJA: aplique o -01 → "Este cupom não está mais ativo.".
8. (Opcional) ADMIN: "Editar" o -01 → __data('input[name=validUntil]', '<AAAA-MM-DD de ontem>') e marque "Cupom ativo" → salve. LOJA: aplique → "Este cupom expirou."? (a data pode ficar 1 dia deslocada; anote o que o cartão mostra). Desative de novo.
9. LOJA: esvazie o carrinho e aplique um cupom ATIVO sem mínimo (reative o -01 por um instante, se preciso) → é aceito com "−R$ 0,00"? Desative o -01 em seguida.
10. Fim do fluxo: ADMIN → "Pausar" no [TESTE-P3].
    Verificação dirigida: o valor mínimo sai com ponto decimal ("R$ 1000.00")? Cupom aplicado com carrinho vazio?

## X05 — Pedido de teste × Pedidos, Dashboard, Cupons, Funil e /downloads (SÓ com autorização)

Fonte: src/pages/CheckoutPage.jsx, src/services/checkout.js, handlers/create-payment.js, src/components/admin/tabs/OrdersTab.jsx, src/components/admin/OrderDetailModal.jsx, src/components/admin/tabs/DashboardTab.jsx, handlers/admin/funnel.js, src/pages/DownloadsPage.jsx.
Pergunte: "Posso criar 1 pedido pendente de teste? Ele fica no banco real, não pode ser apagado pela interface, deixa a cobrança pagável no Mercado Pago, pode reservar 1 uso do cupom de teste e impede a exclusão do produto [TESTE-P3] (terá de ser apagado por SQL)." Se não, marque como não testado.

1. ADMIN: anote "Pendentes"/"N pendentes" (Dashboard), a contagem de "Pendente" em Pedidos e os usos do -01. "Ativar" o [TESTE-P3] e reative o -01.
2. LOJA: sem sessão de cliente (se houver "Sair", saia). Carrinho só com o [TESTE-P3] → /checkout como convidado: nome "[TESTE-P3] Cliente QA", e-mail {{EMAIL_DESCARTAVEL}}; aplique o -01.
3. "Ir para pagamento" UMA vez → POST <API>/create-payment 200: anote orderId (ORD-…), couponApplied, discount e total e compare com o Total da tela (divergência = achado). Na aba do Mercado Pago, só olhe (valor = total da resposta?) e feche. No checkout, "Cancelar e tentar de novo". Nunca "Abrir pagamento". ADMIN: "Pausar" o [TESTE-P3] e desative o -01. Registre ORD-…, produto e e-mail como "pendente de purga via SQL".
4. ADMIN → Pedidos → "Pendente" → linha ORD-… com chip "Pendente", o e-mail/nome informado e o Total igual ao da resposta. "Detalhes" → "PEDIDO" ORD-…, "Itens" com "[TESTE-P3] Produto Cruzado … — 1 × R$ …". Esc fecha.
5. ADMIN → Dashboard → "Pendentes" e "N pendentes" +1; em "Pedidos recentes", a 1ª linha é o ORD-… "Pendente"; "Faturamento do mês" e "Receita total" não mudaram.
6. ADMIN → Cupons → o -01 passou a "1/5 usos" (uso reservado por um pedido não pago)?
7. ADMIN: __get('/admin/funnel?days=7') → anote a etapa "Iniciou checkout". Depois a aba "Funil" → "7 dias": os números batem ou estão desatualizados (cache de 1 h)?
8. LOJA → /downloads (sem parâmetros, sem sessão) → o ORD-… pendente abre sozinho (lastOrderId/lastOrderEmail), com a caixa âmbar "Pagamento ainda em análise…" e verify-payment a cada ~10 s? Depois localStorage.removeItem('lastOrderId'); localStorage.removeItem('lastOrderEmail').
   Verificação dirigida: o uso do cupom foi consumido por pedido não pago? O total cobrado (resposta) difere do mostrado na tela? "Cancelar e tentar de novo" deixa a cobrança antiga pagável (só registre o que a tela diz)?

## 5-L. Limpeza antecipada (SÓ se o humano disser que não vai rodar o 3B)

ADMIN, com o stub em true e o contorno ligado: apague o [TESTE-P3] (se falhar por causa do ORD-…, deixe "Inativo" e registre para SQL), as categorias UUID criadas NESTE bloco (que não estavam na linha de base; antes, filtre a Lista de produtos por elas) e os cupons TESTE-QA-P3-01/02. LOJA: esvazie o carrinho e confira __get('/home-sections') sem títulos "[TESTE" ou em formato UUID. ADMIN: "Encerrar sessão" e confira __get('/admin/session') → authenticated false (se true, PARE: regra 8).

# 6. Pontos a confirmar

1. Quanto tempo as mudanças do admin levam para aparecer na loja numa recarga normal? (diga o ambiente)
2. O produto criado fica na categoria escolhida?
3. Carrinho/checkout usam o preço gravado no navegador?
4. A prévia do cupom não consome uso, e o pedido pendente consome?

# 7. Formato do relatório final (obrigatório, em Markdown)

```
# Relatório de validação — BLOCO 3A (Cruzados I)
Data: <AAAA-MM-DD> · Ambiente: {{BASE_URL}} (LOCAL | DEPLOY) · Versão: <ATUAL | DEFASADO | ANTIGO> · Contorno de cache do painel: ligado desde <hh:mm> · Larguras reais: <N> px · session_id início/fim: <…>/<…> · Início/fim: <hh:mm>/<hh:mm>

## 1. Resumo executivo
- Fluxos validados: X de 6 · Problemas: crítica N · alta N · média N · baixa N · cosmética N
- Os 5 mais graves, em uma linha cada: …

## 2. Tabela de cobertura
| Fluxo | Lado LOJA | Lado ADMIN | Console | Observações |
|---|---|---|---|---|

## 3. Tabela de números (X00, X05)
| Métrica | Onde | Antes | Depois | Deveria ser | Bate? |

## 4. Tempos de propagação (admin → loja)
| Mudança | Via __get | Recarga forçada | Recarga normal |

## 5. Problemas encontrados
### CROSS-01 — <título curto>
- Severidade · Fluxo/URL (LOJA e/ou aba ADMIN) · Passos · Esperado · Obtido · Evidência (screenshots descritos, dados objetivos, console, rede SEM segredos) · Arquivo provável · Veio de verificação dirigida?

## 6. Pontos a confirmar: resultado de cada um

## 7. Itens NÃO testados e por quê

## 8. Dados [TESTE] criados
| Dado | Onde | Identificador | Apagado? | Observação |
(produto: nome, slug, id, estado; categorias UUID criadas; cupons; ORD-… pendente; caminhos de Storage; e-mails usados no checkout)

## 9. ESTADO PARA A PRÓXIMA ETAPA (o humano cola no bloco 3B)
- Fluxos concluídos: …
- Linha de base X00 (summary, produtos, categorias com ids, cupons, pedidos, vitrine): …
- <categoria real> (nome, id): …
- Dados [TESTE-P3] (produto: nome, slug, id, estado, categoria atual; cupons e estado; categorias UUID criadas; caminhos de Storage): …
- ORD-… e produto usado: …
- Versão observada; 2FA e método; logins admin gastos e hora do último; sessão admin ativa?; sessão de cliente?: …
- session_id e horário de início: …
- Último CROSS-nn: …
```

Nunca escreva senhas. Mascare e-mails e nomes de clientes reais.

Severidade: crítica = perda de dados, cobrança errada, segurança ou fluxo principal bloqueado; alta = dado errado entre loja e admin ou função importante quebrada; média = divergência visível ou atraso sem aviso; baixa = texto/acessibilidade; cosmética = visual.

# 8. Como trabalhar e registrar o progresso

- Siga X00 → X05; anote valores e achados na hora; mini-resumo a cada 2 fluxos.
- Economize contexto: screenshots só dos estados que comprovam o esperado ou a falha; o que dá para ver por __get ou texto não precisa de imagem.
- Se a conversa ficar longa, PARE: pause o [TESTE-P3], desative os cupons e entregue um RELATÓRIO PARCIAL (seção 7, "Parcial: X00–Xnn") com o ESTADO preenchido.
- No fim: [TESTE-P3] pausado, cupons inativos, carrinho vazio, relatório com o ESTADO para o 3B.
````

---

## BLOCO 3B — Fluxos cruzados loja ↔ admin (sessões, categoria, vitrine, números, limpeza)

````markdown
Você é um agente de QA sênior. Vai validar no navegador (Claude in Chrome) a segunda parte dos FLUXOS CRUZADOS entre a LOJA e o PAINEL ADMINISTRATIVO do sistema "Ateliê da Escola": sessões de cliente × admin e papel de usuário, categoria criada no admin × filtros da loja, Vitrine × home, coerência de números e histórico do cliente. No fim, apaga todos os dados de teste (os deste bloco e os deixados pelo bloco 3A) e entrega um relatório em Markdown. Você NÃO corrige nada: só testa e relata com evidências.

ANTES DE TUDO: se ainda existir neste prompt algum texto entre chaves duplas (variável não substituída), PARE e peça os valores ao humano.

# 0. Etapa e estado herdado

Este é o BLOCO 3B. Faça X06 a X11, nesta ordem, e pare. X11 é a LIMPEZA e é obrigatória.
ESTADO HERDADO (o humano cola aqui o "ESTADO PARA A PRÓXIMA ETAPA" do bloco 3A; se vazio, pule os itens que dependem do produto de teste e, na limpeza, apague só o que você criar):

- Linha de base X00 (summary, produtos, categorias com ids, cupons, pedidos, vitrine): —
- <categoria real> (nome, id): —
- Dados [TESTE-P3] (produto: nome, slug, id, estado, categoria atual; cupons; categorias UUID criadas; caminhos de Storage): —
- ORD-… pendente e produto usado: —
- Versão observada (ATUAL / DEFASADO / ANTIGO); 2FA e método; logins admin gastos e hora; sessões ativas: —
- session_id e horário de início: —
- Último CROSS-nn: —
  (Se for continuação de PARCIAL deste bloco, cole também a seção 9 daquele relatório: fluxos feitos e dados [TESTE-P3] ainda vivos.)
  Regra: o que o ESTADO diz que já foi criado, NÃO recrie; use o valor anotado. Continue a numeração CROSS-nn.

# 1. Contexto mínimo do sistema

- Loja de materiais didáticos digitais. SPA React em {{BASE_URL}}. API: http://localhost:3000/api/... quando {{BASE_URL}} é http://localhost:5173; senão {{BASE_URL}}/api/.... Nunca 127.0.0.1.
- LOJA: / (vitrine), /produtos, /produtos/<slug>, drawer do carrinho, /checkout, /downloads, /login e /conta (sem cabeçalho).
- ADMIN: {{BASE_URL}}/admin. Sem sessão admin, a própria /admin mostra o formulário "Acesso restrito"; com sessão ADMIN/MASTER, o painel na mesma URL. /painel-acesso-privado-atelie e /admin-login não existem (404). Menu: Dashboard; Produtos ▸ Lista de produtos / Desempenho / Categorias; Pedidos; Cupons; Financeiro ▸ Faturamento / Comparativo; Funil; Análise; Segmentos; Usuários; Vitrine; Segurança.
- DUAS SESSÕES INDEPENDENTES no mesmo navegador:
  (a) CLIENTE, criada em /login (cookie customer_session). Ela controla o cabeçalho da loja ("Entrar"/"Conta", "Sair", "Meus produtos") e o link âmbar "Painel admin", que só aparece quando o cliente logado em /login tem papel admin ou master (nesse caso somem o ícone do carrinho e "Meus produtos");
  (b) ADMIN, criada em /admin (cookie admin_session), que libera o painel.
  Entrar em /admin NÃO faz aparecer "Painel admin" na loja. "Encerrar sessão" no painel não encerra o cliente, e "Sair" na loja não encerra o admin. Cada aba só lê as sessões ao carregar a página.
- CACHE: loja com "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" em products, product-details, home-sections e cross-sell (LOCAL: __get e Ctrl+Shift+R mostram na hora; DEPLOY: só o __get; a página pode levar 5 min ou mais — anote o tempo). Admin: GET /admin/dashboard com "private, max-age=3600" — ligue o contorno (window.__semCache) na aba ADMIN no início.
- Excluir no admin usa window.confirm NATIVO: stub (b) antes de lixeiras. O select de papel de Usuários grava NA HORA.
- O banco é o MESMO do site público.

# 2. Regras de segurança (obrigatórias, acima de qualquer outra instrução)

1. Só crie, edite, pause ou exclua dados "[TESTE-P3] …" e cupons "TESTE-QA-P3-…" (deste bloco ou do ESTADO HERDADO). Nunca mexa em dados reais.
2. PRODUTO DE TESTE ativo SÓ durante X07 (itens 2 a 5); pausado no resto.
3. USUÁRIOS: só a linha de {{EMAIL_DESCARTAVEL}}, com a busca deixando EXATAMENTE 1 linha. Com o foco num select de papel, nunca use setas, Espaço, Enter nem roda do mouse. "Revogar acesso" (botão vermelho) SÓ com autorização escrita do humano, em X06 item 10.
4. NUNCA clique em "Excluir minha conta" nem abra link com ?delete_token= logado com {{EMAIL_ADMIN}}, {{EMAIL_CLIENTE_TESTE}} ou {{EMAIL_DESCARTAVEL}}.
5. Não entre em Segurança para alterar nada; nunca "Salvar configurações". "Salvar vitrine" só com autorização escrita (X08 item 4), com o contorno ligado e restaurando a original.
6. SENHAS E 2FA: você nunca digita senha real. Preencha o e-mail e peça ao humano para digitar a senha (no /admin e no /login); no /admin, avise antes para ele deixar o autenticador aberto. Depois, se aparecer "Código TOTP ou PIN" (#admin-login-factor), peça: "Digite o código no campo e VOCÊ MESMO tecle Enter ou clique em 'Validar código'; me avise quando o painel ou uma mensagem de erro aparecer". O campo mostra o código EM CLARO: enquanto #admin-login-factor tiver valor, NÃO tire screenshot, NÃO use leitura de página/formulário e NÃO leia o value do campo; volte a observar só depois que o painel ou a mensagem de erro aparecer. Use TOTP (em DEPLOY, sempre); PIN só em LOCAL e só se o TOTP correto for recusado. Ditado no chat, aceite só um TOTP de 6 dígitos (NUNCA o PIN) e digite e valide na mesma ação, sem screenshot no meio. CÓDIGO RECUSADO ("Código de verificação inválido." ou "Código já utilizado. Aguarde o próximo código do autenticador."): o desafio continua valendo por ~2 min; NÃO redigite a senha. Peça ao humano para esperar o PRÓXIMO TOTP, apagar o campo, digitar e validar ele mesmo (no máximo 2 vezes). Recomece pelo e-mail/senha só se já passaram mais de 2 min desde o "Entrar" (nesse caso o "Validar código" já refaz a 1ª etapa e conta como envio de senha); falhou de novo, pare e relate. Em LOCAL, TOTP correto recusado duas vezes = provável divergência de chave de cifra: registre como ambiente e peça o PIN (digitado e validado por ele).
7. LOGINS (os bem-sucedidos também contam): admin em /admin no máximo 4 envios de senha e 4 de código a cada 10 min, e ao menos 30 s entre dois logins com TOTP (orçamento de senha: início se necessário, X06.6, X06.7); cliente em /login no máximo 4 por e-mail a cada 10 min ({{EMAIL_ADMIN}}: X06.2; {{EMAIL_DESCARTAVEL}}: X06.9 e X06.10; {{EMAIL_CLIENTE_TESTE}}: X10).
8. Nunca faça pelo console ou pela barra de endereço POST, PUT, PATCH ou DELETE; os helpers só fazem GET. Proibidos: /api/send-confirmation-email, /api/webhook, /api/cron-email-jobs, /api/admin/cleanup-events.
9. SEGREDOS: nunca imprima o body de /admin/dashboard ou /admin/settings (use __resumo). Nunca copie segredos, tokens ou senhas.
10. LIMITES: 429 ou 503 "Não foi possível validar esta tentativa agora…" = não é bug: pare, avise, espere. 403 "Origem não permitida (possível CSRF)." ao salvar = ambiente: pare as escritas e avise. LOGOUT DO ADMIN: depois de TODO "Encerrar sessão", confira __get('/admin/session') → authenticated false. Um logout recusado (403 "Origem nao permitida (possivel CSRF).", sem acentos, ou falha de rede) deixa o painel aberto e a sessão viva por até 8 h: se vier true, PARE e peça ao humano para fechar as abas do site e apagar os cookies dele.
11. DADOS PESSOAIS: mascare e-mails e nomes de clientes reais (Pedidos, Usuários, histórico); nunca escreva senhas. Não clique em "Baixar" em /downloads.
12. Diálogo nativo inesperado: Esc/Cancelar. Ação destrutiva não prevista: PARE e pergunte. Nunca limpe o localStorage inteiro.

# 3. Variáveis

- {{BASE_URL}}: endereço do site. {{EMAIL_ADMIN}}: admin (também entra como cliente em /login).
- {{EMAIL_CLIENTE_TESTE}}: cliente de teste existente (idealmente com pedidos).
- {{EMAIL_DESCARTAVEL}}: conta de cliente descartável cadastrada no bloco 1B (se não existir ou a senha não funcionar, pule os itens dela).
- Marcadores: <API> = window.__API; <HHMM> = hora atual; <slug>/<id> do produto de teste (do ESTADO HERDADO).

# 4. Método de trabalho

1. DUAS abas do mesmo navegador: "ADMIN" em {{BASE_URL}}/admin e "LOJA" em {{BASE_URL}}/. Diga sempre em que aba está. Instale (a), (c) e (d) nas duas e o (b) na ADMIN; reinstale na aba que sofrer F5, URL digitada ou Ctrl+Shift+R. Na ADMIN, ligue window.__semCache = /admin\/dashboard/ (e religue depois de cada F5). Anote horário e localStorage.getItem('session_id') na LOJA. VERSÃO (uma vez, na LOJA, antes de X06): Promise.all([__get('/auth/customer/logout').then(x => x.status), fetch('/robots.txt').then(r => r.text()).then(t => /painel-acesso-privado/.test(t))]).then(v => v[0] === 404 ? 'ANTIGO' : v[0] === 405 ? (v[1] ? 'DEFASADO' : 'ATUAL') : 'indefinido ' + v) → ATUAL = código atual; DEFASADO = commit 05b0066 sem as alterações locais (/admin redireciona para /painel-acesso-privado-atelie, "Encerrar sessão" leva a /login e /login tem "Entrar como"); ANTIGO = deploy anterior. Diferenças de login/rotas em DEFASADO ou ANTIGO = "defasagem de versão", não bug. Anote. Em DEFASADO/ANTIGO, o "Painel admin" sem sessão leva a /painel-acesso-privado-atelie (X06 itens 6–7): registre como defasagem.
2. Para cada fluxo: execute, tire screenshots dos dois lados, leia console e rede e compare; anote valores ANTES e DEPOIS. Desktop ~1440x900 (ou ≥ 1280); mobile só quando pedido (~390x844); registre window.innerWidth. Screenshots: <fluxo>-<LOJA|ADMIN>-<largura>-<estado>.
3. Console/rede: prefira window.__errLog e window.__netLog.
4. Verificações dirigidas são SUSPEITAS a confirmar ou descartar.
5. SAIR DA SESSÃO DE CLIENTE: na LOJA, vá para / e clique "Sair" (abaixo de 1024 px, pelo menu); confirme "Entrar".

Ferramentas (console da página):

(a) Capturador de toasts:

```js
window.__toastLog = [];
new MutationObserver(function () {
  document.querySelectorAll('article[data-type]').forEach(function (a) {
    var i = a.querySelector('i');
    var ic = i ? getComputedStyle(i, '::before').content : 'sem <i>';
    var t = a.getAttribute('data-type') + ': ' + a.textContent.trim() + ' | ícone: ' + ic;
    if (window.__toastLog.indexOf(t) === -1) window.__toastLog.push(t);
  });
}).observe(document.body, { childList: true, subtree: true });
('toasts ok');
```

(b) Stub de window.confirm (aba ADMIN; OBRIGATÓRIO antes de lixeiras):

```js
window.__confirmLog = [];
window.__confirmAnswer = false;
window.confirm = function (msg) {
  window.__confirmLog.push(String(msg));
  return window.__confirmAnswer;
};
('stub ok');
```

false = Cancelar; true = OK. Se a caixa nativa aparecer mesmo assim: Esc ou peça ao humano.

(c) API, consultas sem cache (só GET) e resumo do admin:

```js
window.__API =
  location.hostname === 'localhost' ? 'http://localhost:3000/api' : location.origin + '/api';
window.__get = function (path) {
  var url = window.__API + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) {
    return r.text().then(function (t) {
      var j = null;
      try {
        j = JSON.parse(t);
      } catch (e) {}
      return { status: r.status, cache: r.headers.get('cache-control'), body: j };
    });
  });
};
window.__resumo = function () {
  return window.__get('/admin/dashboard').then(function (x) {
    var b = x.body || {};
    return JSON.stringify({
      summary: b.summary,
      produtos: (b.products || []).map(function (p) {
        return (
          p.name +
          ' | ' +
          (p.active ? 'ativo' : 'inativo') +
          ' | cat: ' +
          (p.category || '—') +
          ' | catId: ' +
          (p.categoryId || '—')
        );
      }),
      categorias: (b.categories || []).map(function (c) {
        return (
          c.name +
          ' | id: ' +
          c.id +
          ' | ' +
          (c.active === false ? 'inativa' : 'ativa') +
          ' | ' +
          c.color
        );
      }),
    });
  });
};
('api ok');
```

Exemplos: __get('/products').then(x => JSON.stringify({ total: x.body.total, teste: x.body.products.filter(p => /TESTE-P3/.test(p.name)).map(p => ({ slug: p.slug, cat: p.category, ativo: true })) })); __get('/auth/customer/session').then(x => JSON.stringify(x.body)); __get('/admin/session').then(x => x.body.authenticated).

(d) Interceptador de rede, coletor de erros e contorno de cache:

```js
(function () {
  if (window.__netLogOn) return 'net já instalado';
  window.__netLogOn = true;
  window.__netLog = [];
  window.__errLog = [];
  window.__bloquear = null;
  window.__semCache = null;
  var SEG =
    /^(totpSecret|fallbackPin|token|delete_token|password|access_token|refresh_token|challengeToken|factorCode|confirmationCode|devConfirmUrl|uploadUrl|signedUrl|pin|secret|totp)$/i;
  var SEM_CORPO = /me-export-data|admin\/(users|orders|dashboard)|customer-orders/;
  function limpa(v, d) {
    if (d > 6 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v))
      return v.slice(0, 20).map(function (x) {
        return limpa(x, d + 1);
      });
    var o = {};
    Object.keys(v).forEach(function (k) {
      o[k] = SEG.test(k) ? '[removido]' : limpa(v[k], d + 1);
    });
    return o;
  }
  function parse(t) {
    try {
      return limpa(JSON.parse(t), 0);
    } catch (e) {
      return typeof t === 'string' ? t.slice(0, 300) : t;
    }
  }
  function urlLimpa(u) {
    return String(u).replace(/([?&](token|delete_token|code)=)[^&#]+/g, '$1[removido]');
  }
  var of = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var it = {
      t: new Date().toISOString().slice(11, 19),
      metodo: metodo,
      url: urlLimpa(url),
      req:
        init && typeof init.body === 'string'
          ? parse(init.body)
          : init && init.body
            ? '[corpo não-texto]'
            : null,
    };
    window.__netLog.push(it);
    if (window.__bloquear && window.__bloquear.test(url)) {
      it.status = 'BLOQUEADO pelo teste (não enviado)';
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (window.__semCache && window.__semCache.test(url)) {
      init = Object.assign({}, init || {}, { cache: 'no-store' });
      it.semCache = true;
    }
    var t0 = performance.now();
    return of.call(window, input, init).then(
      function (r) {
        it.status = r.status;
        it.cache = r.headers.get('cache-control');
        it.ms = Math.round(performance.now() - t0);
        r.clone()
          .text()
          .then(function (t) {
            if (SEM_CORPO.test(url)) {
              it.res = '[corpo omitido: ' + t.length + ' caracteres]';
              return;
            }
            var s = JSON.stringify(parse(t));
            if (s) s = s.replace(/token=[^&"]+/g, 'token=[removido]');
            it.res = s && s.length > 600 ? s.slice(0, 600) + '…' : s;
          })
          .catch(function () {});
        return r;
      },
      function (e) {
        it.status = 'falhou: ' + e.message;
        throw e;
      },
    );
  };
  window.addEventListener('error', function (e) {
    window.__errLog.push('error: ' + e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.__errLog.push('rejection: ' + String((e.reason && e.reason.message) || e.reason));
  });
  return 'net ok';
})();
```

Uso: JSON.stringify(window.__netLog.slice(-5)). Contorno do painel: window.__semCache = /admin\/dashboard/ (desligue com null). Cada entrada traz "ms" (duração da chamada). O (d) NÃO guarda o corpo das respostas de me-export-data, admin/users, admin/orders, admin/dashboard e customer-orders (só status, ms e tamanho), troca "token=…" por "token=[removido]" e apaga chaves de segredo (uploadUrl, signedUrl, pin, secret, totp…).

# 5. Fluxos (siga nesta ordem)

Copie a "Fonte" de cada fluxo no campo "Arquivo provável".

## X06 — Sessões cliente × admin e papel de usuário

Fonte: src/components/Shell.jsx, src/providers/AuthProvider.jsx, src/components/ProtectedRoute.jsx, src/pages/AdminLoginPage.jsx, src/pages/AdminPage.jsx, handlers/auth/customer/logout.js, src/components/admin/tabs/UsersTab.jsx, handlers/admin/users.js. 0. ADMIN: abra /admin; se aparecer o formulário, faça o login (regra 6). Instale as ferramentas e ligue o contorno. HOME PÚBLICA: __get('/admin/settings?key=homeSections').then(x => { var v = x.body && x.body.value; return JSON.stringify({ s: x.status, semConfig: !v || !Array.isArray(v.sections) || !v.sections.some(function (q) { return q && q.enabled !== false; }) }); }). Se semConfig vier true, AVISE o humano: "[TESTE-P3] Categoria Cruzada" (X07.1, ativa até X07.5) e as categorias com nome UUID entram como faixas da home real enquanto ativas; faça X07 sem pausas. Anote a linha de base: __get('/home-sections').then(x => JSON.stringify(x.body.sections.map(s => s.title))).

1. LOJA sem sessão de cliente (se houver "Sair", saia). / → cabeçalho de VISITANTE ("Entrar", carrinho, SEM "Painel admin"), apesar da sessão admin no mesmo navegador. __get('/admin/session') → true; __get('/auth/customer/session') → authenticated false.
2. LOJA: ANTES do login, esvazie o carrinho: localStorage.setItem('cart','[]') e F5 (reinstale). Logado no /checkout com item no carrinho, o site grava um carrinho abandonado com o e-mail do admin e o cron manda lembretes depois de 1 h. LOJA → /login (sem cabeçalho; sem "Entrar como") → {{EMAIL_ADMIN}}, o humano digita a senha → toast "Login realizado com sucesso." e ida para /checkout. Vá para / → link âmbar "Painel admin", "Conta" e "Sair", SEM o ícone do carrinho e SEM "Meus produtos". Em ~390 px, o menu mostra "Painel admin" (âmbar). /conta mostra "Excluir minha conta" também para o admin (NÃO clique).
3. LOJA → /produtos → "Adicionar" num produto → toast verde? JSON.parse(localStorage.cart).length aumentou, sem nenhum botão para abrir o carrinho? Depois esvazie: localStorage.setItem('cart','[]') e F5.
4. LOJA (depois do F5, com a sessão admin ativa) → "Painel admin" → /admin mostra o painel direto.
5. ADMIN: "Encerrar sessão" → toast "Sessão administrativa encerrada." e o formulário na mesma /admin. __get('/admin/session') → authenticated false (se true, PARE: regra 10).
6. LOJA → / com F5 → o cliente continua logado ("Conta", "Sair", "Painel admin"). "Painel admin" → formulário "Acesso restrito". Faça ali o login admin (regra 6) → painel na mesma URL.
7. Variação (verificação dirigida): ADMIN → "Encerrar sessão" de novo; na LOJA, SEM F5, clique "Painel admin". A aba ainda "acha" que há sessão admin: aparece o painel com erros/cartões rosa ou o formulário? Registre. Depois refaça o login admin (regra 6) e dê F5 nas duas abas (reinstale as ferramentas e o contorno).
8. LOJA: "Sair" → toast "Sessão encerrada." → cabeçalho de visitante. ADMIN → F5 → o painel continua (a saída do cliente não encerrou o admin).
9. Papel: ADMIN → Usuários → busque {{EMAIL_DESCARTAVEL}} → EXATAMENTE 1 linha → select "Suporte" pela ferramenta de formulário → PUT 400 e toast "Role inválida. Não é permitido atribuir admin/master por este endpoint.", select volta. LOJA → /login com {{EMAIL_DESCARTAVEL}} (o humano digita a senha) → em /, "Meus produtos" e carrinho, SEM "Painel admin". Saia.
10. (SÓ com autorização escrita) ADMIN → Usuários → lixeira "Revogar acesso" na linha de {{EMAIL_DESCARTAVEL}} → modal "Revogar acesso?" → "Revogar acesso" → DELETE 200, toast "Acesso revogado.", a linha some. LOJA → /login com {{EMAIL_DESCARTAVEL}} → o login ainda funciona? /downloads abre? Saia. Registre o estado final da conta.
    Verificação dirigida: sessão admin sozinha faz aparecer "Painel admin"? (pelo código, não) Cliente com papel admin grava no carrinho sem poder abri-lo? "Revogar acesso" impede o login ou só apaga o perfil?

## X07 — Categoria criada/alterada no admin × filtros e páginas da loja

Fonte: src/components/CategoryWizard.jsx, handlers/admin/categories.js, handlers/admin/products.js (resolveCategoryId), handlers/products.js, handlers/product-details.js, src/hooks/useProductFilters.js, src/components/ProductGrid.jsx, src/pages/ProductDetailsPage.jsx.
Sem o produto [TESTE-P3] (ESTADO vazio): faça só os itens 1 e 4.

1. ADMIN → Categorias → "Nova categoria" → "[TESTE-P3] Categoria Cruzada" com "★ Evidenciar na página de produtos" marcado → "Categoria criada.". Anote a cor. __resumo() → anote o id dela.
2. ADMIN → "Ativar" o [TESTE-P3] → "Editar" → no passo Básico escolha "[TESTE-P3] Categoria Cruzada" → avance e "Salvar Produto" → "Produto atualizado.". __resumo(): o catId do produto é o id da Categoria Cruzada ou de uma categoria NOVA cujo nome é esse id? Anote qualquer categoria nova (nome e cor) para a limpeza.
3. LOJA: __get('/products') → que "category" o produto tem? /produtos com Ctrl+Shift+R → existe chip ou item de sidebar "[TESTE-P3] Categoria Cruzada"? A pílula do card mostra qual nome (um UUID?)?
4. O "★ Evidenciar" ou a cor mudaram alguma coisa nos chips do topo de /produtos?
5. ADMIN: identifique a categoria em que o produto REALMENTE está. Só siga se ela NÃO estava na linha de base (é a Cruzada ou uma UUID criada por você). Filtre a Lista de produtos por ela: a única linha é o [TESTE-P3]? (se houver produto real, NÃO mexa). Então "Editar" → desmarque "Categoria ativa" → "· Inativa". LOJA (Ctrl+Shift+R e __get): o card cai no rótulo padrão "BANNER"? A página /produtos/<slug> mostra o nome da categoria inativa (ou "Sem categoria")? A categoria sumiu dos filtros?
6. ADMIN: "Pausar" o [TESTE-P3].
   Verificação dirigida: escolher uma categoria no wizard grava o produto nela? Produto sem categoria válida tem dois rótulos diferentes ("BANNER" no card × outro no detalhe)?

## X08 — Vitrine do admin × seções da home (somente leitura)

Fonte: src/components/admin/tabs/VitrineTab.jsx, src/components/admin/utils/derive.js, handlers/home-sections.js, src/pages/HomePage.jsx.

1. ADMIN → Vitrine → anote cada card: tipo, "Título exibido", "Produtos exibidos (4–20)" e "Categoria vinculada".
2. LOJA: __get('/home-sections') e os H3 da seção Catálogo da home: ordem e títulos batem com a Vitrine? Seções de categoria inativa ou inexistente não aparecem na home (sem aviso no admin)? Nenhuma faixa passa do limite configurado.
3. LOJA: "Mais produtos →" de uma seção de categoria → /produtos?categoria=<Nome> filtrado; de "Novidades" → ?preset=novidades mostra menos cards que a faixa?
4. (SÓ com autorização escrita) ADMIN: saia para "Dashboard" e volte; confira que a tela = anotada no item 1; mude só o título de uma seção para "[TESTE-P3] Vitrine QA" → "Salvar vitrine" → "Vitrine salva com sucesso.". LOJA: __get('/home-sections') traz o título novo na hora; / com F5 normal continua com o antigo por até 5 min? Restaure o título original do mesmo jeito e confira.
   Verificação dirigida: a Vitrine mostra seções que não aparecem na home, sem aviso?

## X09 — Coerência de números entre admin e loja

Fonte: src/components/admin/utils/derive.js, handlers/admin/dashboard.js, handlers/admin/users.js, handlers/products.js, lib/sales-counts.js.
Anote os valores numa tabela e aponte cada divergência:

1. Dashboard "Produtos ativos" = quantidade "Ativos" da Lista de produtos = total de __get('/products') na LOJA (o [TESTE-P3] está pausado).
2. Dashboard "Pedidos aprovados" = linhas de Pedidos com o filtro "Aprovado"; "Pendentes" = linhas com "Pendente".
3. Dashboard "Clientes cadastrados" = Recorrentes + Novos + N da nota = total M da aba Usuários?
4. "Receita total" = Faturamento "BRUTO ACUMULADO"; "Faturamento do mês" = Comparativo "MÊS ATUAL" › Receita = última linha do Faturamento.
5. O "Total" no centro da rosca "Receita por categoria" (top 5) × "Receita total": diferença explicada?
6. Ordem de /produtos?preset=mais-vendidos na LOJA × coluna VENDAS do Desempenho (a loja conta só os últimos 12 meses): registre as diferenças.
   Verificação dirigida: três "Ticket médio" diferentes sem indicação de período?

## X10 — Histórico do cliente de teste na loja × admin

Fonte: src/pages/DownloadsPage.jsx, handlers/customer-orders.js, src/components/admin/tabs/OrdersTab.jsx, src/components/admin/tabs/UsersTab.jsx.

1. LOJA → /login?redirect=/downloads com {{EMAIL_CLIENTE_TESTE}} (o humano digita a senha) → "Seus pedidos (<e-mail>)" → anote código, status e total de cada pedido do "Histórico de pedidos". NÃO clique em "Baixar".
2. ADMIN → Pedidos: encontre os mesmos códigos. Status e total batem? "Detalhes" mostra o mesmo e-mail?
3. ADMIN → Usuários: busque {{EMAIL_CLIENTE_TESTE}} → COMPRAS = nº de pedidos APROVADOS do histórico? TOTAL GASTO = soma dos aprovados? (não toque no select)
4. LOJA → saia.
   Verificação dirigida: o status aparece em inglês cru na loja ("Status: approved") e traduzido no admin ("Aprovado")?

## X11 — Limpeza (obrigatória)

1. ADMIN, stub com window.__confirmAnswer = true e contorno ligado:
   - Lista de produtos → lixeira do [TESTE-P3] → "Produto removido.". Se houver ORD-… pendente do 3A, a exclusão deve FALHAR (ex.: 500 "Erro ao processar produtos do admin"): deixe-o "Inativo" e registre produto e ORD-… como "pendentes de limpeza por SQL (primeiro order_items/orders, depois products)".
   - Categorias → antes de cada exclusão, filtre a Lista de produtos por ela e só siga se não houver linhas (ou só [TESTE…]). Apague "[TESTE-P3] Categoria Cruzada" (nome E cor) e cada categoria com nome UUID que NÃO estava na linha de base X00 → "Categoria removida.". NÃO apague as antigas.
   - Cupons → lixeiras de "TESTE-QA-P3-01" e "TESTE-QA-P3-02" → "Cupom removido.".
   - Se a Vitrine foi salva com autorização, confirme que voltou à original.
2. LOJA: esvazie o carrinho ("Esvaziar carrinho"), apague lastOrderId e lastOrderEmail do localStorage e confira __get('/products') sem [TESTE-P3] (salvo se ficou pendente de SQL) e total igual à linha de base. HOME PÚBLICA: __get('/home-sections').then(x => JSON.stringify(x.body.sections.map(s => s.title).filter(t => /\[TESTE/.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)))) → [] ou só títulos que já estavam na linha de base de X06 item 0 (nenhum "[TESTE" nem UUID novo); se sobrar algum novo, registre e avise.
3. ADMIN: __resumo() → produtos e categorias iguais à linha de base (exceto pendências). Anote.
4. window.__confirmAnswer = false; window.__semCache = null. ADMIN → "Encerrar sessão" → formulário na mesma /admin → __get('/admin/session') → authenticated false (se true, PARE: regra 10). LOJA → se estiver logado, saia; __get('/auth/customer/session') → authenticated false.

# 6. Pontos a confirmar

1. Entrar SÓ em /admin faz aparecer "Painel admin" na loja? (pelo código, não)
2. Entrar como admin em /login mostra "Painel admin"; clicar sem sessão admin leva ao formulário em /admin (não a /painel-acesso-privado-atelie)?
3. "Encerrar sessão" mantém o cliente; "Sair" mantém o admin?
4. O produto fica na categoria escolhida no wizard?
5. Quanto tempo as mudanças do admin levam para aparecer na loja numa recarga normal? (diga o ambiente)

# 7. Formato do relatório final (obrigatório, em Markdown)

```
# Relatório de validação — BLOCO 3B (Cruzados II)
Data: <AAAA-MM-DD> · Ambiente: {{BASE_URL}} (LOCAL | DEPLOY) · Versão: <ATUAL | DEFASADO | ANTIGO> · Contorno de cache do painel: ligado desde <hh:mm> · Larguras reais: desktop <N> px, mobile <N> px · session_id início/fim: <…>/<…> · Início/fim: <hh:mm>/<hh:mm>

## 1. Resumo executivo
- Fluxos validados: X de 6 · Problemas: crítica N · alta N · média N · baixa N · cosmética N
- Os 5 mais graves, em uma linha cada: …

## 2. Tabela de cobertura
| Fluxo | Lado LOJA | Lado ADMIN | Mobile | Console | Observações |
|---|---|---|---|---|---|

## 3. Tabela de sessões (X06)
| Estado | Cabeçalho da loja | /admin mostra | Esperado | Bate? |

## 4. Tabela de números (X09, X10)
| Métrica | Onde | Valor | Deveria ser igual a | Bate? |

## 5. Problemas encontrados
### CROSS-nn — <título curto>
- Severidade · Fluxo/URL (LOJA e/ou aba ADMIN) · Passos · Esperado · Obtido · Evidência (screenshots descritos, dados objetivos, console, rede SEM segredos) · Arquivo provável · Veio de verificação dirigida?
(continue a numeração do 3A)

## 6. Pontos a confirmar: resultado de cada um

## 7. Itens NÃO testados e por quê

## 8. Dados [TESTE] criados e limpeza
| Dado | Onde | Identificador | Apagado? | Observação |
(produto e ORD-… pendentes de SQL, categorias UUID criadas e apagadas, cupons, vitrine, estado final de {{EMAIL_DESCARTAVEL}} mascarado (revogada?), caminhos de Storage órfãos, e-mails usados no checkout, session_id e horários, contagens antes/depois)

## 9. ESTADO PARA A PRÓXIMA ETAPA
- Fluxos concluídos (X06–Xnn); versão; logins admin e de cliente gastos e hora do último; sessões ativas (admin/cliente)
- Dados [TESTE-P3] ainda vivos (produto: nome, slug, id, estado, categoria; categorias com nome/cor/id; cupons e estado; vitrine alterada?)
- ORD-… e o que ficou pendente de SQL; contorno ligado?; session_id; último CROSS-nn
```

Nunca escreva senhas. Mascare e-mails e nomes de clientes reais.

Severidade: crítica = perda de dados, cobrança errada, segurança ou fluxo principal bloqueado; alta = dado errado entre loja e admin ou função importante quebrada; média = divergência visível ou atraso sem aviso; baixa = texto/acessibilidade; cosmética = visual.

# 8. Como trabalhar e registrar o progresso

- Siga X06 → X11; anote valores e achados na hora; mini-resumo a cada 2 fluxos.
- Economize contexto: screenshots só dos estados que comprovam o esperado ou a falha.
- Se a conversa ficar longa, PARE: faça a LIMPEZA (X11) antes, se o humano não for continuar, e entregue um RELATÓRIO PARCIAL ("Parcial: X06–Xnn") com a seção 9 (ESTADO) preenchida.
- No fim: limpeza feita, sessões encerradas, session_id e horário de fim anotados, relatório entregue.
````
