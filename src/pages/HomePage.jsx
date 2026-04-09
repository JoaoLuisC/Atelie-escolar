import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Shell } from '../components/Shell';

export function HomePage() {
  const [visibleTestimonials, setVisibleTestimonials] = useState(false);

  useEffect(() => {
    setVisibleTestimonials(true);
  }, []);

  return (
    <Shell>
      {/* HERO SECTION */}
      <section className="hero-animated">
        <div className="hero-bg-gradient" />
        <div className="hero-blob hero-blob-1" />
        <div className="hero-blob hero-blob-2" />
        <div className="hero-blob hero-blob-3" />
        <div className="hero-blob hero-blob-4" />
        <div className="hero-grid" />

        <div className="hero-school-icons" aria-hidden="true">
          <span className="school-icon school-icon-1">✏️</span>
          <span className="school-icon school-icon-2">📚</span>
          <span className="school-icon school-icon-3">🎨</span>
          <span className="school-icon school-icon-4">⭐</span>
          <span className="school-icon school-icon-5">📐</span>
          <span className="school-icon school-icon-6">🖍️</span>
          <span className="school-icon school-icon-7">📏</span>
          <span className="school-icon school-icon-8">🔢</span>
          <span className="school-icon school-icon-9">🌈</span>
          <span className="school-icon school-icon-10">🎒</span>
        </div>

        <div className="container hero-content">
          <div className="row align-items-center" style={{ minHeight: '50vh', padding: '55px 0 60px' }}>
            <div className="col-lg-8">
              <h1 className="hero-title">
                Painéis e recursos pedagógicos<br />
                feitos com <span className="highlight-royal">cuidado</span><br />
                e <span className="highlight-emerald">criatividade</span>
              </h1>
              <div className="hero-cta-group">
                <Link to="/produtos" className="btn-hero-primary">
                  Ver Produtos <i className="bi bi-arrow-right" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE 1 */}
      <div className="marquee-strip" aria-hidden="true">
        <div className="marquee-track">
          <span className="marquee-item">BANNERS</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">PAINÉIS</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">ATIVIDADES</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">LEMBRANCINHAS</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">KITS</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">BANNERS</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">PAINÉIS</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">ATIVIDADES</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">LEMBRANCINHAS</span>
          <span className="marquee-item marquee-sep">✦</span>
          <span className="marquee-item">KITS</span>
          <span className="marquee-item marquee-sep">✦</span>
        </div>
      </div>

      {/* CATÁLOGO EM DESTAQUE */}
      <section className="products-preview-section">
        <div className="container">
          <div className="row justify-content-between align-items-end mb-5">
            <div className="col-lg-6">
              <p className="section-label">Catálogo</p>
              <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', margin: 0 }}>
                É exatamente isso que<br />você precisa 👇
              </h2>
            </div>
            <div className="col-lg-4 text-lg-end">
              <Link to="/produtos" className="btn-hero-primary" style={{ padding: '12px 28px', fontSize: '.9rem' }}>
                Ver catálogo completo <i className="bi bi-arrow-right" />
              </Link>
            </div>
          </div>

          <div id="home-sections-wrap">
            <div style={{ marginBottom: '60px' }}>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '24px', fontWeight: 600 }}>Vitrines em Destaque</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{
                    padding: '24px',
                    borderRadius: '14px',
                    border: '1px solid rgba(155, 93, 229, 0.1)',
                    backgroundColor: '#f9f9f9',
                    minHeight: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.28s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 18px 34px rgba(122, 61, 192, 0.16)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>
                      {['🎨', '📚', '🎉', '✨'][i - 1]}
                    </div>
                    <strong>{['Festival de Cores', 'Aprendizado Prático', 'Festas Escolares', 'Designs Exclusivos'][i - 1]}</strong>
                    <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '8px' }}>Explore nossa coleção</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="how-section-v2">
        <div className="container">
          <div className="row justify-content-center mb-5">
            <div className="col-lg-6 text-center">
              <p className="section-label">Simples assim</p>
              <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)' }}>
                Do clique à impressão<br /><span style={{ color: 'var(--primary)' }}>em minutos</span>
              </h2>
              <p style={{ color: '#999', marginTop: '12px' }}>Sem cadastro obrigatório. Sem espera. Sem complicação.</p>
            </div>
          </div>

          <div className="how-v2-track">
            <div className="how-v2-step">
              <div className="how-v2-ghost" aria-hidden="true">01</div>
              <div className="how-v2-icon-orb"><i className="bi bi-search" /></div>
              <div className="how-v2-body">
                <h5>Escolha</h5>
                <p>Navegue pelo catálogo e encontre atividades práticas para tornar o aprendizado dos seus alunos mais prazeroso.</p>
              </div>
            </div>
            <div className="how-v2-connector" aria-hidden="true"><span /></div>
            <div className="how-v2-step">
              <div className="how-v2-ghost" aria-hidden="true">02</div>
              <div className="how-v2-icon-orb how-v2-orb-2"><i className="bi bi-credit-card-fill" /></div>
              <div className="how-v2-body">
                <h5>Pague</h5>
                <p>Finalize seu pedido com segurança e confirmação rápida.</p>
              </div>
            </div>
            <div className="how-v2-connector" aria-hidden="true"><span /></div>
            <div className="how-v2-step">
              <div className="how-v2-ghost" aria-hidden="true">03</div>
              <div className="how-v2-icon-orb how-v2-orb-3"><i className="bi bi-cloud-arrow-down-fill" /></div>
              <div className="how-v2-body">
                <h5>Baixe na hora</h5>
                <p>Acesso liberado imediatamente após a aprovação do pagamento.</p>
              </div>
            </div>
            <div className="how-v2-connector" aria-hidden="true"><span /></div>
            <div className="how-v2-step">
              <div className="how-v2-ghost" aria-hidden="true">04</div>
              <div className="how-v2-icon-orb how-v2-orb-4"><i className="bi bi-printer-fill" /></div>
              <div className="how-v2-body">
                <h5>Imprima</h5>
                <p>Os arquivos estão prontos para uso no formato PDF com acesso ilimitado e permanente.</p>
              </div>
            </div>
          </div>

          <div className="row justify-content-center mt-5">
            <div className="col-lg-8">
              <div className="how-v2-formats">
                <div className="how-v2-formats-icon"><i className="bi bi-info-circle-fill" /></div>
                <div>
                  <strong>PDF em alta resolução</strong><br />
                  <span>Arquivos prontos para impressão, com acesso ilimitado e permanente.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF SECTION */}
      <section className="social-proof-section">
        <div className="sp-blob sp-blob-left" aria-hidden="true" />
        <div className="sp-blob sp-blob-right" aria-hidden="true" />

        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <div className="row justify-content-center mb-4">
            <div className="col-lg-7 text-center">
              <p className="section-label">Como a escola usa</p>
              <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)' }}>
                Mais de <span style={{ color: 'var(--primary)' }}>16.000 professoras</span><br />nos seguem nas redes 📲
              </h2>
              <p style={{ color: '#999', marginTop: '12px' }}>Veja como escolas de todo o Brasil estão usando nossos materiais.</p>
            </div>
          </div>

          {/* STATS STRIP */}
          <div className="sp-stats-strip">
            <div className="sp-stat">
              <span className="sp-stat-num">4,2k</span>
              <span className="sp-stat-lbl"><i className="bi bi-instagram" style={{ color: '#ee2a7b' }} /> seguidores</span>
            </div>
            <div className="sp-stat-divider" />
            <div className="sp-stat">
              <span className="sp-stat-num">48k</span>
              <span className="sp-stat-lbl"><i className="bi bi-tiktok" /> curtidas</span>
            </div>
            <div className="sp-stat-divider" />
            <div className="sp-stat">
              <span className="sp-stat-num">98%</span>
              <span className="sp-stat-lbl"><i className="bi bi-star-fill" style={{ color: '#FEE440' }} /> aprovação</span>
            </div>
            <div className="sp-stat-divider" />
            <div className="sp-stat">
              <span className="sp-stat-num">5k+</span>
              <span className="sp-stat-lbl"><i className="bi bi-bag-check-fill" style={{ color: 'var(--accent)' }} /> pedidos</span>
            </div>
          </div>

          {/* TESTIMONIALS */}
          <div className={`sp-testimonials-row ${visibleTestimonials ? 'visible' : ''}`}>
            <div className="sp-testimonial">
              <div className="sp-t-avatar" style={{ background: 'linear-gradient(135deg, #9B5DE5, #F15BB5)' }}>C</div>
              <div className="sp-t-body">
                <p>"Comprei, baixei e mandei para a gráfica em menos de 5 minutos! 😍"</p>
                <span>Carla M. · Professora, SP</span>
              </div>
            </div>
            <div className="sp-testimonial">
              <div className="sp-t-avatar" style={{ background: 'linear-gradient(135deg, #00BBF9, #00F5D4)' }}>A</div>
              <div className="sp-t-body">
                <p>"Os banners de formatura ficaram lindos. Todos elogiaram o design!"</p>
                <span>Ana R. · Diretora, MG</span>
              </div>
            </div>
            <div className="sp-testimonial">
              <div className="sp-t-avatar" style={{ background: 'linear-gradient(135deg, #FEE440, #F15BB5)' }}>J</div>
              <div className="sp-t-body">
                <p>"Recebi os arquivos na hora e consegui organizar tudo sem complicação!"</p>
                <span>Juliana F. · Coord. Pedagógica, RJ</span>
              </div>
            </div>
          </div>

          {/* CTA SOCIAL */}
          <div className="row justify-content-center mt-4">
            <div className="col-auto">
              <a href="https://www.instagram.com/profamarciarcardoso" target="_blank" rel="noopener noreferrer" className="sp-social-btn sp-btn-ig">
                <i className="bi bi-instagram" /> @profamarciarcardoso no Insta
              </a>
              <a href="https://www.tiktok.com/@profamarciarcardoso" target="_blank" rel="noopener noreferrer" className="sp-social-btn sp-btn-tt">
                <i className="bi bi-tiktok" /> @profamarciarcardoso no TikTok
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE 2 - DARK */}
      <div className="marquee-strip marquee-strip-dark" aria-hidden="true">
        <div className="marquee-track marquee-track-reverse">
          <span className="marquee-item">ALTA RESOLUÇÃO</span>
          <span className="marquee-item marquee-sep">·</span>
          <span className="marquee-item">PRONTO PARA IMPRESSÃO</span>
          <span className="marquee-item marquee-sep">·</span>
          <span className="marquee-item">PDF EM ALTA RESOLUÇÃO</span>
          <span className="marquee-item marquee-sep">·</span>
          <span className="marquee-item">DESIGN EXCLUSIVO</span>
          <span className="marquee-item marquee-sep">·</span>
          <span className="marquee-item">DOWNLOAD SEGURO</span>
          <span className="marquee-item marquee-sep">·</span>
          <span className="marquee-item">CRIADO COM CUIDADO</span>
          <span className="marquee-item marquee-sep">·</span>
        </div>
      </div>
    </Shell>
  );
}
