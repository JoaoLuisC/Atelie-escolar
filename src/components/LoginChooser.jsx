import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

// ════════════════════════════════════════════════════════════════════
// "Sou cliente | Sou professor(a)" — o topo das duas telas de login.
//
// São duas telas e dois logins diferentes por baixo: o cliente entra pelo
// Supabase Auth (`/login`, com Google), o professor e a administração pela
// sessão de staff (`/admin`: Google só para professor(a); a administração
// usa senha + 2º fator). O seletor só leva de uma à outra;
// não muda nada da autenticação. Quem é professor cai em `/professores` e
// quem administra a loja, no painel — quem decide é o papel da conta.
// ════════════════════════════════════════════════════════════════════

const OPTIONS = [
  // Classes por extenso (e não montadas) para o subset de ícones achá-las.
  {
    id: 'cliente',
    label: 'Sou cliente',
    to: ROUTES.login,
    icon: 'bi bi-person',
    iconOn: 'bi bi-person-fill',
  },
  {
    id: 'professor',
    label: 'Sou professor(a)',
    to: ROUTES.admin,
    icon: 'bi bi-mortarboard',
    iconOn: 'bi bi-mortarboard-fill',
  },
];

export function LoginChooser({ active }) {
  return (
    <nav
      aria-label="Tipo de acesso"
      className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
    >
      {OPTIONS.map((option) => {
        const selected = option.id === active;
        return (
          <Link
            key={option.id}
            to={option.to}
            aria-current={selected ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <i className={selected ? option.iconOn : option.icon} aria-hidden="true" />
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

LoginChooser.propTypes = {
  active: PropTypes.oneOf(['cliente', 'professor']).isRequired,
};
