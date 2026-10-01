# Relatório de validação — BLOCO 2C (Admin: cupons, pedidos, usuários, vitrine, segurança)

Data: 2026-10-01 · Ambiente: http://localhost:5173 (LOCAL) · Versão: ATUAL · Larguras reais: desktop 1920 px (janela maximizada); mobile 390 px emulado em iframe · session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · Início/fim: 18:56 / 19:03

Sessão admin herdada do 2A/2B, sem login novo neste bloco. Vitrine e Segurança **não foram salvas**. Os testes negativos de Segurança (A28.6) não foram feitos (exigem autorização escrita).

## 1. Resumo executivo

- Telas validadas: 9 de 9 · Problemas: crítica 1 · alta 3 · média 6 · baixa 5 · cosmética 0
- Os 5 mais graves:
  1. ADM-38: a aba Segurança mostra "Exigir 2FA" MARCADO sem nenhum método configurado (adminConfig nulo). Um clique em "Salvar configurações" liga o 2FA sem TOTP nem PIN e tranca o admin fora (recuperação só por SQL).
  2. ADM-39: a validade do cupom é exibida 1 dia antes e recua mais 1 dia a cada edição salva sem mudanças (31/12 → 30 → 29 → 28).
  3. ADM-40: no mobile, as tabelas de Pedidos e Usuários cortam "Detalhes", o select de papel e a lixeira (overflow hidden).
  4. ADM-41: depois de "Encerrar sessão", o botão Voltar do navegador reexibe o painel com os dados (bfcache), com a sessão já encerrada no servidor.
  5. ADM-42: o select de papel oferece "Admin" e "Suporte", mas os dois sempre dão 400, e a mensagem fala em "admin/master" até para "Suporte".

## 2. Tabela de cobertura

| Tela                 | Desktop      | Mobile                          | Console | Observações                       |
| -------------------- | ------------ | ------------------------------- | ------- | --------------------------------- |
| A23 Linha de base    | ok           | —                               | —       | 0 cupons, 14 pedidos, 10 usuários |
| A24 Cupons           | ok           | ok (wizard cabe)                | limpo   | data recua 1 dia                  |
| A25 Pedidos          | ok           | falha (Detalhes cortado)        | limpo   | só leitura confirmada             |
| A26 Usuários         | ok           | falha (select/lixeira cortados) | limpo   | modal sem Esc e sem foco          |
| A27 Vitrine          | ok           | ok                              | limpo   | sem salvar; original intacta      |
| A28 Segurança        | ok (leitura) | ok                              | limpo   | risco crítico de trancamento      |
| A29 Endpoints        | ok           | —                               | —       | —                                 |
| A30 Mobile           | parcial      | iframe 390                      | —       | ADM-40                            |
| A31 Limpeza e logout | ok           | —                               | —       | Voltar reexibe o painel (ADM-41)  |

## 3. Problemas encontrados

### ADM-38 — Segurança: "Exigir 2FA" marcado sem método configurado (risco de trancar o admin)

- Severidade: crítica (risco, não executado)
- Tela/URL: A28 — /admin, aba "Segurança" (h1 "Segurança") — 1920 px
- Obtido: GET /admin/settings?key=adminConfig → 200 com value **nulo** (temTotpSecret false, temFallbackPin false, sem has2FA/hasPin). Mesmo assim, o checkbox "Exigir 2FA no login admin" aparece **marcado**, com os campos vazios ("Ex: JBSWY3DPEHPK3PXP" / "Ex: 487239" e as dicas de "não configurado"). Pelo código e pelo mapa, salvar nesse estado grava twoFactorEnabled sem método, e o login passa a responder 500 "2FA ativado sem método configurado no adminConfig.".
- Evidência: snippet booleano do A28.2; nenhum PUT feito.
- Arquivo provável: src/components/admin/tabs/SecurityTab.jsx (padrão do checkbox = marcado quando não há linha), handlers/admin/settings.js (aceita ligar 2FA sem método), handlers/admin/login.js
- Veio de verificação dirigida? sim (A28 dirigida, seção 4)

### ADM-39 — Validade do cupom com 1 dia a menos, recuando a cada edição

