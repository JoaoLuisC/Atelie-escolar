> **ATENÇÃO — segredos.** Os PATs Supabase e as senhas de admin/clientes que estavam neste
> arquivo foram redigidos, mas **continuam no histórico do git** (este arquivo esteve no `main`).
> Pendências, nesta ordem: (1) revogar os PATs no dashboard Supabase e **trocar a senha do
> admin e das contas de teste**; (2) só então expurgar o histórico com `git filter-repo
--replace-text` e forçar re-clone. Rotacionar antes de expurgar — o expurgo sozinho apenas
> avisa quem já tem o dado. Nunca voltar a versionar credencial aqui: este arquivo é handoff,
> não cofre.

# Handoff — sessão Claude (2026-05-30)

> Última atualização: 2026-07-19.
> Resumo de tudo que foi feito naquela sessão. Use como contexto para a próxima conversa em outro chat. Não é doc oficial do projeto — é "estado atual + o que muda em relação ao código no `main`". As seções 0–4 são histórico datado da sessão de 2026-05-30; as seções 5–9 refletem o estado atual do código.

---

## 0. TL;DR do que mudou

| Área                | O que aconteceu                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Banco**           | Banco zerado e re-seedado. Admin novo: `adminmarcia@gmail.com` (senha fora do repositório — ver gerenciador de segredos). 10 produtos, 7 categorias, 7 clientes auth + perfis, 12 pedidos (10 aprovados, 1 pendente, 1 cancelado), R$ 557 de receita. Tudo em `npgtngcdskwcsmgymkql.supabase.co`. |
| **Storage**         | Bucket `product_images` virou **público**. Imagens dos 9 produtos seed + arquivos de download `.txt` (placeholder) já uploadados via Storage API. URL pattern: `https://npgtngcdskwcsmgymkql.supabase.co/storage/v1/object/public/product_images/<slug>.jpg`.                                     |
| **Migrations**      | Aplicada a `20260528000000_phase3_email_marketing` (cria `email_subscribers` + `email_sent_log`). Antes desse fix, `/api/admin-segments` retornava 500.                                                                                                                                           |
| **Upload no admin** | Wizard de produto step "Mídia" agora **sobe arquivo do PC** via signed upload URL — não pede mais URL manual. Endpoint novo: `POST /api/admin-upload-url`.                                                                                                                                        |
| **Sidebar admin**   | Sticky (fixa na rolagem), botão "Ver loja" no topo, logout faz redirect pra `/login`.                                                                                                                                                                                                             |
| **Front Shell**     | Botão "· admin ·" do rodapé do `/login` removido. Carrinho + "Meus produtos" ficam ocultos quando role=admin.                                                                                                                                                                                     |
| **Curva ABC**       | Cada card da aba Análise (Produtos, Clientes, Coorte) ganhou botão "Como ler" → modal com seções "Como funciona / O que observar / Como agir".                                                                                                                                                    |
| **Box shadow**      | `shadow-brand` virou multi-camada; cards de produto usam `shadow-brand-soft` base + hover `shadow-brand` com transição suave.                                                                                                                                                                     |
| **Validações**      | Categoria não aceita mais UUID como nome (anti-paste). Erros viram 400 com mensagem real ao invés de 500 genérico.                                                                                                                                                                                |
| **Bugs corrigidos** | (a) `categoryId` ausente no payload do dashboard quebrava filtro de produtos por categoria; (b) `/api/admin-upload-url` enviava `Content-Type: application/json` sem body → 400 do Storage; ambos resolvidos.                                                                                     |

---

## 1. Credenciais e infra

### Supabase

- **Project ref**: `npgtngcdskwcsmgymkql`
- **PAT usado nessa sessão**: `sbp_REVOGADO_ROTACIONAR_NO_DASHBOARD` — **ROTACIONAR**: este token apareceu no chat (e o anterior, `sbp_REVOGADO_ROTACIONAR_NO_DASHBOARD`, também). Ambos devem ser revogados em https://supabase.com/dashboard/account/tokens.
- **`SUPABASE_SERVICE_ROLE_KEY`**: lido de `.env.local`; usado por scripts e pelo backend Express.

### Conta admin

