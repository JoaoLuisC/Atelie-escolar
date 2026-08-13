# Ateliê da Escola

Plataforma de vendas de materiais educativos digitais (banners, painéis, atividades pedagógicas) com download imediato após pagamento aprovado.

**Stack**: React 19 + Vite + Tailwind + Express 5 + Supabase + Mercado Pago.

---

## Quickstart

```bash
git clone <repo>
cd Projeto-mae
npm install
cp .env.example .env.local   # editar com suas credenciais
npm run dev:all              # sobe frontend (5173) + API (3000)
```

Abra http://localhost:5173

---

## Documentação completa

| 📖 Documento | Conteúdo |
|----|----|
| **[CONTRIBUTING.md](./CONTRIBUTING.md)** | **Padrões de código — 25 regras de convenção, ler antes de abrir PR** |
| **[docs/README.md](./docs/README.md)** | Visão geral, stack, scripts |
| **[docs/adr/](./docs/adr/README.md)** | Decisões estruturais (ADRs) e por que o projeto é assim |
| **[docs/ProjectDocs/02-ARQUITETURA.md](./docs/ProjectDocs/02-ARQUITETURA.md)** | Estrutura de pastas, decisões, camada de dados |
| **[docs/ProjectDocs/05-FLUXOS.md](./docs/ProjectDocs/05-FLUXOS.md)** | Fluxos de auth, checkout, admin e webhook |
| **[docs/ProjectDocs/03-SETUP.md](./docs/ProjectDocs/03-SETUP.md)** | Setup de Supabase, Google OAuth, Mercado Pago, deploy |
| **[docs/ProjectDocs/08-SEGURANCA.md](./docs/ProjectDocs/08-SEGURANCA.md)** | Modelo de ameaça, RLS, secrets, auditoria |
| [docs/SUPABASE-SETUP.md](./docs/SUPABASE-SETUP.md) | Setup específico Supabase (legado) |
| [docs/RELEASE-CHECKLIST.md](./docs/RELEASE-CHECKLIST.md) | Pré-deploy |
| [docs/SPRING-SECURITY-BFF.md](./docs/SPRING-SECURITY-BFF.md) | Referência: BFF de auth do cliente em Spring Boot |
| [docs/REVIEW-PROMPTS.md](./docs/REVIEW-PROMPTS.md) | Prompts de review profundo por área |
| [docs/REVIEW-RESULTS.md](./docs/REVIEW-RESULTS.md) | Resultados dos reviews (área 9 em [REVIEW-AREA-9-TESTES.md](./docs/REVIEW-AREA-9-TESTES.md)) |

---

## Para que serve

- ✅ Visitante navega catálogo, filtra (categoria, preço, novidades/mais vendidos), ordena e adiciona ao carrinho
- ✅ Cliente faz checkout integrado com Mercado Pago (cartão, pix, boleto)
- ✅ Após aprovação, libera download automático dos arquivos comprados
- ✅ Admin gerencia produtos (galeria + vídeos + FAQ/depoimentos/benefícios), categorias, **cupons**, pedidos, vitrine, usuários
- ✅ Painéis de análise: funil, segmentos de e-mail, Curva ABC (produtos/clientes), coorte de retenção, faturamento, comparativo
- ✅ E-mails automáticos: newsletter com double opt-in, carrinho abandonado (1h/24h), pós-compra (D+3/D+15/D+45) e reativação — cron horário via GitHub Actions
- ✅ Auth com Supabase (e-mail/senha + Google OAuth) + recuperação por e-mail
- ✅ Admin com 2FA opcional (TOTP + PIN de recuperação) + **audit log** das ações de escrita
- ✅ LGPD: cliente pode excluir a própria conta (auto-serviço com confirmação por e-mail)

---

## Scripts úteis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Frontend Vite em :5173 |
| `npm run dev:api` | API Express em :3000 |
| `npm run dev:all` | Os dois em paralelo |
| `npm run build` | Build de produção |
| `npm run preview` | Serve o build de produção localmente |
| `npm run test` | Vitest |
| `npm run check` | test + build (usado em CI) |
| `npm run supabase:db:push` | Aplica migrações no Supabase remoto (há também `supabase:login`, `supabase:link`, `supabase:db:pull`, `supabase:migration:new`) |

### Scripts utilitários (`scripts/`)

| Script | Uso |
|--------|-----|
| `check-advisor.js` | Lê Security Advisor do Supabase via Management API |
| `configure-auth.js` | Atualiza URLs OAuth permitidas no Supabase |
| `fix-dns.ps1` | Conserta DNS local Windows (precisa admin) |
| `fix-utf8.js` | Conserta encoding de dados corrompidos no banco |
| `check-utf8.js` | Audita encoding nos textos do banco (sem alterar) |
| `db-inspect.js` | Inventário de tabelas via REST |

Os scripts de Management API (`check-advisor`, `configure-auth`, `check-utf8`, `fix-utf8`) necessitam `SUPABASE_PAT=sbp_...` e `SUPABASE_PROJECT_REF=<ref>`; `db-inspect.js` usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.

---

## Licença

MIT