- Severidade: alta
- Tela/URL: A24.7–A24.9 — aba "Cupons"
- Passos para reproduzir: 1. Criar TESTE-QA-P2-01 com validUntil "2026-12-31" (POST enviou "2026-12-31"). 2. "Editar" → salvar sem mudar. 3. Repetir.
- Obtido: o cartão mostrou "Vale até 30/12/2026" logo após criar. Ao editar, o campo veio "2026-12-30" e o PUT enviou "2026-12-30", resultando em "29/12/2026". Na edição seguinte, o campo veio "2026-12-29", o PUT enviou "2026-12-29" e o cartão mostrou "28/12/2026". Cada salvamento encurta a validade real em 1 dia (fuso UTC × America/Sao_Paulo na conversão de data).
- Arquivo provável: src/components/CouponWizard.jsx (date → ISO/UTC), src/components/admin/tabs/CouponsTab.jsx (formatação), handlers/admin/coupons.js
- Veio de verificação dirigida? sim (ponto a confirmar 3)

### ADM-40 — Mobile: ações de Pedidos e Usuários inacessíveis

- Severidade: alta
- Tela/URL: A30 — 390 px (iframe)
- Obtido: Pedidos: scrollWidth 554 × clientWidth 307, overflow-x hidden, "Detalhes" fora da tela. Usuários: 614 × 307, overflow-x hidden, o select de papel e a lixeira "Revogar acesso" fora da tela. A página não rola na horizontal. Mesmo padrão de ADM-02 e ADM-25.
- Arquivo provável: src/components/admin/tabs/OrdersTab.jsx, UsersTab.jsx
- Veio de verificação dirigida? sim

### ADM-41 — Depois do logout, o botão Voltar reexibe o painel com dados

- Severidade: alta
- Tela/URL: A31.4 — /admin
- Obtido: "Encerrar sessão" → POST /admin/logout 200, toast "Sessão administrativa encerrada.", formulário vazio na mesma /admin, `/admin/session` → false (ok). Em seguida, o botão Voltar (navigation type "back_forward") mostrou o painel inteiro com o h1 "Dashboard" e os números, com a sessão do servidor ainda false. Num computador compartilhado, os dados do painel ficam a um clique de distância.
- Arquivo provável: src/pages/AdminPage.jsx (sem revalidar a sessão no pageshow/bfcache), cabeçalhos da página (sem Cache-Control: no-store); relacionado ao ADM-01
- Veio de verificação dirigida? sim (A31.4)

### ADM-42 — Papéis "Admin"/"Suporte" oferecidos, mas sempre recusados

- Severidade: alta (função oferecida e quebrada; só "Cliente" funciona)
- Tela/URL: A26.4 — aba "Usuários", linha da conta descartável (CUSTOMER)
- Obtido: "Suporte" → PUT /admin/users {role:"support"} 400 "Role inválida. Não é permitido atribuir admin/master por este endpoint."; "Admin" → mesma resposta. O select volta para "Cliente". A mensagem fala em admin/master até para "Suporte", e o select e a lixeira não ficaram desabilitados durante a requisição (a resposta foi rápida demais para observar).
- Arquivo provável: src/components/admin/tabs/UsersTab.jsx, handlers/admin/users.js, validation/admin.schemas.js
- Veio de verificação dirigida? sim (ponto a confirmar 1)

### ADM-43 — Modal "Revogar acesso?" sem Esc, sem aria-modal e sem foco

- Severidade: média
- Tela/URL: A26.5–A26.7
- Obtido: um `<dialog>` sem aria-modal. O foco continua na lixeira atrás do modal; o Tab vai para o véu "Cancelar" (fora da caixa). Esc não fecha. "Cancelar" e o fundo fecham sem DELETE (ok). Há 2 elementos "Cancelar" e N+1 "Revogar acesso" com o mesmo nome acessível.
- Arquivo provável: src/pages/AdminPage.jsx / UsersTab.jsx
- Veio de verificação dirigida? sim

### ADM-44 — Erros de rede em Cupons e Pedidos viram só "Failed to fetch"

