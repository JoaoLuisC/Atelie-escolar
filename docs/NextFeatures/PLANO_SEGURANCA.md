# Plano de Segurança

> **Auditoria fechada em 2026-05-24.** Todas as 16 ações (A1–A16) foram implementadas, mais 6 entregas descobertas no caminho. Este documento ficou apenas como referência histórica.

## Onde está cada coisa agora

| Pergunta                                                | Resposta                                      |
| ------------------------------------------------------- | --------------------------------------------- |
| Quais controles de segurança o projeto tem?             | [SECURITY.md](../ProjectDocs/08-SEGURANCA.md) |
| O que ainda depende de mim (DNS, calendário, pen-test)? | [PENDENCIAS.md §5](./PENDENCIAS.md)           |
| O que mudou e quando?                                   | §"Histórico" abaixo                           |
| Qual era o diagnóstico original e por que fizemos isso? | §"Referências acadêmicas" abaixo              |

---

## Referências acadêmicas que ancoraram o diagnóstico

- Eckert, Dal Bó, Milan, Eberle (2017). _E-commerce: privacidade, segurança e qualidade das informações como preditores da confiança_. Revista Pensamento Contemporâneo em Administração, v. 11, n. 5.
- Cartem, Julião, Sarro (2022). _Segurança da Informação no E-commerce B2C_. FATEC Americana.
- Moreira (2016). _O comércio eletrônico, os métodos de pagamentos e os mecanismos de segurança_. REFAS, v. 3, n. 1.
- Alves (2025). _A Influência da Segurança e da Experiência do Usuário nas Preferências de Compra em Plataformas de E-commerce_. TCC IFPB.

Achados que motivaram o plano:

- Privacidade percebida explica **70,1%** da segurança percebida; segurança e qualidade da informação juntas explicam **68,4%** da confiança (Eckert et al., 2017).
- **74,8%** dos consumidores citam "não receber o produto" como maior preocupação; **72%** citam fraude e roubo de dados (Alves, 2025).
- LGPD exige opt-in real, finalidade declarada, minimização e direito à exclusão (Cartem & Julião, 2022).

---

## Histórico de revisões

| Data       | Mudança                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-24 | Versão inicial — diagnóstico cruzado com as 4 referências acadêmicas. 12 riscos catalogados (R1–R12), 16 ações priorizadas em 4 sprints (A1–A16).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-24 | Sprints 1 e 2 concluídos (A1–A8): histórico do git auditado, webhook exige assinatura fora de `APP_ENV=test` (depois endurecido: hoje a assinatura é exigida em todos os ambientes, inclusive `test` — bypass removido, com teste de regressão), segredos validados no boot, fallbacks inseguros removidos, CORS wildcard tirado, `serviceRoleHelpers` força opt-in pra service-role, `order_code` com 128 bits + email obrigatório em `/verify-payment`, `Referrer-Policy: no-referrer` no download, `/privacidade` + `/termos` publicadas.                                                                                                                                                                                                                                                                                                                                                  |
| 2026-05-24 | Sprints 3 e 4 concluídos (A9–A16): `.env.example` migrou de Gmail para Resend, `purge_old_logs()` com `pg_cron` (versão atual, pós-phase6: `download_logs` 12m / `security_events` 6m / `page_views` 6m / `admin_audit_log` 18m; `analytics_events` passou para `cleanup_old_analytics_events()`, 180 dias), CSP estrita em [lib/security-headers.js](../../lib/security-headers.js), Zod do produto bloqueia `javascript:`/`data:`, rate-limit dedicado em `/verify-payment` (só no BFF Express, em `routes/api-compat.routes.js` — na Vercel serverless não há rate limiting; pendência "API-03" anotada em `routes/auth.routes.js`), log estruturado de fraude em `security_events`.                                                                                                                                                                                                       |
| 2026-05-24 | **Auditoria fechada.** Entregas extras além do plano: campo `details` removido dos 17 handlers então existentes em `api/` (R10; contagem da época — hoje `api/` tem ~42 handlers, não re-auditados um a um), `app.set('trust proxy', 1)` em [server.js](../../server.js), coletor [lib/security-logger.js](../../lib/security-logger.js) com 3 destinos, `pg_cron` habilitada e job diário agendado, signed URL via Supabase Storage no download (R7 reforçado; só atua quando `download_url` aponta pro Storage — URLs externas, como as do seed no Google Drive, seguem no redirect legado com `Referrer-Policy: no-referrer`), `supabase/schema.sql` regenerado. 76 testes de backend passando (snapshot da data da auditoria; a suíte cresceu desde então — ver `npm test`). Conteúdo consolidado em [SECURITY.md](../ProjectDocs/08-SEGURANCA.md) e [PENDENCIAS.md §5](./PENDENCIAS.md). |
