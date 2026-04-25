# Plano de melhoria do fluxo do cliente

Escopo: fluxo do cliente apenas. A área admin permanece fora deste plano.

## Direção geral

O objetivo não é apenas "deixar bonito". Para esta loja educacional, a UI precisa reduzir esforço cognitivo, transmitir credibilidade institucional e conduzir o usuário até a compra com o mínimo de fricção.

Prioridade sugerida:

1. `ProductsPage`: reduzir complexidade e poluição visual.
2. `CheckoutPage` e `DownloadsPage`: melhorar feedback assíncrono e confiança durante a espera.
3. `HomePage`: reforçar prova social e selos de segurança.
4. `Shell.jsx` e cards: corrigir legibilidade, densidade e acessibilidade.

## 1. Refatoração e redução de carga cognitiva

### O problema atual

`ProductsPage` concentra busca, filtro, ordenação, abertura da sidebar, interpretação de query string, contagem de resultados e renderização dos cards. Isso cria um arquivo difícil de manter e uma tela visualmente carregada.

### Estrutura de pastas recomendada

```text
src/
  features/
    catalog/
      components/
        CatalogHero.jsx
        CatalogToolbar.jsx
        CatalogSidebar.jsx
        CatalogGrid.jsx
        CatalogEmptyState.jsx
        ProductCard.jsx
      hooks/
        useCatalogFilters.js
        useCatalogProducts.js
      utils/
        catalog-filters.js
      pages/
        ProductsPage.jsx
```

### Estratégia prática

- Extrair a lógica de filtros para `useCatalogFilters`.
- Extrair o carregamento e a normalização de produtos para `useCatalogProducts`.
- Separar a UI em componentes pequenos e previsíveis.
- Reduzir a vitrine para uma grade mais limpa, com menos tags simultâneas por card.

### Snippet sugerido

```jsx
// src/features/catalog/hooks/useCatalogFilters.js
import { useMemo, useState } from 'react';

export function useCatalogFilters(initialSort = 'newest') {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activePreset, setActivePreset] = useState('');
  const [activePriceRange, setActivePriceRange] = useState('all');
  const [activeSort, setActiveSort] = useState(initialSort);

  const resetFilters = () => {
    setActiveCategory('all');
    setActivePreset('');
    setActivePriceRange('all');
    setActiveSort(initialSort);
  };

  return useMemo(() => ({
    activeCategory,
    activePreset,
    activePriceRange,
    activeSort,
    setActiveCategory,
    setActivePreset,
    setActivePriceRange,
    setActiveSort,
    resetFilters,
  }), [activeCategory, activePreset, activePriceRange, activeSort]);
}
```

### Layout de vitrine menos poluído

Para professores, a leitura precisa ser rápida. O card deve mostrar apenas o essencial:

- imagem;
- categoria;
- título;
- preço;
- um CTA primário.

Detalhes secundários, como selo e descrição longa, devem aparecer no hover ou em uma segunda linha compacta.

```jsx
// src/features/catalog/components/ProductCard.jsx
import { Link } from 'react-router-dom';
import { formatPrice } from '../../../utils/currency';

export function ProductCard({ product, onAddToCart, badge }) {
  return (
    <article className="product-card">
      <Link to={`/produtos/${product.id}`} className="product-card__media">
        {product.image ? <img src={product.image} alt={product.name} /> : <span>Sem imagem</span>}
        {badge ? <span className={`product-card__badge ${badge.cls}`}>{badge.label}</span> : null}
      </Link>

      <div className="product-card__body">
        <p className="product-card__category">{product.category || 'Material pedagógico'}</p>
        <h3 className="product-card__title">{product.name}</h3>
        <p className="product-card__meta">PDF editável · pronto para impressão</p>

        <div className="product-card__footer">
          <strong>{formatPrice(product.price)}</strong>
          <button type="button" onClick={() => onAddToCart(product)}>Adicionar</button>
        </div>
      </div>
    </article>
  );
}
```

## 2. Integração de design e marketing

### Home: prova social e trust badges

Na home, o ideal é tratar prova social como um bloco de credibilidade, não como decoração.

Recomendação de organização:

- topo: hero com promessa clara e CTA principal;
- logo abaixo: faixa de trust badges com 3 ou 4 selos curtos;
- depois: depoimentos com nomes, cargo e contexto;
- por fim: CTA de volta para o catálogo.

### Checkout: confiança antes do formulário

No checkout, a credibilidade precisa estar acima da dobra, antes dos campos.

- Uma faixa curta com "compra segura", "pagamento via plataforma reconhecida" e "download após aprovação".
- Um bloco lateral com resumo do pedido.
- Um pequeno texto de apoio para reduzir ansiedade: "Você verá a confirmação antes de sair da página".

### Estrutura de pastas recomendada

```text
src/
  features/
    marketing/
      components/
        TrustBadgeRow.jsx
        SocialProofStrip.jsx
        TestimonialCard.jsx
    checkout/
      components/
        CheckoutTrustPanel.jsx
        OrderSummaryCard.jsx
```

### Snippet de trust badges