- Severidade: média
- Tela/URL: A24.14 / A25.6
- Obtido: com /admin/coupons bloqueado, a aba inteira mostra só "Failed to fetch" (sem "Novo cupom" nem tentar de novo). Com /admin/orders bloqueado, o card vira "Failed to fetch" e o select de status some. Nos dois casos, só trocando de aba a tela volta.
- Arquivo provável: src/components/admin/tabs/CouponsTab.jsx, OrdersTab.jsx
- Veio de verificação dirigida? não

### ADM-45 — Wizard de cupom fecha antes da resposta e aceita "@" no front

- Severidade: média
- Tela/URL: A24.10–A24.11
- Obtido: "TESTE-QA-P2-01" repetido → modal fecha e chega 409 "Já existe um cupom com esse código."; "PROMO@10" → o campo aceita "@" (a máscara de maiúsculas e sem espaços não filtra) e o modal fecha antes do 400 "Código só pode ter letras, números, ponto, hífen e underscore.". O usuário precisa redigitar tudo. Mesma causa de ADM-27.
- Arquivo provável: src/components/CouponWizard.jsx, src/components/ModalWizard.jsx
- Veio de verificação dirigida? não

### ADM-46 — Desconto percentual: só inteiros e limite de 100% só pelo balão do navegador

- Severidade: média
- Tela/URL: A24.5
- Obtido: 150 → balão nativo "O valor deve ser menor ou igual a 100." (a mensagem da aplicação "Desconto percentual não pode passar de 100%." nunca aparece); 12.5 → balão "Os dois valores válidos mais próximos são 12 e 13." (step 1: descontos fracionários impossíveis). Nenhuma requisição (ok).
- Arquivo provável: src/components/CouponWizard.jsx
- Veio de verificação dirigida? sim

### ADM-47 — Vitrine: sem validação imediata e permite seções duplicadas

- Severidade: média
- Tela/URL: A27.3–A27.6
- Obtido: "Produtos exibidos (4–20)" aceita 2 e 50 sem aviso (só corrige ao salvar, segundo o código). A "Categoria vinculada" oferece categorias já usadas em outras seções (Festa Junina, Formatura) e todas as 4 categorias-fantasma. Trocar a categoria vinculada não muda o "Título exibido" (uma seção "Volta às Aulas" continuaria com o título "sejam bem vindos ao natal"). "Remover" não pede confirmação. "Mais vendidos"/"Novidades" repetidos não fazem nada, sem aviso. A seção "sejam bem vindos ao natal" está ligada à categoria "teste" (sem produtos), o que causa a faixa vazia da home (LOJA-02).
- Arquivo provável: src/components/admin/tabs/VitrineTab.jsx
- Veio de verificação dirigida? sim

### ADM-48 — Pedidos sem busca, exportação nem ações

- Severidade: baixa (desenho)
- Tela/URL: A25.4
- Obtido: confirmado. Não há busca, CSV, mudança de status, reenvio de e-mail nem cancelamento (na aba e no modal). Os pedidos pendentes desde maio (ADM-16) não têm como ser tratados pela interface.
- Arquivo provável: src/components/admin/tabs/OrdersTab.jsx
- Veio de verificação dirigida? sim (ponto a confirmar 2)

### ADM-49 — Segurança sem QR code, gerador de segredo ou campo de confirmação

- Severidade: baixa (risco operacional)
- Tela/URL: A28.5
- Obtido: só o checkbox, "TOTP secret (Base32)" e "PIN de recuperação" (os olhos alternam password/text e Mostrar/Ocultar corretamente). Não há QR code, gerador de segredo nem campo de código atual: com 2FA ativo, trocar ou desligar provavelmente daria 403 pedindo "confirmationCode", sem onde informar.
- Arquivo provável: src/components/admin/tabs/SecurityTab.jsx
- Veio de verificação dirigida? sim (seção 4)

### ADM-50 — Mensagens cruas

- Severidade: baixa
- Obtido: `GET /api/cron-email-jobs` → 401 "Unauthorized" (inglês); "Failed to fetch" em todas as falhas de rede do painel.
- Arquivo provável: handlers/cron-email-jobs.js; abas do painel
- Veio de verificação dirigida? não

### ADM-51 — Cupom: confirm de exclusão e nomes acessíveis