- Email: `adminmarcia@gmail.com` (normalizado pelo GoTrue de `adminMarcia@gmail.com`)
- Senha: **fora do repositório** — guardada no gerenciador de segredos. A senha que estava aqui foi exposta no histórico do git e **deve ser considerada comprometida**; troque-a e nunca versione a nova.
- Role no `profiles`: `ADMIN` (uppercase — `profiles.role` aceita `CUSTOMER | ADMIN | MASTER`, default `CUSTOMER`; o login admin exige `ADMIN` ou `MASTER`)
- Email já confirmado (criado com `email_confirm: true`)
- URL de login admin: `/painel-acesso-privado-atelie`

### Contas cliente (fake, senha compartilhada fora do repositório, email confirmado)

| Email                     | Display name | Pedidos         |
| ------------------------- | ------------ | --------------- |
| `ana.lima@example.com`    | Ana Lima     | 2               |
| `carla.souza@example.com` | Carla Souza  | 2               |
| `mariana.r@example.com`   | Mariana R.   | 2 (1 pending)   |
| `beatriz@example.com`     | Beatriz F.   | 2 (1 cancelled) |
| `joana@example.com`       | Joana M.     | 1               |
| `lucas.p@example.com`     | Lucas P.     | 1               |
| `patricia@example.com`    | Patricia L.  | 2               |

Todos têm `role = CUSTOMER`. Os pedidos têm `customer_id` linkado (via update por email match).

---

## 2. Estado do banco (snapshot de 2026-05-30)

| Tabela              | Linhas | Observações                                                                                                                     |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `categories`        | 7      | 6 seed + 1 "Sem nome (renomeie)" — categoria órfã renomeada (era nome=UUID por colagem acidental)                               |
| `products`          | 10     | 9 seed (imagens no Storage, downloads em `product_files/<slug>.txt`) + 1 "teste" criado pelo usuário                            |
| `profiles`          | 8      | 1 ADMIN + 7 CUSTOMER                                                                                                            |
| `orders`            | 12     | 10 approved (R$ 557), 1 pending, 1 cancelled; espalhados entre 1d e 75d atrás                                                   |
| `order_items`       | 15     | Vários pedidos com >1 item para testar multi-line                                                                               |
| `email_subscribers` | 0      | Tabela existe (migration phase3 aplicada)                                                                                       |
| `coupons`           | 0      | Tabela existe, vazia. Aba "Cupons" do admin + backend `api/admin-coupons.js` hoje estão implementados de ponta a ponta (ver §5) |
| `download_tokens`   | 0      | Geradas só quando há compra real via webhook MP                                                                                 |

### Categoria com nome estranho

Existe categoria `id=28e9af47-ed9b-4c7f-ad2b-ba2c2e437d5a` que ficou com nome "Sem nome (renomeie)". Foi renomeada nesta sessão (era nome=UUID). Tem 1 produto vinculado: "teste". Pode renomear via aba Categorias do admin ou excluir após reassignar o "teste" pra outra categoria.

---

## 3. Storage do Supabase

### Buckets ativos

| Bucket           | Público | Limite | MIME types                       | Conteúdo                  |
| ---------------- | ------- | ------ | -------------------------------- | ------------------------- |
| `product_images` | **Sim** | 10MB   | image/jpeg, png, webp, avif, gif | 9 JPEGs dos produtos seed |
| `product_videos` | Não     | 50MB   | video/mp4, webm, quicktime       | vazio                     |
| `product_files`  | Não     | 50MB   | qualquer                         | 9 `.txt` de placeholder   |

### Convenção de URLs

- **Imagens**: armazenadas em `products.image_url` e `products.images[]` como URL pública completa
  `https://npgtngcdskwcsmgymkql.supabase.co/storage/v1/object/public/product_images/<filename>`
- **Downloads**: armazenadas em `products.download_url` no formato curto `product_files/<filename>`. O `lib/storage-signed-url.js` reconhece esse padrão e gera signed URL na hora do cliente baixar.
- **Vídeos**: salvos como URL completa do bucket privado (o `storage-signed-url.js` também sabe lidar com signed URL nesse caso, mas o player precisa autenticação — ainda não implementado no front).

