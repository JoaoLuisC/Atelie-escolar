# Relatório de validação — BLOCO 1B (Área do cliente e compra)

Data: 2026-10-01 · Ambiente: http://localhost:5173 (LOCAL) · Versão: ATUAL · Larguras reais: desktop 1920 px (janela maximizada); mobile 390 px emulado em iframe same-origin · session_id início/fim: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 / o mesmo · Início/fim: 18:04 / 18:21

Observações de ambiente:

- API local com `RATE_LIMIT_MAX=3000` (reiniciada no 1A). Nenhum 429 neste bloco.
- **Senhas reais digitadas pelo humano** em todos os logins (regra 2 do bloco). Eu só digitei as senhas falsas de validação.
- E-mails @example.com não têm caixa de entrada. Por instrução do humano, passos que dependem de ler e-mail ficaram "NÃO TESTADO — sem caixa de entrada", sem contorno (inclusive o link de exclusão LGPD do console de dev).
- Pagamento: o humano respondeu **não** a C04.6. Nenhum pedido ORD foi criado.
- Em dev, o Helmet não atualiza título/robots de forma confiável (LOJA-27 do 1A). Títulos e noindex não foram usados como critério.

## 1. Resumo executivo

- Telas validadas: 14 de 14 (C04, C10, C12 e C13 parciais) · Problemas: crítica 0 (1 a confirmar) · alta 1 · média 7 · baixa 7 · cosmética 0
- Os 5 mais graves:
  1. LOJA-37: o cadastro de cliente falhou (400 genérico) e a recuperação de senha deu 500 no Supabase ("Error sending recovery email"). Se o envio de e-mail do Supabase está quebrado para todos, ninguém consegue se cadastrar nem recuperar a senha. **A confirmar com um e-mail real.**
  2. LOJA-38: o retorno do Mercado Pago com `?status=failure` ou `?status=pending` mostra o checkout idêntico ao normal, sem nenhum aviso.
  3. LOJA-39: no logout com falha de rede, o site mostra "Sessão encerrada.", mas a sessão continua ativa no servidor e no cabeçalho.
  4. LOJA-40: logado no checkout, o campo de e-mail continua editável. Um pedido pode sair com outro e-mail e não aparecer em "Seus pedidos".
  5. LOJA-41: /downloads logado continua dizendo "Entre na sua conta para ver o histórico…".

## 2. Tabela de cobertura

| Tela                        | Desktop | Mobile      | Console                       | Observações                                                           |
| --------------------------- | ------- | ----------- | ----------------------------- | --------------------------------------------------------------------- |
| C01 /login (Entrar)         | ok      | —           | limpo                         | erro antigo persiste; erro do OAuth não é exibido; Google não testado |
| C02 Cadastrar               | parcial | —           | limpo                         | validações ok; cadastro real → 400 (LOJA-37)                          |
| C03 Esqueci a senha         | parcial | —           | limpo                         | Supabase /recover → 500                                               |
| C04 Checkout visitante      | parcial | ok (iframe) | limpo                         | item 6 (pagamento) não autorizado                                     |
| C05 Retorno do MP           | ok      | —           | limpo                         | sem aviso (LOJA-38)                                                   |
| C06 /downloads deslogado    | ok      | —           | limpo                         | campo de e-mail prometido não existe                                  |
| C07 Login e redirect        | ok      | —           | limpo                         | sem open redirect                                                     |
| C08 /conta e exportar dados | ok      | —           | limpo                         | download interceptado (nenhum arquivo salvo)                          |
| C09 Checkout logado         | ok      | —           | limpo                         | e-mail editável                                                       |
| C10 /downloads logado       | parcial | —           | limpo                         | cliente sem pedidos (itens 2–4 não testados)                          |
| C11 Sair                    | ok      | ok (iframe) | 1 rejection na falha simulada | LOJA-39                                                               |
| C12 Redefinir senha         | parcial | —           | limpo                         | "Auth session missing!"; link real não testado                        |
| C13 Exclusão LGPD           | parcial | —           | limpo                         | passos 0–3 ok; passo 4 não testado (sem caixa de entrada)             |
| C14 Checagens de API        | ok      | —           | limpo                         | —                                                                     |

## 3. Problemas encontrados

### LOJA-37 — Cadastro e recuperação de senha falham no Supabase; a mensagem culpa os dados do usuário

