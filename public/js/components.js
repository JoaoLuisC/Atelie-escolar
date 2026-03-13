/**
 * COMPONENTS.JS — Carrega navbar e footer de arquivos HTML externos
 * Injeta nas páginas e define o link ativo com base na URL atual.
 */
(function () {
  'use strict';

  /**
   * Faz fetch de um arquivo HTML parcial e substitui o placeholder pelo conteúdo.
   * @param {string} placeholderId - ID do elemento placeholder
   * @param {string} url - Caminho para o arquivo HTML do componente
   * @returns {Promise<void>}
   */
  async function loadComponent(placeholderId, url) {
    const placeholder = document.getElementById(placeholderId);
    if (!placeholder) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const html = await response.text();
      placeholder.outerHTML = html;
    } catch (err) {
      console.error('[components.js] Erro ao carregar ' + url + ':', err);
      // Remove o placeholder silenciosamente em caso de erro
      placeholder.remove();
    }
  }

  /**
   * Adiciona a classe nav-active ao link que corresponde à página atual.
   * Usa o atributo data-page nos links da navbar.
   */
  function setActiveNavLink() {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link-item[data-page]').forEach(function (link) {
      const page = link.getAttribute('data-page');
      const isActive =
        (page === '/' && (path === '/' || path === '/index.html')) ||
        (page !== '/' && path === page);
      if (isActive) {
        link.classList.add('nav-active');
      } else {
        link.classList.remove('nav-active');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    // Carrega navbar e footer em paralelo
    await Promise.all([
      loadComponent('navbar-placeholder', '/components/navbar.html'),
      loadComponent('footer-placeholder', '/components/footer.html'),
    ]);

    // Define o link ativo da navbar
    setActiveNavLink();

    // Inicializa auth state na navbar
    if (!document.getElementById('_navbar-auth-script')) {
      const s = document.createElement('script');
      s.id   = '_navbar-auth-script';
      s.type = 'module';
      s.src  = '/js/navbar-auth.js';
      document.body.appendChild(s);
    }

    // Atualiza o contador do carrinho (definido em cart.js)
    if (typeof updateCartCount === 'function') {
      updateCartCount();
    }

    // Dispara evento para que outros scripts saibam que os componentes estão prontos
    document.dispatchEvent(new CustomEvent('components:loaded'));
  });
})();
