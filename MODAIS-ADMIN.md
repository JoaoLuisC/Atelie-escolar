# Modais do Painel Administrativo — Documentação

## Visão Geral

O painel admin (`public/admin.html` + `public/js/admin.js`) usa um sistema de modais
em overlay para todas as ações de criação, edição e confirmação. Os modais são HTML
puro estilizados via `public/css/admin.css`, sem biblioteca externa.

---

## Estrutura Base de Todos os Modais

```html
<div id="nome-modal" class="modal">
  <div class="modal-content modal-[tamanho]">
    <div class="modal-header">
      <h2>Título</h2>
      <button class="modal-close">&times;</button>
    </div>
    <!-- conteúdo interior -->
  </div>
</div>
```

### Como abrir / fechar

- **Abrir:** `element.classList.add('show')`
- **Fechar:** `element.classList.remove('show')`
- Por padrão o backdrop (área escura fora do card) **não** fecha o modal —
  apenas o botão × e os botões de cancelar fecham.

### CSS base

| Classe            | Comportamento                                                  |
|-------------------|----------------------------------------------------------------|
| `.modal`          | `display:none`, fixo 100vw × 100vh, fundo `rgba(0,0,0,0.6)` |
| `.modal.show`     | `display:flex`, centraliza o card com flexbox                 |
| `.modal-content`  | card branco, `border-radius:12px`, `max-height:90vh`, scroll  |
| `.modal-small`    | `max-width: 450px`                                            |
| `.modal-medium`   | `max-width: 600px`                                            |
| (padrão)          | `max-width: 700px`                                            |
| `.modal-large`    | `max-width: 940px` (usado em produto e preview)               |
| `.modal-header`   | flex row, padding 24px, separado do corpo por borda inferior  |

---

## Modal de Produto (`#product-modal`)

**Tamanho:** `modal-large` (max-width 940px)  
**Form id:** `product-form`  
**Título dinâmico:** `#modal-title` — muda entre "Adicionar Produto", "Adicionar KIT" e "Editar Produto"

### Como é aberto

| Situação                  | Função chamada           | Comportamento                          |
|---------------------------|--------------------------|----------------------------------------|
| Botão "+ Adicionar Produto" (tabela) | `btnAddProduct.click()` | Abre com tipo fixo = Individual, campos em branco |
| Botão "Adicionar KIT" (tabela) | `window.openAddKitModal()` | Abre com tipo fixo = KIT, seção de produtos do kit visível |
| Botão "Editar" na tabela   | `window.editProduct(id)` | Preenche todos os campos com dados do produto |

### Campos do Formulário (em ordem)

1. **Nome do Produto** — `input[text]`, obrigatório
2. **Preço (R$)** — `input[number]`, obrigatório
3. **Descrição** — `textarea`, obrigatório
4. **Categoria** — `select` populado dinamicamente com as categorias cadastradas
5. **Tipo de Produto** — **badge visual somente leitura** (não selecionável pelo usuário)
   - Verde "📄 Individual" → `input[hidden]` envia `productType=individual`
   - Roxo "📦 KIT" → `input[hidden]` envia `productType=kit`
   - O tipo é bloqueado no momento de abertura do modal e não pode ser alterado
6. **Preço Original** *(oculto, aparece só para KIT)* — `input[number]`, exibe "de R$..." riscado na loja
7. **Imagens** — lista dinâmica de `input[url]`; botão "+ Adicionar Imagem" inclui novas linhas;
   a primeira imagem tem required; cada linha tem botão ❌ para remover
8. **Vídeos** *(opcional)* — mesma estrutura das imagens, mas sem required
9. **URL do Download** — `input[url]`, obrigatório; link para o Google Drive ou similar
10. **Tamanhos de Painel** *(opcional)* — seção sempre visível; cada linha tem:
    Etiqueta, Dimensões, Nº de folhas A4; botão "+ Adicionar Tamanho de Painel"
11. **Produtos do Kit** *(oculto, aparece só para KIT)* — picker com:
    - Filtro de categoria (select populado dinamicamente)
    - Campo de busca por nome
    - Lista com checkboxes de todos os produtos da loja (ativos e inativos)
    - Estado dos checks é mantido mesmo ao filtrar/pesquisar
    - Produtos inativos aparecem semi-transparentes com badge "inativo"
    - Produtos do tipo KIT aparecem com badge roxo "KIT"