- Severidade: alta (crítica se o SMTP estiver quebrado para qualquer e-mail)
- Tela/URL: C02 item 3 e C03 item 3 — /login?mode=register e /login (Esqueci minha senha) — 1920 px
- Passos para reproduzir: 1. Cadastrar com nome "[TESTE] Cliente QA", e-mail q***@example.com e senha válida (digitada pelo humano). 2. Em "Esqueci minha senha", enviar para a descartável.
- Esperado: cadastro → toast "Conta criada. Verifique seu e-mail…"; recuperação → toast success "Enviamos um link de recuperação…".
- Obtido:
  - cadastro (18:11:42): `POST /api/auth/customer/register` → 400 {code:"VALIDATION_FAILED", message:"Não foi possível criar a conta. Verifique os dados e tente novamente."}, com caixa e toast error;
  - recuperação (18:06:13): `POST https://<supabase>/auth/v1/recover?redirect_to=…/reset-password?redirect=%2Fcheckout` → 500 {"code":"unexpected_failure","message":"Error sending recovery email"} (1,9 s), com toast "Não foi possível enviar o link de recuperação.".
- Evidência: a mensagem do cadastro é o fallback de `mapSupabaseAuthError` (lib/customer-auth-handlers.js:133). Uma falha 5xx do Supabase (provavelmente o mesmo erro de envio de e-mail) vira 400 "verifique os dados". O redirect_to da recuperação está correto.
- Arquivo provável: configuração SMTP do Supabase (Auth → SMTP); lib/customer-auth-handlers.js (mapeamento); src/pages/CustomerAuthPage.jsx
- Veio de verificação dirigida? não
- **A confirmar:** repetir um cadastro e uma recuperação com um e-mail real. Se falhar também, a severidade é crítica (cadastro bloqueado).
- **Evidência adicional (log da API local):** o envio do próprio servidor também falha por credencial. No C13.3, `{"level":"error","event":"envio_falhou","module":"email-sender","kind":"account_deletion_confirmation","reason":"Invalid login: 535 Authentication credentials invalid"}`. A tela mostrou sucesso ("Enviamos um e-mail para confirmar a exclusão…") mesmo com o envio falhando. Ou seja, as credenciais SMTP do servidor estão inválidas, e a confirmação de exclusão LGPD (e provavelmente newsletter e descadastro) nunca sai. Vale conferir também o SMTP configurado no Supabase Auth.

### LOJA-38 — Retorno do Mercado Pago com falha ou pendência não mostra nenhum aviso

- Severidade: média
- Tela/URL: C05 — /checkout?status=failure e /checkout?status=pending — 500 px (iframe)
- Passos para reproduzir: com 1 item no carrinho, abra as duas URLs.
- Esperado: aviso de pagamento recusado ou em análise.
- Obtido: o texto do `<main>` é idêntico ao de /checkout (stepper no passo 1, sem polling, sem mensagem). A página não lê a query string.
- Arquivo provável: src/pages/CheckoutPage.jsx, lib/mercadopago-config.js (back_urls)
- Veio de verificação dirigida? não (ponto a confirmar 2)

### LOJA-39 — Logout com falha de rede mostra "Sessão encerrada." mas mantém a sessão

- Severidade: média
- Tela/URL: C11 item 1 — / — 1920 px
- Passos para reproduzir: logado, `window.__bloquear = /auth\/customer\/logout/` e clique "Sair".
- Esperado: aviso de erro, e o cabeçalho continua logado de forma coerente.
- Obtido: toast info "Sessão encerrada." aparece; o cabeçalho continua "Conta"/"Sair"; `__errLog` = "rejection: Failed to fetch" (promessa não tratada); `GET /auth/customer/session` → authenticated true.
- Arquivo provável: src/components/Shell.jsx, src/providers/AuthProvider.jsx, src/services/customer-auth.js
- Veio de verificação dirigida? sim (C11.1)

### LOJA-40 — Checkout logado permite trocar o e-mail do pedido

- Severidade: média
- Tela/URL: C09 — /checkout logado como q***@example.com
- Obtido: "Comprando como q***@example.com", mas #checkout-email continua editável (sem readOnly/disabled). Pelo desenho, um pedido com outro e-mail não apareceria em "Seus pedidos" da conta. A cobrança não foi gerada para confirmar.
- Arquivo provável: src/pages/CheckoutPage.jsx, handlers/create-payment.js
- Veio de verificação dirigida? sim (C09)

### LOJA-41 — /downloads logado continua mandando "Entre na sua conta"

- Severidade: média
- Tela/URL: C07.1 / C10 — /downloads logado
- Obtido: logo acima de "SEUS PEDIDOS (q***@example.com)" aparecem "Nenhum pedido selecionado. Entre na sua conta para ver o histórico de pedidos e downloads." (2 vezes) e a caixa "Para ver o histórico dos seus pedidos e baixar os arquivos, entre na sua conta.".
- Arquivo provável: src/pages/DownloadsPage.jsx
- Veio de verificação dirigida? sim (C10)