```jsx
// src/features/marketing/components/TrustBadgeRow.jsx
export function TrustBadgeRow() {
  const badges = [
    'Pagamento seguro',
    'Acesso imediato após aprovação',
    'Arquivos em alta resolução',
    'Suporte por e-mail',
  ];

  return (
    <div className="trust-badge-row" aria-label="Selos de confiança">
      {badges.map((badge) => (
        <span key={badge} className="trust-badge-row__item">{badge}</span>
      ))}
    </div>
  );
}
```

### Snippet de prova social

```jsx
// src/features/marketing/components/SocialProofStrip.jsx
export function SocialProofStrip() {
  return (
    <section className="social-proof-strip" aria-labelledby="social-proof-title">
      <h2 id="social-proof-title">Professores já usam estes materiais no dia a dia</h2>
      <div className="social-proof-strip__grid">
        <article>
          <strong>4,2k</strong>
          <span>seguidores no Instagram</span>
        </article>
        <article>
          <strong>98%</strong>
          <span>aprovação dos clientes</span>
        </article>
        <article>
          <strong>5k+</strong>
          <span>pedidos concluídos</span>
        </article>
      </div>
    </section>
  );
}
```

### Estilo recomendado em CSS puro

```css
.trust-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.trust-badge-row__item {
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.875rem;
}
```

## 3. Feedback de interface e UX assíncrona

### O problema atual

O polling existe e funciona, mas o usuário fica em um estado visual pouco guiado enquanto o pagamento ainda não foi aprovado.

### Melhorias recomendadas

- Mostrar um stepper de progresso com 3 etapas: pagamento criado, aguardando confirmação, acesso liberado.
- Exibir skeletons no bloco de downloads enquanto a resposta ainda não chegou.
- Usar uma linguagem mais calma e previsível: "Estamos confirmando seu pagamento" em vez de mensagens secas de erro.

### Estrutura de pastas recomendada

```text
src/
  features/
    shared/
      components/
        AsyncStepper.jsx
        SkeletonCard.jsx
        SkeletonLine.jsx
```

### Snippet de stepper

```jsx
// src/features/shared/components/AsyncStepper.jsx
export function AsyncStepper({ step }) {
  const steps = [
    { id: 1, label: 'Pedido criado' },
    { id: 2, label: 'Pagamento em análise' },
    { id: 3, label: 'Downloads liberados' },
  ];

  return (
    <ol className="async-stepper" aria-label="Progresso do pagamento">
      {steps.map((item) => (
        <li key={item.id} className={item.id <= step ? 'is-active' : ''}>
          <span>{item.id}</span>
          <strong>{item.label}</strong>
        </li>
      ))}
    </ol>
  );
}
```

### Snippet de skeleton

```jsx
// src/features/shared/components/SkeletonCard.jsx
export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton--image" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--line short" />
    </div>
  );
}
```

### Uso no Checkout

```jsx
{processing ? (
  <div>
    <AsyncStepper step={2} />
    <SkeletonCard />
    <p>Estamos confirmando o pagamento. Você pode fechar a aba do checkout e voltar depois.</p>
  </div>
) : null}
```

## 4. Acessibilidade e clareza

### Ajustes práticos para Shell.jsx

- Aumentar área de clique do menu e do botão de carrinho.
- Melhorar contraste de estados ativos e hover.
- Garantir que o botão de sair tenha aparência de ação secundária, não de link.
- Em telas pequenas, reduzir densidade de menu e priorizar CTA principal.

### Ajustes práticos para cards de produto

- Título com no máximo 2 linhas.
- CTA com altura mínima confortável.
- Texto secundário menor, mas ainda legível.
- Espaço suficiente entre imagem, título, preço e botão.

### Estrutura de pastas recomendada

```text
src/
  components/
    Shell.jsx
  features/
    catalog/
      components/
        ProductCard.jsx
  styles/
    accessibility.css
```

### Snippet de melhorias no Shell

```jsx
<nav className="navbar navbar-transparent" id="mainNav" aria-label="Navegação principal">
  <div className="container shell-nav">
    <Link to="/" className="brand-owl" aria-label="Ir para a página inicial">
      ...
    </Link>
    <ul className="navbar-menu shell-nav__menu">
      ...
    </ul>
  </div>
</nav>
```

### Snippet de card acessível

```jsx
<article className="product-card" aria-labelledby={`product-${product.id}-title`}>
  <h3 id={`product-${product.id}-title`} className="product-card__title">
    {product.name}
  </h3>
  <button type="button" className="product-card__cta">
    Adicionar ao carrinho
  </button>
</article>
```

### CSS base recomendado

```css
.product-card__cta,
.shell-nav__menu a,
.shell-nav__menu button {
  min-height: 44px;
}

.product-card__title {
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

## Ordem de implementação sugerida

1. Extrair `useCatalogFilters`, `CatalogToolbar` e `ProductCard`.
2. Inserir `TrustBadgeRow` na Home e `CheckoutTrustPanel` no checkout.
3. Adicionar `AsyncStepper` e `SkeletonCard` ao fluxo de pagamento e downloads.
4. Ajustar `Shell.jsx` e os cards para acessibilidade e legibilidade.

## Critério de sucesso

- Menos código por página.
- Menos decisões visuais por tela.
- Mais clareza de status durante o pagamento.
- Mais credibilidade percebida antes do checkout.
- Melhor usabilidade para professores de diferentes faixas etárias.