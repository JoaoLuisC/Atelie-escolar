# Prompt mestre — evolução da loja e do painel do professor

Implemente no projeto da loja, preservando autenticação, autorização, LGPD, integridade de pagamentos e compatibilidade móvel:

1. Página inicial e página de produtos
   - aumentar em 35% as imagens da vitrine;
   - recomendar 1200×1200 px para cards da home e 1200×900 px para a página de produto (proporção 4:3, imagem inteira);
   - enviar arquivos de imagem e vídeo ao Supabase Storage, sem campo de URL manual para vídeo;
   - permitir editar título e altura da navbar, logo à esquerda/direita do texto, ícones e tamanho do banner, textos, alinhamentos, cores, cor predominante, degradê e animação de entrada;
   - oferecer editor recolhido por padrão e alternância clara entre edição e pré-visualização expandida;
   - permitir editar conteúdo e seções do footer;
   - simplificar os módulos do painel do professor;
   - permitir configurar ordem, alinhamento e tamanho dos textos na página de produto;
   - exibir a foto correta do produto no carrinho.

2. Conta, checkout e pós-compra
   - exigir conta e senha segura antes de criar o pagamento, inclusive no servidor;
   - mostrar requisitos de senha (8+ caracteres, maiúscula, minúscula, número e especial);
   - manter e-mails de confirmação e recuperação em português;
   - corrigir links de recuperação expirados/consumidos por scanners;
   - retornar do pagamento diretamente para “Meus produtos”;
   - mostrar o primeiro nome no lugar de “Conta” e permitir editar o nome;
   - em “Meus produtos”, criar subabas Produtos, Histórico e Minha conta;
   - disponibilizar download no item comprado e manter histórico separado;
   - permitir encerrar a sessão atual.

3. Cupons e fidelidade
   - manter limite global atômico;
   - permitir limite individual por cliente;
   - permitir público: todos, contas cadastradas, primeira compra, recorrentes e lista de e-mails;
   - permitir recompensa após X compras aprovadas, liberando um novo uso a cada ciclo completo;
   - impedir uso duplicado em requisições simultâneas.

4. Devoluções e políticas
   - criar solicitação de devolução sem executar estorno automático;
   - motivo e telefone devem ser opcionais, pois não podem restringir o direito legal;
   - permitir ao professor registrar conversa, proposta, status e resposta;
   - mostrar ao cliente a resposta no histórico;
   - revisar Termos, Privacidade, licença de uso/Canva e direito de arrependimento para produto digital conforme CDC e LGPD;
   - não apresentar a revisão como parecer jurídico definitivo.

5. Publicação e e-mail
   - criar módulo de publicação para Facebook, Instagram, Pinterest, TikTok e envio via WhatsApp;
   - manter tokens somente no servidor e exigir autorização/escopos oficiais;
   - registrar cada publicação na auditoria;
   - usar SMTP de domínio verificado, versão HTML + texto e documentar SPF, DKIM e DMARC;
   - não prometer caixa principal, pois reputação e filtros pertencem ao provedor de destino.

6. Critérios de aceite
   - nenhuma credencial no bundle do navegador;
   - endpoints de escrita com sessão, rate limit e auditoria;
   - migrations idempotentes e RLS;
   - suíte completa, lint dentro do limite existente, build e `git diff --check` aprovados;
   - informar separadamente código concluído, migrations ainda não aplicadas e integrações externas ainda não autorizadas.
