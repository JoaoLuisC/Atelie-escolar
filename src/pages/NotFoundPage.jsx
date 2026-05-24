import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';

export function NotFoundPage() {
  return (
    <Shell>
      <SEO title="Página não encontrada" noindex />
      <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center lg:px-6">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">404</p>
        <h1 className="mt-2 font-display text-5xl font-extrabold text-slate-900 sm:text-6xl">Página não encontrada</h1>
        <p className="mt-3 max-w-md text-sm text-slate-600">
          O endereço que você acessou não existe ou foi movido.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <i className="bi bi-arrow-left" /> Voltar para a home
          </Link>
          <Link
            to="/produtos"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Ver produtos
          </Link>
        </div>
      </section>
    </Shell>
  );
}
