import { HelmetProvider } from 'react-helmet-async';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// src/test/setupTests.js troca o SEO por um stub em todas as suítes; aqui o
// assunto É o SEO, então entra o módulo de verdade.
const { SEO } = await vi.importActual('../SEO');

// ════════════════════════════════════════════════════════════════════
// LOJA-24 — SEO técnico.
//   • O JSON-LD da home ficava no <head> depois de navegar para outra página:
//     agora ele é renderizado no CORPO, junto da página que o declara.
//   • og:image padrão era /favicon.svg, que as redes sociais recusam.
// ════════════════════════════════════════════════════════════════════

function renderSeo(props) {
  return render(
    <HelmetProvider>
      <SEO title="Teste" {...props} />
    </HelmetProvider>,
  );
}

describe('SEO', () => {
  it('JSON-LD nasce e morre com a página, e "<" não fecha a tag', () => {
    const { container, unmount } = renderSeo({
      jsonLd: { '@type': 'Product', description: 'cuidado </script><b>x</b>' },
    });

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(script.innerHTML).not.toContain('</script>');
    expect(JSON.parse(script.textContent).description).toBe('cuidado </script><b>x</b>');

    unmount();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it('sem imagem própria, não declara og:image (nada de SVG)', async () => {
    renderSeo({});
    // O Helmet aplica as tags no <head> de forma assíncrona.
    await waitFor(() => expect(document.title).toBe('Teste · Ateliê da Escola'));
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.head.querySelector('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary',
    );
  });
});