### Endpoint novo `/api/admin-upload-url` ([api/admin-upload-url.js](api/admin-upload-url.js))

- POST com `{ kind: 'image'|'video'|'download', filename, mimeType }`
- Requer `admin_session` cookie válido
- Pega signed upload URL do Storage e devolve `{ uploadUrl, finalUrl, bucket, path, maxSize }`
- Frontend (`uploadProductAsset` em `src/services/admin-panel.js`) faz `PUT` direto pro `uploadUrl` via XHR (com progress bar) — bypassa o limite de body de 1MB do Express
- Validação de extensão/MIME por kind no backend (SVG/HTML bloqueados no bucket público)
- Path gerado com prefixo `<timestamp>-<rand>-<slug>` pra evitar colisão

---

## 4. Mudanças de código na sessão de 2026-05-30 (arquivos tocados)

### Frontend

- `src/pages/CustomerAuthPage.jsx` — removido botão `· admin ·` do rodapé do login + removido import de `ADMIN_LOGIN_PATH`
- `src/components/Shell.jsx` — Carrinho e "Meus produtos" só renderizam se `!isAdminRole`. Aplicado em desktop nav E mobile menu
- `src/components/admin/AdminLayout.jsx` — `<aside>` virou `lg:sticky lg:top-0` com `h-screen` (não scrola mais junto). Adicionado `<Link to="/">` "Ver loja" no topo da nav. **Nota**: usuário adicionou item "Cupons" em `NAV_SECTIONS` em paralelo
- `src/pages/AdminPage.jsx` — `useNavigate` importado, `onLogout` agora chama `navigate('/login', { replace: true })` no `finally`
- `src/components/admin/tabs/AnalysisTab.jsx` — adicionado `EXPLANATIONS` (3 entries: products, customers, cohort) + `ExplainModal` + `ExplainSection` + estado `explainKey`. Cada card do tipo Curva ABC ganhou botão "Como ler" ao lado do CSV
- `src/components/ProductGrid.jsx` — shadow do card mudou pra `shadow-brand-soft` base + `hover:shadow-brand` com `duration-300`
- `src/pages/HomePage.jsx` — banner inicial (hero) reduzido (padding e fonte); removido marquee BOTTOM ("PDF EM ALTA RESOLUÇÃO ✦…"); CTA "Pronto para começar?" removido; cards de produto na home recebem mesmo shadow novo; marquee top com 4 cópias e `pr-8` pra loop sem gap
- `src/components/ProductWizard.jsx` — step "Mídia" reescrito com componente `AssetUploader` (file picker + preview + progress XHR + clear/trocar). Aceita imagens (10MB), vídeos (50MB), arquivo de download (50MB)
- `src/services/admin-panel.js` — adicionado `uploadProductAsset({ kind, file, onProgress })`
- `tailwind.config.js` — `shadow-brand` virou multi-camada; adicionado `shadow-brand-soft`

### Frontend — modificações do USUÁRIO em paralelo (não revertidas)

- `src/components/ProductWizard.jsx` ganhou step 4 "Conversão" (benefits, FAQ, reviews). Helpers `normalizeBenefits/cleanBenefits` etc adicionados pelo usuário
- `src/components/admin/AdminLayout.jsx` ganhou item "Cupons" em `NAV_SECTIONS`
- `src/services/admin-panel.js` ganhou `fetchAdminCoupons/createAdminCoupon/updateAdminCoupon/deleteAdminCoupon`
- `routes/api-compat.routes.js` ganhou mount de `/admin-coupons`

### Backend

- `api/admin-upload-url.js` — novo endpoint signed upload (descrito acima)
- `api/admin-dashboard.js` — produtos agora expõem `categoryId` no payload (era ausente, quebrava filtro por categoria)
- `api/admin-categories.js` — validação de nome: rejeita formato UUID, rejeita <2 ou >60 chars; erros viram 400 com mensagem real (antes virava 500 genérico no catch global)
- `routes/api-compat.routes.js` — registrado `/admin-upload-url` (e usuário registrou `/admin-coupons` em paralelo)

### Removido

