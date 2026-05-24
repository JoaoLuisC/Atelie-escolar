# Ateliê da Escola

Plataforma de vendas de materiais educativos digitais (banners, painéis, atividades pedagógicas) com download imediato após pagamento aprovado.

**Stack**: React 19 + Vite + Tailwind + Express + Supabase + Mercado Pago.

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
| **[docs/README.md](./docs/README.md)** | Visão geral, stack, scripts |
| **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** | Estrutura de pastas, decisões, camada de dados |
| **[docs/FLOWS.md](./docs/FLOWS.md)** | Fluxogramas em Mermaid (auth, checkout, admin, webhook) |
| **[docs/SETUP.md](./docs/SETUP.md)** | Setup detalhado de Supabase, Google OAuth, Mercado Pago, deploy |
| **[docs/SECURITY.md](./docs/SECURITY.md)** | Modelo de ameaça, RLS, secrets, auditoria |
| [docs/SUPABASE-SETUP.md](./docs/SUPABASE-SETUP.md) | Setup específico Supabase (legado) |
| [docs/E2E-CHECKLIST-SANDBOX.md](./docs/E2E-CHECKLIST-SANDBOX.md) | Testes end-to-end (sandbox MP) |
| [docs/RELEASE-CHECKLIST.md](./docs/RELEASE-CHECKLIST.md) | Pré-deploy |

---

## Para que serve

- ✅ Visitante navega catálogo, busca, filtra e adiciona ao carrinho
- ✅ Cliente faz checkout integrado com Mercado Pago (cartão, pix, boleto)
- ✅ Após aprovação, libera download automático dos arquivos comprados
- ✅ Admin gerencia produtos (com galeria + vídeos), categorias, pedidos, vitrine, usuários
- ✅ Auth com Supabase (e-mail/senha + Google OAuth) + recuperação por e-mail
- ✅ Admin com 2FA opcional (TOTP + PIN de recuperação)

---

## Scripts úteis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Frontend Vite em :5173 |
| `npm run dev:api` | API Express em :3000 |
| `npm run dev:all` | Os dois em paralelo |
| `npm run build` | Build de produção |
| `npm run test` | Vitest |
| `npm run check` | test + build (usado em CI) |

### Scripts utilitários (`scripts/`)

| Script | Uso |
|--------|-----|
| `check-advisor.js` | Lê Security Advisor do Supabase via Management API |
| `configure-auth.js` | Atualiza URLs OAuth permitidas no Supabase |
| `fix-dns.ps1` | Conserta DNS local Windows (precisa admin) |
| `fix-utf8.js` | Conserta encoding de dados corrompidos no banco |
| `check-utf8.js` | Audita encoding nos textos do banco (sem alterar) |
| `db-inspect.js` | Inventário de tabelas via REST |

Necessitam variáveis: `SUPABASE_PAT=sbp_...` e `SUPABASE_PROJECT_REF=<ref>`.

---

## Licença

MIT
