import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  createAdminProduct,
  deleteAdminProduct,
  fetchAdminProducts,
  updateAdminProduct,
} from '../../services/admin-products';
import { fetchAdminCategories } from '../../services/admin-panel';
import { formatPrice } from '../../utils/currency';
import { useToast } from '../../hooks/useToast';

export function AdminProductsManager({ onAuthExpired }) {
  const { pushToast } = useToast();
  const [status, setStatus] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    image: '',
    downloadUrl: '',
    category: '',
    active: true,
    featured: false,
  });

  function resetForm() {
    setEditingId('');
    setForm({
      name: '',
      description: '',
      price: '',
      image: '',
      downloadUrl: '',
      category: '',
      active: true,
      featured: false,
    });
  }

  async function loadAdminProducts() {
    setLoading(true);
    setStatus('Carregando produtos...');

    try {
      const [list, categoriesData] = await Promise.all([fetchAdminProducts(), fetchAdminCategories()]);
      setProducts(list);
      setCategories(categoriesData.categories || []);
      setStatus(`${list.length} produto(s) carregado(s).`);
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sessao admin') && onAuthExpired) {
        onAuthExpired();
      }
      setStatus(error.message || 'Erro ao carregar produtos do admin.');
      pushToast(error.message || 'Erro ao carregar produtos.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitForm(event) {
    event.preventDefault();

    if (!form.name.trim() || Number(form.price) <= 0) {
      setStatus('Informe nome e preco valido para salvar.');
      return;
    }

    const payload = {
      id: editingId || undefined,
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      image: form.image.trim(),
      downloadUrl: form.downloadUrl.trim(),
      category: form.category.trim() || 'Sem categoria',
      active: form.active,
      featured: form.featured,
    };

    try {
      setStatus(editingId ? 'Atualizando produto...' : 'Criando produto...');

      if (editingId) {
        await updateAdminProduct(payload);
        pushToast('Produto atualizado.', 'success');
      } else {
        await createAdminProduct(payload);
        pushToast('Produto criado.', 'success');
      }

      resetForm();
      await loadAdminProducts();
      setStatus('Produto salvo com sucesso.');
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sessao admin') && onAuthExpired) {
        onAuthExpired();
      }
      setStatus(error.message || 'Erro ao salvar produto.');
      pushToast(error.message || 'Erro ao salvar produto.', 'error');
    }
  }

  async function removeProduct(id) {
    try {
      setStatus('Removendo produto...');
      await deleteAdminProduct(id);
      if (editingId === String(id)) {
        resetForm();
      }
      await loadAdminProducts();
      setStatus('Produto removido com sucesso.');
      pushToast('Produto removido.', 'success');
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('sessao admin') && onAuthExpired) {
        onAuthExpired();
      }
      setStatus(error.message || 'Erro ao remover produto.');
      pushToast(error.message || 'Erro ao remover produto.', 'error');
    }
  }

  function startEdit(product) {
    setEditingId(String(product.id));
    setForm({
      name: product.name || '',
      description: product.description || '',
      price: String(product.price || ''),
      image: product.image || '',
      downloadUrl: product.downloadUrl || '',
      category: product.category || '',
      active: product.active !== false,
      featured: product.featured === true,
    });
    setStatus(`Editando produto ${product.name}.`);
  }

  return (
    <section className="admin-wrap">
      <article className="card admin-form-card">
        <div className="admin-head">
          <h3>{editingId ? 'Editar produto' : 'Novo produto'}</h3>
          <button type="button" className="button secondary small" onClick={loadAdminProducts} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar lista'}
          </button>
        </div>

        <form className="admin-form" onSubmit={submitForm}>
          <label htmlFor="admin-name">Nome</label>
          <input
            id="admin-name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />

          <label htmlFor="admin-description">Descricao</label>
          <textarea
            id="admin-description"
            rows="4"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />

          <div className="admin-form-grid">
            <div>
              <label htmlFor="admin-price">Preco</label>
              <input
                id="admin-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              />
            </div>

            <div>
              <label htmlFor="admin-category">Categoria</label>
              <input
                id="admin-category"
                list="admin-category-list"
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              />
              <datalist id="admin-category-list">
                {categories.map((category) => (
                  <option key={category.id} value={category.name} />
                ))}
              </datalist>
            </div>
          </div>

          <p className="admin-status">
            Dica: use categorias existentes para os produtos aparecerem corretamente na vitrine horizontal da home.
          </p>

          <label htmlFor="admin-image">URL da imagem</label>
          <input
            id="admin-image"
            value={form.image}
            onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.value }))}
          />

          <label htmlFor="admin-download">URL de download</label>
          <input
            id="admin-download"
            value={form.downloadUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, downloadUrl: event.target.value }))}
          />

          <div className="admin-flags">
            <label>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
              />
              <span>Ativo</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => setForm((prev) => ({ ...prev, featured: event.target.checked }))}
              />
              <span>Destaque</span>
            </label>
          </div>

          <div className="admin-actions">
            <button type="submit" className="button primary small">
              {editingId ? 'Salvar alteracoes' : 'Criar produto'}
            </button>
            <button type="button" className="button secondary small" onClick={resetForm}>
              Limpar
            </button>
          </div>
        </form>

        {status ? <p className="admin-status">{status}</p> : null}
      </article>

      <article className="card admin-list-card">
        <h3>Produtos cadastrados</h3>

        {products.length === 0 ? <p className="empty-text">Nenhum produto disponivel.</p> : null}

        <div className="admin-products-list">
          {products.map((product) => (
            <article className="admin-product-item" key={product.id}>
              <div>
                <strong>{product.name}</strong>
                <p>
                  {formatPrice(product.price)} | {product.category || 'Sem categoria'} |{' '}
                  {product.active === false ? 'Inativo' : 'Ativo'}
                </p>
              </div>
              <div className="admin-item-actions">
                <button type="button" className="button secondary small" onClick={() => startEdit(product)}>
                  Editar
                </button>
                <button type="button" className="button secondary small" onClick={() => removeProduct(product.id)}>
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}

AdminProductsManager.propTypes = {
  onAuthExpired: PropTypes.func,
};
