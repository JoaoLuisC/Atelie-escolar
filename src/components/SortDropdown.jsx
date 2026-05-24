import PropTypes from 'prop-types';

export function SortDropdown({ value, onChange }) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Ordenar produtos</span>
      <select
        value={value}
        onChange={onChange}
        aria-label="Ordenar produtos"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <option value="sold-desc">Mais vendidos</option>
        <option value="newest">Mais recentes</option>
        <option value="price-asc">Menor preço</option>
        <option value="price-desc">Maior preço</option>
        <option value="name">Nome A-Z</option>
      </select>
    </label>
  );
}

SortDropdown.propTypes = {
  onChange: PropTypes.func.isRequired,
  value: PropTypes.string.isRequired,
};
