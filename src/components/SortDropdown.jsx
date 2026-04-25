import PropTypes from 'prop-types';

export function SortDropdown({ value, onChange }) {
  return (
    <label className="sort-dropdown-wrap">
      <span className="sr-only">Ordenar produtos</span>
      <select className="sort-select-inline sort-dropdown" value={value} onChange={onChange} aria-label="Ordenar produtos">
        <option value="sold-desc">Mais vendidos</option>
        <option value="newest">Mais recentes</option>
        <option value="price-asc">Menor preco</option>
        <option value="price-desc">Maior preco</option>
        <option value="name">Nome A-Z</option>
      </select>
    </label>
  );
}

SortDropdown.propTypes = {
  onChange: PropTypes.func.isRequired,
  value: PropTypes.string.isRequired,
};