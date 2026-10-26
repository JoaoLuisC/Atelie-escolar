import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { Shell } from '../components/Shell';
import { ConsentPreferences } from '../components/ConsentPreferences';
import { CONSENT_POLICY_VERSION } from '../utils/consent';
import { ROUTES } from '../constants/routes';
import { SELLER } from '../constants/seller';

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

function SellerBlock() {
  return (
    <ul>
      <li>
        <strong>Razão social:</strong> {SELLER.name} (microempreendedor individual)
      </li>
      <li>
        <strong>CNPJ:</strong> {SELLER.cnpj}
      </li>
      <li>
        <strong>Endereço:</strong> {SELLER.city}, CEP {SELLER.cep}
      </li>
      <li>
        <strong>E-mail:</strong> <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
      </li>
    </ul>
  );
}

function ContactLink() {
  return <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>;
}

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      description="Como o Ateliê da Escola trata seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD)."
      pathname="/privacidade"
    >
      <p>
        Esta política explica quais dados pessoais o Ateliê da Escola coleta, para que os usa, com
        quem os compartilha, por quanto tempo os guarda e como você exerce seus direitos, nos termos
        da Lei nº 13.709/2018 (LGPD).
      </p>

      <h2>1. Quem é o responsável pelos seus dados</h2>
      <p>O controlador dos dados pessoais tratados neste site é:</p>
      <SellerBlock />
      <p>
        Para qualquer assunto de privacidade, inclusive o exercício dos seus direitos, o canal de
        atendimento é o e-mail <ContactLink />.
      </p>

      <h2>2. Quais dados coletamos</h2>
      <ul>
        <li>
          <strong>Na compra:</strong> nome e e-mail (obrigatórios) e, se você informar, CPF e
          telefone; os produtos do pedido, valores, cupom usado e a situação do pagamento.
        </li>
        <li>
          <strong>Na conta de cliente:</strong> e-mail e senha (guardada apenas como resumo
          criptográfico — nós não temos acesso à senha). Se você entrar com o Google, recebemos o
          seu nome e e-mail da conta Google. Depois da primeira compra aprovada, criamos uma conta
          com o e-mail do pedido e enviamos um link para você definir a senha.
        </li>
        <li>
          <strong>No pagamento:</strong> os dados do cartão, do Pix ou do boleto são informados
          diretamente no Mercado Pago. Não recebemos nem guardamos número de cartão, código de
          segurança ou senha bancária — só o identificador e a situação do pagamento.
        </li>
        <li>
          <strong>Na entrega:</strong> ao baixar um arquivo, registramos data, endereço IP e o tipo
          de navegador, para prevenir fraude e resolver disputas.
        </li>
        <li>
          <strong>Carrinho salvo:</strong> se você digitar o e-mail no checkout e não concluir a
          compra, guardamos o e-mail e os itens do carrinho para lembrar você da compra (veja a
          seção 4).
        </li>
        <li>
          <strong>Newsletter:</strong> e-mail e a confirmação da inscrição, apenas se você se
          inscrever e confirmar pelo link enviado.
        </li>
        <li>
          <strong>Navegação:</strong> páginas e produtos vistos e ações como adicionar ao carrinho,
          ligados a um identificador de sessão anônimo, e a origem da visita (por exemplo, o link de
          uma campanha), guardada no seu navegador por até 30 dias.
        </li>
        <li>
          <strong>Segurança:</strong> tentativas de acesso e eventos suspeitos, com endereço IP,
          tipo de navegador e uma versão embaralhada (não reversível) do e-mail envolvido.
        </li>
      </ul>

      <h2 id="cookies-e-armazenamento">3. Cookies e armazenamento no navegador</h2>
      <ul>
        <li>
          <strong>Essenciais (sempre ativos):</strong> o cookie da sua sessão de cliente, protegido
          contra acesso por scripts e válido por 8 horas, e informações guardadas no seu navegador
          para o site funcionar: o carrinho, a sua escolha sobre cookies e a origem da visita.
        </li>
        <li>
          <strong>Métricas de visita sem cookies:</strong> usamos o Vercel Web Analytics, que conta
          visitas de forma agregada, sem cookies e sem identificar você.
        </li>
        <li>
          <strong>Marketing (opcionais):</strong> Google Analytics e Meta Pixel só são carregados
          depois que você aceita no aviso de cookies. Você pode mudar de ideia a qualquer momento no
          bloco abaixo.
        </li>
      </ul>

      <ConsentPreferences />

      <h2>4. Para que usamos e com qual base legal</h2>
      <ul>
        <li>
          <strong>Processar o pedido, liberar os downloads, criar e manter sua conta</strong> —
          execução de contrato (LGPD, art. 7º, V).
        </li>
        <li>
          <strong>Cumprir obrigações fiscais e legais</strong> e guardar o histórico de vendas —
          cumprimento de obrigação legal (art. 7º, II).
        </li>
        <li>
          <strong>
            Prevenir fraude, proteger contas e o site, e defender direitos em disputas
          </strong>{' '}
          — legítimo interesse e exercício regular de direitos (art. 7º, VI e IX).
        </li>
        <li>
          <strong>E-mails depois da compra</strong> (pedido de avaliação, sugestões relacionadas e
          novidades) — legítimo interesse, para quem já é cliente. Todo e-mail desse tipo tem um
          link para deixar de recebê-los.
        </li>
        <li>
          <strong>Lembrete de carrinho abandonado</strong> — enviado só para quem confirmou a
          inscrição na newsletter ou já comprou conosco, com link para deixar de receber.
        </li>
        <li>
          <strong>Newsletter e cookies de marketing</strong> — consentimento (art. 7º, I), que pode
          ser revogado a qualquer momento.
        </li>
        <li>
          <strong>Melhorar o site</strong> com base em métricas de navegação agregadas — legítimo
          interesse, sem identificar você individualmente.
        </li>
      </ul>
      <p>Não vendemos seus dados pessoais e não os usamos para decisões automatizadas.</p>

      <h2>5. Com quem compartilhamos</h2>
      <p>
        Usamos empresas que prestam serviços para o funcionamento da loja (operadores de dados).
        Elas tratam os dados apenas para executar o serviço contratado:
      </p>
      <ul>
        <li>
          <strong>Mercado Pago</strong> — processamento dos pagamentos.
        </li>
        <li>
          <strong>Supabase</strong> — banco de dados, contas e armazenamento dos arquivos. Os dados
          ficam em servidores em São Paulo (Brasil).
        </li>
        <li>
          <strong>Vercel</strong> — hospedagem do site e métricas de visita sem cookies.
        </li>
        <li>
          <strong>Resend</strong> — envio dos e-mails da loja.
        </li>
        <li>
          <strong>Google</strong> — login com conta Google (se você escolher) e Google Analytics
          (somente com o seu consentimento).
        </li>
        <li>
          <strong>Meta</strong> — Meta Pixel (somente com o seu consentimento).
        </li>
      </ul>
      <p>
        Também podemos fornecer dados quando exigido por lei ou por ordem de autoridade competente.
      </p>

      <h2>6. Transferência internacional</h2>
      <p>
        Vercel, Resend, Google e Meta processam dados em servidores fora do Brasil, principalmente
        nos Estados Unidos. Essas transferências são feitas para executar o serviço e seguem as
        garantias contratuais de proteção de dados oferecidas por esses fornecedores, conforme o
        art. 33 da LGPD.
      </p>

      <h2>7. Por quanto tempo guardamos</h2>
      <ul>
        <li>
          <strong>Pedidos e dados de compra:</strong> enquanto forem necessários para cumprir
          obrigações fiscais e para defesa em eventuais disputas — no mínimo pelo prazo da
          legislação fiscal (5 anos). Se você excluir sua conta, os dados pessoais desses pedidos
          são anonimizados.
        </li>
        <li>
          <strong>Conta de cliente:</strong> até você pedir a exclusão.
        </li>
        <li>
          <strong>Registros de download:</strong> 12 meses.
        </li>
        <li>
          <strong>Registros de segurança:</strong> 6 meses.
        </li>
        <li>
          <strong>Eventos de navegação:</strong> 180 dias.
        </li>
        <li>
          <strong>Carrinhos não concluídos:</strong> 90 dias.
        </li>
        <li>
          <strong>Histórico de e-mails enviados:</strong> 90 dias.
        </li>
        <li>
          <strong>Newsletter:</strong> enquanto você estiver inscrito. Inscrições não confirmadas
          são apagadas depois de 30 dias, e descadastros depois de 90 dias.
        </li>
      </ul>
      <p>
        Os prazos de registros, eventos, carrinhos, e-mails e newsletter são aplicados
        automaticamente pelo sistema.
      </p>

      <h2>8. Seus direitos</h2>
      <p>
        A LGPD (art. 18) garante a você: confirmação de que tratamos seus dados, acesso, correção,
        anonimização ou eliminação de dados desnecessários, portabilidade, eliminação dos dados
        tratados com consentimento, informação sobre compartilhamentos, informação sobre a
        possibilidade de não consentir e revogação do consentimento.
      </p>
      <p>Três deles você exerce sozinho, na hora:</p>
      <ul>
        <li>
          <strong>Acesso e portabilidade:</strong> o botão <em>Baixar meus dados</em> na{' '}
          <Link to={ROUTES.conta}>sua conta</Link> gera um arquivo com seus pedidos, inscrição na
          newsletter e carrinhos salvos.
        </li>
        <li>
          <strong>Exclusão da conta:</strong> o botão <em>Excluir minha conta</em>, na mesma página.
          Por segurança, a exclusão é confirmada por um link enviado ao seu e-mail.
        </li>
        <li>
          <strong>Revogação do consentimento de cookies:</strong> o bloco{' '}
          <a href="#cookies">Suas preferências de cookies</a>, acima nesta página.
        </li>
      </ul>
      <p>
        Para os demais pedidos, escreva para <ContactLink />. Respondemos em até 15 dias. Você
        também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>9. Segurança</h2>
      <p>
        Todo o tráfego usa conexão criptografada (HTTPS). As sessões ficam em cookies protegidos
        contra acesso por scripts, as senhas são guardadas apenas como resumo criptográfico, os
        links de download são de uso único e expiram, e o acesso administrativo exige verificação em
        duas etapas quando ativada. Nenhum sistema é totalmente imune a incidentes; se ocorrer um
        incidente de segurança que possa causar risco ou dano relevante, comunicaremos os titulares
        afetados e a ANPD, como manda a lei.
      </p>

      <h2>10. Crianças e adolescentes</h2>
      <p>
        A loja é destinada a maiores de 18 anos e não coleta intencionalmente dados de crianças ou
        adolescentes. Se você é responsável e identificou um cadastro indevido de menor sob sua
        guarda, escreva para <ContactLink /> para excluirmos.
      </p>

      <h2>11. Alterações desta política</h2>
      <p>
        Quando esta política mudar, a nova versão é publicada nesta página com a data no topo, e o
        aviso de cookies pede sua escolha novamente.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout
      title="Termos de Uso"
      description="Termos e condições para comprar e usar os materiais educativos digitais do Ateliê da Escola."
      pathname="/termos"
    >
      <h2>1. Quem vende</h2>
      <p>O Ateliê da Escola é operado por:</p>
      <SellerBlock />
      <p>
        Ao usar o site ou comprar, você concorda com estes Termos e com a{' '}
        <Link to={ROUTES.privacidade}>Política de Privacidade</Link>. Se não concordar, não use o
        site.
      </p>

      <h2>2. O que vendemos</h2>
      <p>
        Vendemos materiais educativos <strong>digitais</strong> — painéis, banners, atividades e
        kits em PDF ou imagem. <strong>Não há envio de produto físico:</strong> você baixa os
        arquivos e imprime por conta própria. As cores impressas podem variar conforme a impressora
        e o papel. Cada produto traz descrição, formato e imagens de exemplo na sua página.
      </p>

      <h2>3. Conta de cliente</h2>
      <ul>
        <li>
          Você pode comprar sem criar conta. Depois da primeira compra aprovada, criamos uma conta
          com o e-mail do pedido e enviamos um link para você definir a senha.
        </li>
        <li>Também é possível entrar com a conta Google.</li>
        <li>
          Você é responsável por manter sua senha em sigilo e pelas ações feitas com a sua conta.
          Avise-nos se suspeitar de uso indevido.
        </li>
        <li>
          Você deve informar dados verdadeiros, especialmente o e-mail, pois é por ele que a compra
          fica vinculada a você.
        </li>
      </ul>

      <h2>4. Preços, cupons e pagamento</h2>
      <ul>
        <li>
          Os preços estão em reais (R$) e são os vigentes no momento da compra. O valor final é
          sempre conferido pelo nosso sistema no checkout.
        </li>
        <li>
          O pagamento é feito pelo Mercado Pago, por cartão de crédito, Pix ou boleto, conforme as
          opções disponíveis no momento da compra.
        </li>
        <li>
          Cupons de desconto têm regras próprias (validade, valor mínimo, produtos participantes e
          limite de usos), não são cumulativos e só valem quando aceitos no checkout. Um cupom usado
          num pedido não pago fica reservado por até 2 horas.
        </li>
      </ul>

      <h2>5. Entrega dos arquivos</h2>
      <ul>
        <li>
          Assim que o Mercado Pago aprova o pagamento, os links de download são liberados na página
          de <Link to={ROUTES.downloads}>downloads</Link> — com a sua conta conectada, todos os seus
          pedidos aparecem lá. Cartão e Pix costumam ser aprovados na hora; o boleto pode levar até
          3 dias úteis para compensar.
        </li>
        <li>
          Cada link é de <strong>uso único</strong> e vale por <strong>72 horas</strong>. Se
          precisar baixar de novo, um novo link pode ser gerado na página de downloads, até 5 vezes
          por produto comprado.
        </li>
        <li>
          Se tiver qualquer problema para baixar, escreva para <ContactLink /> com o número do
          pedido.
        </li>
      </ul>

      <h2>6. Licença de uso</h2>
      <p>
        Os materiais são protegidos pela Lei de Direitos Autorais (Lei nº 9.610/1998). A compra dá a
        você uma licença <strong>pessoal, não exclusiva e intransferível</strong> para usar os
        arquivos na sua atividade educacional: você pode imprimir quantas cópias precisar para seus
        alunos, sua turma ou sua escola.
      </p>
      <p>
        É <strong>proibido</strong>:
      </p>
      <ul>
        <li>
          Compartilhar, repassar ou disponibilizar os arquivos para outras pessoas, inclusive em
          grupos de WhatsApp, redes sociais, nuvens públicas ou sites, de forma gratuita ou paga.
        </li>
        <li>Revender os arquivos ou impressões deles.</li>
        <li>Alterar os materiais e apresentá-los como de sua autoria.</li>
        <li>Usar os materiais em produtos ou campanhas comerciais sem autorização por escrito.</li>
      </ul>
      <p>O descumprimento pode levar ao bloqueio da conta e às medidas legais cabíveis.</p>

      <h2>7. Direito de arrependimento e reembolso</h2>
      <ul>
        <li>
          Pelo Código de Defesa do Consumidor (art. 49), você pode desistir da compra em até{' '}
          <strong>7 dias</strong> contados da data do pagamento. Basta escrever para <ContactLink />{' '}
          com o número do pedido.
        </li>
        <li>
          O reembolso é feito pelo Mercado Pago, no mesmo meio de pagamento usado na compra. Com o
          reembolso, a licença de uso do item é encerrada: os arquivos baixados não podem mais ser
          usados e devem ser apagados.
        </li>
        <li>
          Se o arquivo vier com defeito, incompleto ou diferente do anunciado, corrigimos,
          substituímos ou devolvemos o valor, à sua escolha.
        </li>
      </ul>

      <h2>8. Uso indevido do site</h2>
      <p>
        É proibido tentar burlar o pagamento, baixar arquivos sem ter comprado, automatizar acessos,
        tentar descobrir pedidos de outras pessoas ou atacar a segurança do site. Essas condutas
        levam ao bloqueio e podem ser comunicadas às autoridades.
      </p>

      <h2>9. Disponibilidade e responsabilidade</h2>
      <p>
        Fazemos o possível para manter o site no ar e os arquivos disponíveis, mas pode haver
        interrupções por manutenção ou por falhas de serviços de terceiros (internet, hospedagem,
        meio de pagamento). Se você não conseguir baixar um produto comprado por um problema nosso,
        enviaremos os arquivos por outro meio. Não respondemos pelo uso que você fizer dos materiais
        nem pela qualidade da impressão.
      </p>

      <h2>10. Propriedade do site</h2>
      <p>
        A marca, os textos, as imagens, o layout e os materiais do Ateliê da Escola pertencem ao
        responsável pela loja ou a seus autores, e não podem ser copiados sem autorização.
      </p>

      <h2>11. Atendimento</h2>
      <p>
        Dúvidas, pedidos de cancelamento ou reclamações: <ContactLink />. Respondemos em até 5 dias
        úteis.
      </p>

      <h2>12. Alterações destes Termos</h2>
      <p>
        Estes Termos podem ser atualizados. A versão vigente fica sempre nesta página, com a data no
        topo. As compras já feitas seguem os Termos vigentes na data da compra.
      </p>

      <h2>13. Lei aplicável e foro</h2>
      <p>
        Estes Termos seguem a legislação brasileira. Eventuais conflitos podem ser resolvidos no
        foro do domicílio do consumidor.
      </p>
    </LegalLayout>
  );
}