### LOJA-42 — /downloads?order=… pede um e-mail "abaixo" que não existe

- Severidade: média
- Tela/URL: C06 item 5 — /downloads?order=XYZ
- Obtido: "Para consultar este pedido, informe o e-mail usado na compra abaixo.", com 0 `<input>` na página; só "Entrar".
- Arquivo provável: src/pages/DownloadsPage.jsx
- Veio de verificação dirigida? sim

### LOJA-43 — E-mail inválido em /downloads vira "email é obrigatório"

- Severidade: média
- Tela/URL: C06 item 4 — /downloads?order=XYZ&email=abc
- Obtido: "email é obrigatório" (minúsculo, sem acento, e falso: o e-mail foi informado, só é inválido); verify-payment 400.
- Arquivo provável: handlers/verify-payment.js, src/pages/DownloadsPage.jsx
- Veio de verificação dirigida? não

### LOJA-44 — Erro do login Google na URL não é exibido

- Severidade: média
- Tela/URL: C01 dirigida — /login?oauth=google&error=access_denied&error_description=teste
- Obtido: nenhuma mensagem na tela; `error` e `error_description` continuam na URL.
- Arquivo provável: src/pages/CustomerAuthPage.jsx
- Veio de verificação dirigida? sim

### LOJA-45 — "Auth session missing!" em inglês na redefinição de senha

- Severidade: baixa
- Tela/URL: C12 item 5 — /reset-password, "Abcdefg1" nos dois campos, sem sessão de recuperação
- Obtido: toast error "Auth session missing!" (texto cru do SDK do Supabase).
- Arquivo provável: src/pages/ResetPasswordPage.jsx
- Veio de verificação dirigida? sim

### LOJA-46 — Erro de login antigo continua na tela ao trocar de aba

- Severidade: baixa
- Tela/URL: C01 dirigida — /login
- Obtido: depois de "E-mail ou senha incorretos.", ir para "Cadastrar" e voltar para "Entrar" mantém a caixa vermelha.
- Arquivo provável: src/pages/CustomerAuthPage.jsx
- Veio de verificação dirigida? sim

### LOJA-47 — /login logado ignora o ?redirect e só oferece "Ir para checkout"

- Severidade: baixa
- Tela/URL: C07.3 — /login?redirect=/downloads logado
- Obtido: card verde "Você já está conectado" com apenas "Ir para checkout". O cabeçalho do card continua "Entre ou crie sua conta para continuar sua compra.".
- Arquivo provável: src/pages/CustomerAuthPage.jsx
- Veio de verificação dirigida? sim

### LOJA-48 — /downloads sem pedido: stepper marca "Processando" e o botão "Atualizar" aparece

- Severidade: baixa
- Tela/URL: C06 item 2 — /downloads deslogado e sem pedido
- Obtido: o passo 1 "Processando" tem aria-current="step" sem pedido nenhum; há um botão "Atualizar" sem nada para atualizar; a frase de status aparece duas vezes.
- Arquivo provável: src/pages/DownloadsPage.jsx, src/components/StatusStepper.jsx
- Veio de verificação dirigida? não

### LOJA-49 — A mesma tela tem três nomes

- Severidade: baixa
- Tela/URL: C10 dirigida
- Obtido: "Meus produtos" (cabeçalho), "Meus Downloads" (h1), "Downloads" (rodapé), todos para /downloads.
- Arquivo provável: src/components/Shell.jsx, src/pages/DownloadsPage.jsx
- Veio de verificação dirigida? sim

### LOJA-50 — Seletor Entrar/Cadastrar sem estado acessível

- Severidade: baixa
- Tela/URL: C01 item 1 — /login
- Obtido: os dois botões do seletor não têm aria-pressed nem aria-selected (nem role=tab).
- Arquivo provável: src/pages/CustomerAuthPage.jsx
- Veio de verificação dirigida? não

### LOJA-51 — Detalhes menores de texto e API

- Severidade: baixa
- Obtido:
  - o arquivo de "Baixar meus dados" inclui a chave de envelope "success" junto com os dados do titular;
  - `GET /api/cron-email-jobs` responde "Unauthorized" em inglês;
  - o campo de cupom não tem maxlength (aceita 41+ caracteres e só a API recusa);
  - aberta deslogada, a confirmação de exclusão não oferece login, embora o backend exija sessão (a tela só mostra "Excluir permanentemente").