- `src/components/TrustBadgeRow.jsx` — apagado (não era usado mais após remoção das instâncias na Home e Checkout)
- Footer (`Shell.jsx`): redesenhado (foi pedido "footer mais profissional e cor escura") — agora `bg-slate-950` sólido, sem orbs de blur, layout 4 colunas, social icons em estilo "outline+hover fill"; mensagem italic "Iluminando o futuro com criatividade e amor" foi removida

---

## 5. Pendências não resolvidas / coisas que NÃO foram feitas

### Operacional

- **Rotacionar PATs vazados**: tokens `sbp_REVOGADO_ROTACIONAR_NO_DASHBOARD` (2 PATs) apareceram no chat — revogar ambos no dashboard Supabase
- **og-default.png** ainda não existe em `public/` — mas `SEO.jsx` não o referencia mais: o fallback de OG image hoje é `/favicon.svg`. Criar um `og-default.png` 1200×630 segue como melhoria (ver `13-ROADMAP-PENDENCIAS.md §2.2`)
- **DKIM/SPF/DMARC no Resend**: domínio ainda não autenticado; sandbox só entrega para o email dono da conta Resend
- **Sitemap no Search Console**: ainda não submetido
- **Rate limiting em produção**: os limiters (express-rate-limit) só rodam no Express de dev; nas funções serverless da Vercel não há store compartilhado (pendência "API-03")

### Aba "Cupons" do admin — ✅ implementada

- `api/admin-coupons.js` existe: CRUD completo (GET/POST/PUT/DELETE) com sessão admin + audit log
- Frontend: aba `cupons` (`src/components/admin/tabs/CouponsTab.jsx`) + `src/components/CouponWizard.jsx`, plugada em `AdminPage.jsx`
- Checkout valida cupom via `POST /api/validate-coupon` (prévia no `CouponField`) e revalida no `create-payment`; consumo atômico via RPC `increment_coupon_usage`

### Funcionalidade não validada manualmente

- **Upload do PC** (`/api/admin-upload-url`): construído mas não testei E2E desde o último restart com `body: '{}'` fix. Usuário deve validar
- **Logout do admin com redirect**: implementado mas não testei manualmente
- **Sidebar sticky**: aplicado, mas em viewports altos pode ter quirk (overflow behavior do flex parent)

### Schema

- `email_subscribers` e `email_sent_log` existem — o workflow `.github/workflows/email-cron.yml` dispara `/api/cron-email-jobs` de hora em hora (depende dos secrets `APP_URL` e `CRON_SECRET` no GitHub; ver `13-ROADMAP-PENDENCIAS.md §2.5`)
- Cupom de reativação `VOLTEI15` ainda não foi criado no banco (referenciado pelo cron-email-jobs no template `reactivation_90d`; código configurável via env `REACTIVATION_COUPON_CODE`; hoje dá pra criar pela própria aba Cupons — ver `13-ROADMAP-PENDENCIAS.md §2.6`)
- O repo tem 13 migrations em `supabase/migrations/` (a mais recente: `20260703000000_perf_indexes.sql`; as fases 5–6 endurecem audit log, pagamentos e RLS) — confirmar que o projeto remoto está em dia (`npm run supabase:db:push`; ver `13-ROADMAP-PENDENCIAS.md §1`)

---

## 6. Como rodar

```powershell
# 1. Dev servers (Vite + Express)
npm run dev:all

# 2. URLs
# Frontend: http://localhost:5173/
# API:      http://localhost:3000/
# Login admin: http://localhost:5173/painel-acesso-privado-atelie
# Login cliente: http://localhost:5173/login
```

Cookie de sessão admin TTL = 8h. Se demorou pra voltar, refaz login.

### Testar upload de arquivo no admin

1. Login com `adminmarcia@gmail.com` (senha no gerenciador de segredos)
2. Sidebar → Produtos → Lista de produtos → Editar qualquer produto
3. Step "Mídia" → clica "Escolher" em qualquer slot
4. Seleciona arquivo do PC → barra de progresso → preview/nome aparece
5. Avança → Salvar

### Testar fluxo de compra do cliente

