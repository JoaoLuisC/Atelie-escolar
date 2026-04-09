import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { fetchProductById } from '../services/products';
import { formatPrice } from '../utils/currency';

export function ProductDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { pushToast } = useToast();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadProduct() {
      try {
        setLoading(true);
        setError('');

        const data = await fetchProductById(id);
        if (!data) {
          throw new Error('Produto nao encontrado na API.');
        }

        if (isMounted) {
          setProduct(data);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadProduct();

    return () => {
      isMounted = false;
    };
  }, [id]);

  function onBuyNow() {
    if (!product) return;

    const result = addToCart(product);
    pushToast(result.message, result.ok ? 'success' : 'warning');
    navigate('/checkout');
  }

  return (
    <Shell>
      <section className="page-section">
        <p className="eyebrow">Detalhes</p>
        <h1>Detalhes do Produto</h1>
        <p>Visual alinhado com o legado, mantendo a nova base React.</p>
      </section>

      {loading ? (
        <section className="card info-card detail-wrap">
          <h3>Carregando produto</h3>
          <p>Buscando as informacoes do item selecionado.</p>
        </section>
      ) : null}

      {error ? (
        <section className="card info-card error-card detail-wrap">
          <h3>Nao foi possivel carregar o produto</h3>
          <p>{error}</p>
          <Link to="/produtos" className="button secondary small">
            Voltar para catalogo
          </Link>
        </section>
      ) : null}

      {!loading && !error && product ? (
        <section className="detail-wrap products-preview-section">
          <div className="container">
          <article className="detail-card legacy-detail-layout">
            <div className="detail-media">
              {product.image ? <img src={product.image} alt={product.name} /> : <span>Sem imagem</span>}
            </div>

            <div className="detail-content">
              <span className="product-badge">{product.category || 'Sem categoria'}</span>
              <h2>{product.name}</h2>
              <p>{product.description || 'Sem descricao disponivel.'}</p>

              <div className="detail-meta">
                <div>
                  <small>Preco</small>
                  <strong>{formatPrice(product.price)}</strong>
                </div>
                <div>
                  <small>Tipo</small>
                  <strong>{product.productType || 'individual'}</strong>
                </div>
              </div>

              <div className="hero-actions">
                <button type="button" className="button primary" onClick={onBuyNow}>
                  Comprar agora
                </button>
                <Link to="/produtos" className="button secondary">
                  Voltar para catalogo
                </Link>
              </div>
            </div>
          </article>
          </div>
        </section>
      ) : null}
    </Shell>
  );
}
