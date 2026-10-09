# 03 — Multi-tenant

## Por que não multi-repo

"Um repositório por cliente white label" é a armadilha clássica: com 10 clientes são 10 cópias do
código, e cada correção (como as 8 da validação de 05/10) é aplicada 10 vezes, em 10 deploys. Em
meses cada cópia está numa versão.

O modelo é **multi-tenant**:

- **Um backend, um banco, um frontend** servindo todos. Cada dado importante carrega um `store_id`.
- **O site descobre a loja pelo domínio** acessado:
  `ateliedaescola.com.br` → marketplace; `professoramarcia.ateliedaescola.com.br` → loja dela;
  `www.lojadocliente.com.br` → cliente white label.
- **White label é configuração, não código:** logo, cores, vitrine, textos, domínio e conta de
  pagamento ficam no banco, por loja. A vitrine configurável do painel já é isso — só que global.
- **Um repositório só.** Se um cliente quiser algo sob medida, vira tema/módulo no mesmo repo.

## O que o código de hoje não tem

- Produtos, categorias, cupons, pedidos e vitrine não pertencem a nenhuma loja.
- O painel admin enxerga tudo; não há painel por loja nem painel da plataforma.
- Pagamento com **um** token do provedor em variável de ambiente.
- O papel "Vendedor" existe na tela de usuários, mas não dá acesso a nada.
- Nome, logo e redes da Profa. Márcia escritos à mão no `Shell.jsx`; cores fixas no
  `tailwind.config.js`.

O que **já serve:** conta de cliente única, downloads e tokens, reconciliação de pagamento num
módulo só, auditoria de admin, RLS.

## O que criar

### Banco

- `stores` — slug, nome, dono, status, tipo (`marketplace` | `white_label`), % de comissão,
  `theme` (logo, cores, textos, redes).
- `store_domains` — endereços da loja (subdomínio e domínio próprio), verificado ou não.
- `store_members` — quem administra cada loja (dono, equipe). Permissão de loja sai de
  `profiles.role`; o papel global "Vendedor" deixa de ser necessário.
- `store_payment_accounts` — conta do professor no provedor (no Asaas: subconta + `walletId`;
  se for Mercado Pago, tokens OAuth). **Credenciais criptografadas.**
- `store_id` obrigatório e indexado em: produtos, categorias, cupons, pedidos, vitrine/settings,
  carrinhos abandonados, analytics, auditoria. Pedido ganha comissão e líquido do professor.
- Unicidade **por loja**: slug de produto, código de cupom, nome de categoria.
- Migração: criar a loja nº 1 (Profa. Márcia) e preencher o `store_id` de tudo que existe.

### Backend

- **Middleware de tenant:** domínio → loja. O domínio da plataforma não tem loja e lista todas as
  ativas.
- **Helper de consulta que força o filtro de loja** — o maior risco da mudança é uma query
  esquecida vazar pedidos de um professor para outro. Teste de regressão no estilo de
  `handlers/__tests__/query-authz-regression.test.js`.
- **Duas sessões de painel:** professor (carrega a loja) e plataforma.
- **Pagamento por loja:** cobrança com split (comissão + parte de cada professor do carrinho);
  webhook e `verify-payment` acham pedido → lojas → conta certa.
- **Cadastro de professor no provedor:** criar subconta (Asaas) ou conectar conta (OAuth).
- **E-mail e SEO por loja:** e-mail sai do domínio da plataforma com o nome da loja e resposta
  para o professor; sitemap/robots/metas por host.

### Frontend

- **Tema dinâmico:** cores da marca viram variáveis CSS lidas da loja; nome, logo e redes do
  `Shell.jsx` vêm da loja.
- **Páginas do marketplace:** home da plataforma, página do professor, produto mostrando quem vende.
- **Carrinho misto** com o subtotal por professor.
- **Painel da loja** (o de hoje, restrito) e **painel da plataforma** (lojas, aprovação de
  professores, comissões, faturamento geral).
- **Cadastro de professor:** conta → loja → conta de recebimento → publicar.

### Infra

- Subdomínio coringa `*.ateliedaescola.com.br` na Vercel (exige o DNS na Vercel). Domínios
  próprios de clientes adicionados pela API da Vercel.
- Storage organizado por `store_id/`.
- Resend com o domínio da plataforma.

## Ordem de construção

Cada etapa entra sem quebrar a loja no ar:

1. `stores` + `store_id` em tudo + migração da loja da Márcia. **Nada muda para quem usa.**
2. Middleware de tenant + helper com filtro obrigatório + painel do professor restrito.
3. Provedor de split (após a decisão de [02](./02-SPLIT-DE-PAGAMENTOS.md)) + comissão.
4. Tema dinâmico + domínios/subdomínios. **Aqui o white label funciona.**
5. Marketplace (home, página do professor, carrinho misto) + cadastro de professor + painel da
   plataforma.