1. Logout
2. Login como qualquer um dos clientes fake (ex: `ana.lima@example.com`; senha no gerenciador de segredos)
3. Adicionar produto ao carrinho → checkout → testar cartão MP `4235 6477 2802 5682` (Visa teste BR) titular `APRO`
4. Polling do `verify-payment` roda a cada 4s (até ~10 min); aprovação de teste costuma aparecer em segundos
5. `/downloads` deve listar o arquivo com link funcional (signed URL)

---

## 7. Quick reference para o próximo chat

Se for continuar o trabalho:

- **PAT atual válido até rotação manual**: `sbp_REVOGADO_ROTACIONAR_NO_DASHBOARD` (USE COM ATENÇÃO — está vazado)
- **Project ref**: `npgtngcdskwcsmgymkql`
- **Manage API base**: `https://api.supabase.com/v1/projects/{ref}/database/query` (POST JSON `{query: "..."}`)
- **Storage API base**: `https://npgtngcdskwcsmgymkql.supabase.co/storage/v1/...`
- **Aplicar SQL via curl**:
  ```bash
  node -e "const fs=require('fs');const s=fs.readFileSync('arquivo.sql','utf8');fs.writeFileSync('.tmp.json',JSON.stringify({query:s}));"
  curl -sS -X POST "https://api.supabase.com/v1/projects/npgtngcdskwcsmgymkql/database/query" \
    -H "Authorization: Bearer sbp_REVOGADO_ROTACIONAR_NO_DASHBOARD" \
    -H "Content-Type: application/json" --data @.tmp.json
  ```
- **`SUPABASE_SERVICE_ROLE_KEY` no `.env.local`** já funciona para Storage e PostgREST (bypass RLS). Não precisa de PAT pra essas.

### Lembrar dos comportamentos:

- `profiles.role` é UPPERCASE (`CUSTOMER` | `ADMIN` | `MASTER`, default `CUSTOMER`); o login admin aceita `ADMIN`/`MASTER`
- `auth.users.instance_id` precisa ser `00000000-0000-0000-0000-000000000000` (todos automáticos via Admin API)
- Inserir em `profiles` sem auth.users dispara FK error — sempre criar via Admin API e deixar trigger `handle_new_user` lidar com o profile
- `categoryById.get()` no dashboard espera chaves como STRING (já tem `String(...)` wrapper)

---

## 8. Arquivos importantes pra ler antes de mexer

| Quero alterar…                      | Comece por…                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth do admin                       | `lib/admin-session.js`, `api/admin-login.js`, `src/services/admin-auth.js`                                                                        |
| Layout do admin                     | `src/components/admin/AdminLayout.jsx`, `src/pages/AdminPage.jsx`                                                                                 |
| Wizard de produto (upload de mídia) | `src/components/ProductWizard.jsx`, `api/admin-upload-url.js`, `src/services/admin-panel.js` (uploadProductAsset)                                 |
| Curva ABC                           | `lib/abc-classification.js`, `api/admin-abc-products.js`, `api/admin-abc-customers.js`, `src/components/admin/tabs/AnalysisTab.jsx`               |
| Storage / downloads                 | `lib/storage-signed-url.js`, `api/download.js`                                                                                                    |
| Cron de email                       | `api/cron-email-jobs.js`, `.github/workflows/email-cron.yml`                                                                                      |
| Cupons                              | `api/admin-coupons.js`, `api/validate-coupon.js`, `lib/coupons.js`, `src/components/admin/tabs/CouponsTab.jsx`, `src/components/CouponWizard.jsx` |
| Footer/Shell do cliente             | `src/components/Shell.jsx`                                                                                                                        |
| Categorias (validação)              | `api/admin-categories.js`, `src/components/CategoryWizard.jsx`                                                                                    |

---

## 9. Doc oficial do projeto

Existe em [docs/ProjectDocs/](docs/ProjectDocs/) — 13 documentos numerados + README. Comece por [README](docs/ProjectDocs/README.md). Boa parte das mudanças da sessão de 2026-05-30 **já foi incorporada** lá (upload de mídia, cupons, roadmap); use os ProjectDocs como fonte principal — este HANDOFF é o supplement histórico. Há também `docs/NextFeatures/PENDENCIAS.md` com pendências operacionais.