- Arquivo provável: handlers/me-export-data.js, handlers/cron-email-jobs.js, src/components/CouponField.jsx, src/pages/CustomerAuthPage.jsx
- Veio de verificação dirigida? parcialmente (C13)

## 4. Pontos a confirmar: resultado de cada um

1. /login sem cabeçalho, carrinho, rodapé nem "Entrar como": **confirmado** (sem nav/footer; sem "Entrar como"/"Professor"; 0 links para admin/painel).
2. /checkout?status=failure e ?status=pending sem mensagem: **confirmado** (LOJA-38).
3. Cliente comum não vê "Painel admin": **confirmado** (cabeçalho: Meus produtos, Conta, Sair, carrinho).
4. "Baixar meus dados" existe em /conta e a revogação de cookies não está em /conta: **confirmado**.
5. Ao sair, a URL não muda e os dados de um pedido aberto continuam na tela? A URL não muda (confirmado). Não havia pedido aberto para conferir os dados.

## 5. Itens NÃO testados e por quê

| Tela/item                                                     | Motivo                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| C01.8 Login Google                                            | sem autorização                                                                                      |
| C02.3 confirmação por e-mail                                  | cadastro falhou (LOJA-37) e não há caixa de entrada                                                  |
| C03.3 receber o e-mail                                        | Supabase devolveu 500 e não há caixa de entrada                                                      |
| C04.6 "Ir para pagamento" + verificações dirigidas do aguardo | humano não autorizou                                                                                 |
| C06.1 e C06.6 pedido pendente                                 | nenhum ORD criado                                                                                    |
| C10.2–C10.4 histórico, arquivos e "Baixar"                    | cliente de teste sem pedidos                                                                         |
| C11.2 pedido aberto depois de sair                            | sem pedido                                                                                           |
| C12.7 link real de recuperação                                | sem caixa de entrada (e o envio falhou)                                                              |
| C13.4 exclusão definitiva                                     | NÃO TESTADO — sem caixa de entrada (o link do console de dev não foi usado, por instrução do humano) |
| C11 verificação no alias atelie-escolar.vercel.app            | bloco rodado em LOCAL                                                                                |
| Mobile 390 real                                               | janela maximizada; iframe de 390 px                                                                  |

## 6. Dados [TESTE] criados

| Dado                                      | Onde                      | Identificador (mascarado)                                                                                             | Apagado?                         | Observação                                                                      |
| ----------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| abandoned_carts (convidado)               | Supabase                  | q***@example.com (descartável), 18:07:15, item Palavras Mágicas                                                       | **não — purgar em menos de 1 h** | session_id 71dc5f61-…                                                           |
| abandoned_carts (logado)                  | Supabase                  | q***@example.com (cliente teste), 18:16:03, item Palavras Mágicas                                                     | **não — purgar em menos de 1 h** | —                                                                               |
| Pedido de exclusão LGPD (token de 1 h)    | e-mail via Resend sandbox | q***@example.com (lgpd), 18:20:27                                                                                     | expira sozinho                   | a conta continua existindo                                                      |
| Tentativa de cadastro                     | Supabase Auth             | qa.cadastro.1808@example.com                                                                                          | —                                | o cadastro voltou 400; confira em auth.users se ficou um usuário não confirmado |
| Recuperação de senha                      | Supabase                  | q***@example.com (descartável)                                                                                        | —                                | falhou com 500; nenhum e-mail saiu                                              |
| analytics_events                          | Supabase                  | session_id 71dc5f61-855b-4e10-8999-09ba8e57e4e9, 18:04–18:21                                                          | não                              | purgar junto com o 1A                                                           |
| ORD, downloads consumidos, senha alterada | —                         | —                                                                                                                     | —                                | nenhum                                                                          |
| Logins                                    | —                         | cliente teste: 4 (18:05:21 falho, 18:13:41, 18:15:10, 18:17:33); lgpd: 1 (18:20:04); e-mail inexistente: 1 (18:05:10) | —                                | —                                                                               |

## 7. ESTADO PARA A PRÓXIMA ETAPA

- Telas concluídas: C01–C14 (parciais: C02.3, C03.3, C04.6, C10.2–4, C12.7, C13.4)
- ORD criado: nenhum
- Logins gastos: cliente teste 4 (último 18:17:33); lgpd 1 (18:20:04)
- Conta logada agora: nenhuma (cliente false, admin false)
- {{EMAIL_DESCARTAVEL}} cadastrada e confirmada? Sim (criada pelo humano antes do bloco; não recadastrada)
- session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9
- Último LOJA-nn: LOJA-51
