# Ateliê da Escola

Loja de materiais educativos digitais (banners, painéis, atividades pedagógicas) com download
liberado assim que o pagamento é aprovado.

**Stack**: React 19 + Vite 8 + Tailwind no front · Express 5 e funções serverless na Vercel ·
Supabase (Postgres 17 + Auth + Storage) · Mercado Pago · Resend.

---

## Quickstart

```bash
git clone <repo>
cd Atelie-escolar
npm install
cp .env.example .env.local   # editar com suas credenciais
npm run dev:all              # frontend :5173 + API :3000
```

Abra http://localhost:5173. Cada variável do `.env.local` está explicada em
[docs/ProjectDocs/03-SETUP.md](./docs/ProjectDocs/03-SETUP.md) — inclusive como gerar os quatro
segredos obrigatórios e como aplicar o schema no Supabase.

---

## Documentação

**[docs/README.md](./docs/README.md)** é o índice de tudo. Os atalhos mais usados:

| Documento                                                                      | Para quê                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------ |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                                           | 29 regras de convenção — ler antes de abrir PR   |
| [docs/ProjectDocs/03-SETUP.md](./docs/ProjectDocs/03-SETUP.md)                 | Rodar localmente do zero                         |
| [docs/ProjectDocs/02-ARQUITETURA.md](./docs/ProjectDocs/02-ARQUITETURA.md)     | Onde cada coisa mora e como um request flui      |
| [docs/ProjectDocs/09-API-ENDPOINTS.md](./docs/ProjectDocs/09-API-ENDPOINTS.md) | Referência REST                                  |
| [docs/ProjectDocs/08-SEGURANCA.md](./docs/ProjectDocs/08-SEGURANCA.md)         | Modelo de ameaça, RLS, secrets, LGPD             |
| [docs/adr/](./docs/adr/README.md)                                              | Por que o projeto é assim (decisões estruturais) |

---

## O que a loja faz

- Visitante navega o catálogo, filtra (categoria, preço, novidades, mais vendidos) e ordena
- Checkout via Mercado Pago (cartão, Pix, boleto) com cupons validados no servidor
- Download liberado automaticamente após aprovação, por token de uso único
- Admin gerencia produtos (galeria, vídeos, FAQ, depoimentos, benefícios), categorias, cupons,
  pedidos, vitrine e usuários — 14 abas
- Painéis de análise: funil, Curva ABC (produtos e clientes), coorte de retenção, faturamento,
  comparativo, segmentos de e-mail
- E-mails automáticos por cron horário: newsletter com double opt-in, carrinho abandonado
  (1h/24h), pós-compra (D+3/D+15/D+45) e reativação (90 dias)
- Auth Supabase (e-mail/senha + Google OAuth) com recuperação por e-mail
- Admin com 2FA opcional (TOTP + PIN de recuperação) e audit log append-only das escritas
- LGPD: banner de consentimento, exclusão de conta em dois passos, purga automática de logs

---

## Scripts

| Comando                    | O que faz                                                                       |
| -------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`              | Frontend Vite em :5173                                                          |
| `npm run dev:api`          | API Express em :3000                                                            |
| `npm run dev:all`          | Os dois em paralelo                                                             |
| `npm run build`            | Build de produção                                                               |
| `npm run preview`          | Serve o build localmente                                                        |
| `npm test`                 | Vitest                                                                          |
| `npm run test:coverage`    | Vitest com relatório de cobertura                                               |
| `npm run lint`             | ESLint (catraca em `--max-warnings=17`)                                         |
| `npm run format`           | Prettier — escreve                                                              |
| **`npm run check`**        | **O gate: env + format + lint + testes + cobertura + build.** Mesma ordem do CI |
| `npm run supabase:db:push` | Aplica as migrations no Supabase remoto                                         |

Também há `supabase:login`, `supabase:link`, `supabase:db:pull` e `supabase:migration:new`.

### Utilitários (`scripts/`)

| Script                 | Uso                                                | Precisa de                                       |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `check-env.js`         | Valida o ambiente — roda dentro do `npm run check` | —                                                |
| `build-icon-subset.js` | Gera o subset da fonte de ícones                   | —                                                |
| `check-advisor.js`     | Lê o Security Advisor do Supabase                  | `SUPABASE_PAT` + `SUPABASE_PROJECT_REF`          |
| `configure-auth.js`    | Atualiza as URLs OAuth permitidas no Supabase      | `SUPABASE_PAT` + `SUPABASE_PROJECT_REF`          |
| `check-utf8.js`        | Audita encoding nos textos do banco (não altera)   | `SUPABASE_PAT` + `SUPABASE_PROJECT_REF`          |
| `fix-utf8.js`          | Conserta encoding corrompido no banco              | `SUPABASE_PAT` + `SUPABASE_PROJECT_REF`          |
| `db-inspect.js`        | Inventário de tabelas via REST                     | `SUPABASE_URL` + `ANON_KEY` + `SERVICE_ROLE_KEY` |
| `fix-dns.ps1`          | Conserta DNS local no Windows                      | admin                                            |

---

## Licença

MIT
