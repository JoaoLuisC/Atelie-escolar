import PropTypes from 'prop-types';

const DEFAULT_STATS = [
  { num: '4,2k', icon: 'instagram', iconColor: 'text-pink-600', label: 'seguidores' },
  { num: '48k', icon: 'tiktok', iconColor: 'text-slate-900', label: 'curtidas' },
  { num: '98%', icon: 'star-fill', iconColor: 'text-accent-yellow', label: 'aprovação' },
  { num: '5k+', icon: 'bag-check-fill', iconColor: 'text-accent-sky', label: 'pedidos' },
];

function Stat({ num, icon, iconColor, label }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">{num}</span>
      <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <i className={`bi bi-${icon} ${iconColor}`} aria-hidden="true" /> {label}
      </span>
    </div>
  );
}

Stat.propTypes = {
  num: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  iconColor: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
};

export function SocialProofStrip({ stats = DEFAULT_STATS, className = '' }) {
  return (
    <div
      aria-label="Indicadores de prova social"
      className={`grid grid-cols-2 gap-4 sm:grid-cols-4 ${className}`}
    >
      {stats.map((stat) => (
        <Stat
          key={stat.label}
          num={stat.num}
          icon={stat.icon}
          iconColor={stat.iconColor}
          label={stat.label}
        />
      ))}
    </div>
  );
}

SocialProofStrip.propTypes = {
  stats: PropTypes.arrayOf(
    PropTypes.shape({
      num: PropTypes.string.isRequired,
      icon: PropTypes.string.isRequired,
      iconColor: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ),
  className: PropTypes.string,
};
