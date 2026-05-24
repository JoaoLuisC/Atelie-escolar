# Plano de Segurança

> **Auditoria fechada em 2026-05-24.** Todas as 16 ações (A1–A16) foram implementadas, mais 6 entregas descobertas no caminho. Este documento ficou apenas como referência histórica.

## Onde está cada coisa agora

| Pergunta | Resposta |
|---|---|
| Quais controles de segurança o projeto tem? | [SECURITY.md](./SECURITY.md) |
| O que ainda depende de mim (DNS, calendário, pen-test)? | [PENDENCIAS.md §8](./PENDENCIAS.md) |
| O que mudou e quando? | §"Histórico" abaixo |
| Qual era o diagnóstico original e por que fizemos isso? | §"Referências acadêmicas" abaixo |

---

## Referências acadêmicas que ancoraram o diagnóstico

- Eckert, Dal Bó, Milan, Eberle (2017). *E-commerce: privacidade, segurança e qualidade das informações como preditores da confiança*. Revista Pensamento Contemporâneo em Administração, v. 11, n. 5.
- Cartem, Julião, Sarro (2022). *Segurança da Informação no E-commerce B2C*. FATEC Americana.
- Moreira (2016). *O comércio eletrônico, os métodos de pagamentos e os mecanismos de segurança*. REFAS, v. 3, n. 1.
- Alves (2025). *A Influência da Segurança e da Experiência do Usuário nas Preferências de Compra em Plataformas de E-commerce*. TCC IFPB.

Achados que motivaram o plano:

- Privacidade percebida explica **70,1%** da segurança percebida; segurança e qualidade da informação juntas explicam **68,4%** da confiança (Eckert et al., 2017).
- **74,8%** dos consumidores citam "não receber o produto" como maior preocupação; **72%** citam fraude e roubo de dados (Alves, 2025).
- LGPD exige opt-in real, finalidade declarada, minimização e direito à exclusão (Cartem & Julião, 2022).

---

## Histórico de revisões

| Data | Mudança |
|---|---|
| 2026-05-24 | Versão inicial — diagnóstico cruzado com as 4 referências acadêmicas. 12 riscos catalogados (R1–R12), 16 ações priorizadas em 4 sprints (A1–A16). |
| 2026-05-24 | Sprints 1 e 2 concluídos (A1–A8): histórico do git auditado, webhook exige assinatura fora de `APP_ENV=test`, segredos validados no boot, fallbacks inseguros removidos, CORS wildcard tirado, `serviceRoleHelpers` força opt-in pra service-role, `order_code` com 128 bits + email obrigatório em `/verify-payment`, `Referrer-Policy: no-referrer` no download, `/privacidade` + `/termos` publicadas. |
| 2026-05-24 | Sprints 3 e 4 concluídos (A9–A16): `.env.example` migrou de Gmail para Resend, `purge_old_logs()` com `pg_cron` (`download_logs` 12m / `analytics_events` 24m / `security_events` 6m), CSP estrita em [lib/security-headers.js](../lib/security-headers.js), Zod do produto bloqueia `javascript:`/`data:`, rate-limit dedicado em `/verify-payment`, log estruturado de fraude em `security_events`. |
| 2026-05-24 | **Auditoria fechada.** Entregas extras além do plano: campo `details` removido dos 17 handlers (R10), `app.set('trust proxy', 1)` em [server.js](../server.js), coletor [lib/security-logger.js](../lib/security-logger.js) com 3 destinos, `pg_cron` habilitada e job diário agendado, signed URL via Supabase Storage no download (R7 reforçado), `supabase/schema.sql` regenerado. 76 testes de backend passando. Conteúdo consolidado em [SECURITY.md](./SECURITY.md) e [PENDENCIAS.md §8](./PENDENCIAS.md). |