- Severidade: baixa
- Obtido: o confirm nativo 'Excluir o cupom "TESTE-QA-P2-01"?' funciona (cancelar = 0 DELETE). A lixeira tem aria-label com o código (ok, ao contrário de produtos/categorias). Nenhum problema além do uso de window.confirm nativo (inconsistente com o modal de Usuários).
- Arquivo provável: src/components/admin/tabs/CouponsTab.jsx
- Veio de verificação dirigida? não

### ADM-52 — Ícones vazios nos toasts

- Severidade: baixa
- Obtido: "Cupom criado.", "Cupom atualizado.", "Cupom removido." com ícone ausente (mesma causa da LOJA-17).

## 4. Riscos da aba Segurança (relatados sem testar)

1. **Trancamento:** adminConfig nulo + checkbox marcado. Salvar ligaria o 2FA sem método, e o login cairia em 500 (ADM-38). Recuperação só por SQL.
2. **Sem confirmação de código:** com 2FA ativo, a tela não tem onde informar o código atual, então trocar ou desligar o 2FA provavelmente seria recusado (403 "confirmationCode"), sem saída pela interface (ADM-49).
3. **Chave de cifra em LOCAL:** falta ADMIN_2FA_ENC_KEY no .env.local, então salvar a partir do local regravaria o segredo com a chave errada e quebraria o TOTP em produção (aviso do roteiro; nada foi salvo).
4. requireSecondFactor/require2FA: ausentes na resposta (valor nulo), então não dá para comparar com o checkbox.

## 5. Pontos a confirmar: resultado de cada um

1. Só "Cliente" pode ser gravado pela tela? Sim: "Admin" e "Suporte" sempre dão 400 (ADM-42). "Cliente" não foi regravado (a conta já era CUSTOMER).
2. Pedidos só leitura? Sim (ADM-48).
3. Validade do cupom com 1 dia de diferença? Sim, e piora a cada edição (ADM-39).
4. "Encerrar sessão" mostra o formulário na própria /admin? Sim (POST 200, toast, formulário vazio, session false, F5 continua no formulário). Ressalva: o botão Voltar reexibe o painel (ADM-41).

## 6. Itens NÃO testados e por quê

| Item                                | Motivo                                             |
| ----------------------------------- | -------------------------------------------------- |
| A24.12 cupom com limite 0           | opcional, não feito                                |
| A27.8 "Salvar vitrine"              | sem autorização escrita                            |
| A28.6 testes negativos de Segurança | sem autorização escrita                            |
| Gravar papel "Cliente"              | a conta já era cliente; nenhuma mudança necessária |
| Larguras reais 390/1440             | janela maximizada; iframe de 390 px                |

## 7. Dados [TESTE] criados

| Dado                                           | Aba      | Identificador          | Apagado?                | Observação                                   |
| ---------------------------------------------- | -------- | ---------------------- | ----------------------- | -------------------------------------------- |
| Cupom TESTE-QA-P2-01 (10%, mín. R$ 20, 5 usos) | Cupons   | id 1                   | sim (19:02, DELETE 200) | ATIVO de 18:57:40 a 18:57:56; inativo depois |
| Tentativas de papel support/admin              | Usuários | conta q***@example.com | —                       | recusadas (400); nada gravado                |
| Vitrine                                        | Vitrine  | —                      | —                       | não salva; settings idêntico ao original     |

Contagens finais: cupons 0 (= base), pedidos 14, usuários 10.

## 8. ESTADO PARA A PRÓXIMA ETAPA

- Telas concluídas: A23–A31 · Versão ATUAL · 2FA não exigido
- Logins admin: nenhum novo (último 18:36:25) · Sessão admin ativa? **não** (encerrada às 19:02:39; o 3A precisa de novo login)
- Linha de base: 0 cupons, 14 pedidos, 10 usuários
- Cupons TESTE-QA-P2: nenhum (apagado)
- Vitrine original (não alterada): [Mais vendidos (best_sellers, 8), "sejam bem vindos ao natal" (category 227b287d… = "teste", 8), "Festa Junina" (category 7c48c087…, 8), Novidades (new_arrivals, 8)]
- session_id: 71dc5f61-855b-4e10-8999-09ba8e57e4e9 · Último ADM-nn: ADM-52
