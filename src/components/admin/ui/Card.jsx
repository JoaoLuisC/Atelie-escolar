import PropTypes from 'prop-types';
import { InfoHint } from './InfoHint';

export function Card({ title, subtitle, action, help, children, className = '' }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      {title || action ? (
        <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-900 sm:text-lg">
                {title}
                {typeof title === 'string' ? <InfoHint title={title} text={help} /> : null}
              </h2>
            ) : null}
            {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

Card.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  action: PropTypes.node,
  help: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
};
