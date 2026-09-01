import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { ConsentPreferences } from '../components/ConsentPreferences';
import { CONSENT_POLICY_VERSION } from '../utils/consent';
import { ROUTES } from '../constants/routes';

function LegalLayout({ title, description, pathname, children }) {
  return (
    <Shell>
      <SEO title={title} description={description} pathname={pathname} />
      <article className="mx-auto max-w-3xl px-4 py-10 lg:px-6">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
            Documentos legais
          </p>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-xs text-slate-500">Versão vigente: {CONSENT_POLICY_VERSION}</p>
        </header>
        <section className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-700">
          {children}
        </section>
        <nav className="mt-10 flex flex-wrap gap-2 text-xs">
          <Link
            to={ROUTES.privacidade}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Política de Privacidade
          </Link>
          <Link
            to={ROUTES.termos}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Termos de Uso
          </Link>
          <Link
            to={ROUTES.home}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Voltar para a home
          </Link>
        </nav>
      </article>
    </Shell>
  );
}

LegalLayout.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  pathname: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      description="Como tratamos seus dados pessoais no Ateliê da Escola, em conformidade com a LGPD."
      pathname="/privacidade"
    >
      <h2>1. Quem somos</h2>
      <p>
        O Ateliê da Escola é uma loja online de materiais educativos digitais operada pela Profa.
        Marciar Cardoso. O contato para questões de privacidade é{' '}
        <a href="mailto:contato@profamarciarcardoso.com.br">contato@profamarciarcardoso.com.br</a>.
      </p>

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Cadastro e compra:</strong> nome, e-mail e (opcionalmente) telefone/CPF informados
          no checkout.
        </li>
        <li>
          <strong>Pagamento:</strong> os dados do cartão são tratados{' '}
          <em>diretamente pelo Mercado Pago</em> — não armazenamos número de cartão, CVV ou
          validade.
        </li>
        <li>
          <strong>Uso do site:</strong> páginas visitadas, eventos de navegação e identificador
          anônimo de sessão. Esses dados são associados ao seu IP e User-Agent apenas para
          diagnóstico e segurança.
        </li>
        <li>
          <strong>Cookies de marketing (opcionais):</strong> Google Analytics e Meta Pixel só são
          carregados depois que você aceita explicitamente no banner.
        </li>
      </ul>

      <ConsentPreferences />

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Processar pedidos, liberar downloads e enviar e-mail de confirmação.</li>
        <li>Cumprir obrigações fiscais e legais (notas, impostos, prevenção a fraude).</li>
        <li>
          Melhorar o site com base em métricas agregadas — sem rastrear individualmente quem você é.
        </li>
        <li>
          Atender pedidos da LGPD: acesso, correção, exclusão, portabilidade e revogação de
          consentimento.
        </li>
      </ul>

      <h2>4. Bases legais (LGPD art. 7º)</h2>
      <ul>
        <li>
          <strong>Execução de contrato</strong> para tudo que envolve cumprir o pedido.
        </li>
        <li>
          <strong>Cumprimento de obrigação legal</strong> para retenção fiscal (5 anos).
        </li>
        <li>
          <strong>Legítimo interesse</strong> para logs de segurança e prevenção a fraude.
        </li>
        <li>
          <strong>Consentimento</strong> para cookies de marketing (Google/Meta) — revogável a
          qualquer momento no bloco <a href="#cookies">Suas preferências de cookies</a>, acima nesta
          página. A revogação vale a partir do clique e recarrega a página para tirar do ar os
          scripts que já estavam carregados.
        </li>
      </ul>

      <h2>5. Com quem compartilhamos</h2>
      <ul>
        <li>
          <strong>Mercado Pago</strong> — processamento de pagamento.
        </li>
        <li>
          <strong>Supabase</strong> — banco de dados e autenticação (servidores nos EUA).
        </li>
        <li>
          <strong>Resend</strong> — envio de e-mails transacionais.
        </li>
        <li>
          <strong>Google Analytics / Meta</strong> — somente com consentimento ativo.
        </li>
      </ul>
      <p>
        Não vendemos seus dados. Nenhum desses parceiros recebe a sua senha — ela é armazenada
        criptografada (hash) pelo Supabase Auth.
      </p>

      <h2>6. Retenção</h2>
      <ul>
        <li>Dados de pedido: 5 anos (obrigação fiscal).</li>
        <li>Logs de download (IP + User-Agent): 12 meses.</li>
        <li>Eventos de analytics: 24 meses, depois agregados.</li>
        <li>Conta de cliente: até pedido de exclusão.</li>
      </ul>

      <h2>7. Seus direitos</h2>
      <p>
        Pela LGPD, você pode pedir confirmação de tratamento, acesso aos dados, correção,
        anonimização, portabilidade, eliminação e informação sobre compartilhamentos. Escreva para{' '}
        <a href="mailto:contato@profamarciarcardoso.com.br">contato@profamarciarcardoso.com.br</a> e
        respondemos em até 15 dias úteis.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Usamos HTTPS em todo o tráfego, cookies HttpOnly + SameSite para sessão, validação de
        assinatura HMAC em webhooks de pagamento e Row-Level Security no banco. Detalhes técnicos
        estão documentados internamente e revisamos o controle trimestralmente.
      </p>

      <h2>9. Crianças e adolescentes</h2>
      <p>
        O site não é direcionado a menores de 18 anos. Se você é responsável e identificou cadastro
        indevido de menor sob sua tutela, escreva para o contato acima para excluirmos.
      </p>

      <h2>10. Alterações</h2>
      <p>
        Mudanças nesta política sobem com nova versão e o banner pede sua aceitação novamente. A
        versão vigente aparece no topo desta página.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout
      title="Termos de Uso"
      description="Termos e condições de uso do Ateliê da Escola — compra e download de materiais educativos digitais."
      pathname="/termos"
    >
      <h2>1. Sobre estes termos</h2>
      <p>
        Ao usar o Ateliê da Escola você aceita estes Termos e a{' '}
        <Link to={ROUTES.privacidade}>Política de Privacidade</Link>. Se discordar de qualquer
        ponto, por favor não use o site.
      </p>

      <h2>2. Produtos</h2>
      <p>
        Vendemos arquivos digitais (PDF, imagens, kits) para uso pessoal e em sala de aula. Os
        produtos têm descrição, preço e amostras na página do produto.
      </p>

      <h2>3. Pedido e pagamento</h2>
      <ul>
        <li>
          O preço é confirmado pelo servidor no momento do checkout (ignoramos valores manipulados
          no cliente).
        </li>
        <li>Pagamento via Mercado Pago — cartão, Pix ou boleto.</li>
        <li>Após aprovação, liberamos automaticamente um link de download por item.</li>
        <li>
          Cada link expira em <strong>72 horas</strong> e é de uso único. Se precisar baixar de
          novo, acesse <Link to={ROUTES.downloads}>/downloads</Link>.
        </li>
      </ul>

      <h2>4. Licença de uso</h2>
      <p>
        Compra dá direito a uso pessoal e educacional dos arquivos. É <strong>vedado</strong>:
      </p>
      <ul>
        <li>Revender, redistribuir, ou compartilhar o arquivo (gratuito ou pago).</li>
        <li>Modificar e republicar como próprio.</li>
        <li>Usar para campanhas comerciais sem licença adicional (consulte por e-mail).</li>
      </ul>

      <h2>5. Reembolso</h2>
      <p>
        Por se tratar de produto digital com entrega imediata, o direito de arrependimento do CDC
        (art. 49) é exercido <strong>antes</strong> da geração do link de download. Após o link ser
        emitido, o reembolso é avaliado caso a caso por e-mail.
      </p>

      <h2>6. Conta de cliente</h2>
      <p>
        Você é responsável pelas credenciais da sua conta. Use senhas únicas e habilite a
        recuperação por e-mail. Reset de senha em <Link to={ROUTES.login}>/login</Link>.
      </p>

      <h2>7. Uso indevido</h2>
      <p>
        Tentativas de burlar pagamento, baixar arquivos sem direito, automatizar acessos ou enumerar
        pedidos resultam em bloqueio e podem ser reportadas às autoridades.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        Fazemos esforço razoável para manter o site no ar e os arquivos disponíveis, mas não
        garantimos disponibilidade ininterrupta. Em caso de indisponibilidade prolongada,
        reenviaremos os arquivos pelo e-mail do pedido.
      </p>

      <h2>9. Foro</h2>
      <p>
        Estes termos seguem a legislação brasileira. Eventuais disputas são resolvidas no foro do
        domicílio do consumidor.
      </p>

      <h2>10. Contato</h2>
      <p>
        Dúvidas ou pedidos:{' '}
        <a href="mailto:contato@profamarciarcardoso.com.br">contato@profamarciarcardoso.com.br</a>.
      </p>
    </LegalLayout>
  );
}