### Lógica de Tipo Bloqueado

```
Adicionar Produto → setProductTypeBadge('individual') → badge verde
Adicionar KIT    → setProductTypeBadge('kit')         → badge roxo + abre picker
Editar produto   → setProductTypeBadge(product.productType) → badge correspondente
```

### Salvar

- Envia `productData` via Firestore `addDoc` (novo) ou `updateDoc` (edição)
- Novos produtos sempre entram com `active: true` (campo não mais editável no form)
- `kitItems` salvo como array de `{ id, name, price }` referenciando produtos reais
- `panelSizes` salvo como array de `{ label, dimensions, sheets }`
- Campos removidos (não mais salvos): `tags`, `pageSize`, `paperType`

---

## Modal de Categoria (`#category-modal`)

**Tamanho:** `modal-medium` (max-width 600px)  
**Form id:** `category-form`  
**Título dinâmico:** `#cat-modal-title` — "Adicionar Categoria" ou "Editar Categoria"

### Campos

| Campo             | Tipo            | Descrição                                      |
|-------------------|-----------------|------------------------------------------------|
| Nome              | `input[text]`   | Obrigatório; usado como identificador na loja  |
| Cor de destaque   | `input[color]`  | Cor do badge da categoria; padrão `#9B5DE5`    |
| Ordem             | `input[number]` | Menor número = aparece primeiro                |
| Badge de destaque | `input[text]`   | Texto opcional: "MAIS VENDIDO", "LANÇAMENTO"…  |
| Evidenciar        | `checkbox`      | Se marcado, categoria aparece em destaque no topo |

### Abrir / Fechar

- Botão "+ Nova Categoria" na tab Categorias → abre em modo criação
- Botão "Editar" em categoria existente → preenche campos e abre em modo edição
- Botões "Cancelar" (`#btn-cancel-cat`) e × (`#cat-modal-close`) fecham sem salvar

---

## Modal de Exclusão (`#delete-modal`)

**Tamanho:** `modal-small` (max-width 450px)  
**Propósito:** confirmação antes de deletar produto ou categoria

### Fluxo

1. `window.confirmDelete(type, id, name)` é chamado
2. Exibe o nome do item em `#delete-item-name`
3. Guarda `type` e `id` em variáveis de escopo do módulo
4. Botão "Excluir" (`#btn-confirm-delete`) executa o delete no Firestore
5. Botão "Cancelar" e × fecham sem ação

---

## Modal de Detalhes do Pedido (`#order-detail-modal`)

**Tamanho:** `modal-large`  
**Propósito:** exibe todos os dados de um pedido: comprador, itens, pagamento, rastreio

O conteúdo é injetado dinamicamente em `#order-detail-body` pela função
`window.showOrderDetail(orderId)`.

---

## Modal de Visualização de Produto (`#prod-preview-modal`)

**Tamanho:** inline style `max-width:940px`  
**Propósito:** preview de como o produto aparece na loja, sem sair do admin

A função `window.previewProduct(id)` monta o HTML do preview em `#prod-preview-body`,
que simula o layout da página de produto da loja (galeria + info + preço PIX + parcelas).

---

## Resumo de IDs e Responsabilidades

| ID                     | Tipo     | Responsável por                               |
|------------------------|----------|-----------------------------------------------|
| `#product-modal`       | modal    | Criar e editar produtos / kits                |
| `#category-modal`      | modal    | Criar e editar categorias                     |
| `#delete-modal`        | modal    | Confirmar exclusão de produto ou categoria    |
| `#order-detail-modal`  | modal    | Ver detalhes completos de um pedido           |
| `#prod-preview-modal`  | modal    | Pré-visualização do produto como na loja      |
| `#product-type-badge`  | elemento | Badge visual bloqueado que indica o tipo      |
| `#kit-product-picker`  | elemento | Lista de checkboxes dos subprodutos do kit    |
| `#kit-cat-filter`      | elemento | Dropdown para filtrar picker por categoria    |
| `#kit-search`          | elemento | Input para buscar produto por nome no picker  |
| `#kit-items-section`   | elemento | Container da seção KIT (oculto para Individual)|
| `#original-price-group`| elemento | Campo de preço original (oculto para Individual)|
| `#panel-sizes-container`| elemento| Container das linhas de tamanho de painel     |
