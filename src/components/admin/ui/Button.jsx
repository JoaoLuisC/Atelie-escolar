import PropTypes from 'prop-types';

const VARIANTS = {
  primary: 'bg-violet-600 text-white shadow-sm hover:bg-violet-700 focus-visible:outline-violet-600 disabled:bg-violet-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 focus-visible:outline-slate-400 disabled:text-slate-400',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-300 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:outline-rose-600 disabled:bg-rose-300',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-emerald-600 disabled:bg-emerald-300',
};

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-4 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconAfter,
  children,
  className = '',
  type = 'button',
  ...rest
}) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`;

  return (
    <button type={type} className={classes} {...rest}>
      {icon ? <i className={`bi bi-${icon}`} /> : null}
      {children}
      {iconAfter ? <i className={`bi bi-${iconAfter}`} /> : null}
    </button>
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary', 'ghost', 'danger', 'success']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  icon: PropTypes.string,
  iconAfter: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
  type: PropTypes.string,
};
