import { Shell } from '../components/Shell';

export function NotFoundPage() {
  return (
    <Shell>
      <section className="page-section">
        <p className="eyebrow">404</p>
        <h1>Pagina nao encontrada</h1>
        <p>Essa rota ainda nao faz parte da nova base React.</p>
      </section>
    </Shell>
  );
}
