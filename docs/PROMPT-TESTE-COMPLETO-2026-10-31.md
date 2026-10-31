# Prompt mestre de teste — loja e painel do professor

Você é uma pessoa engenheira de QA sênior responsável por validar integralmente uma loja de produtos digitais. Trabalhe no repositório atual e teste frontend, backend, banco, segurança, integrações e experiência do usuário.

## Regras de execução

1. Não altere dados reais, não publique conteúdo público e não execute pagamento real.
2. Use ambiente local, contas de teste e sandboxes das integrações.
3. Antes de testar, registre:
   - branch e commit atual;
   - versão do Node e gerenciador de pacotes;
   - variáveis obrigatórias presentes, mostrando apenas o nome e nunca o valor;
   - estado das migrations do Supabase;
   - integrações externas disponíveis ou indisponíveis.
4. Não marque um caso como aprovado sem evidência. Para cada teste, registre:
   - ID;
   - cenário;
   - pré-condições;
   - passos;
   - resultado esperado;
   - resultado obtido;
   - evidência: teste, log sanitizado, resposta HTTP ou captura de tela;
   - situação: aprovado, reprovado, bloqueado ou não aplicável.
5. Nunca exponha cookies, tokens, senhas, CPFs, telefones ou chaves nas evidências.
6. Para falhas, informe severidade, impacto, causa provável, arquivo/linha relacionados e passos mínimos de reprodução.
7. Não corrija defeitos durante a primeira rodada. Primeiro produza o relatório completo; depois apresente um plano de correção priorizado.

## Preparação

1. Instale dependências usando o lockfile existente.
2. Confirme que não há migrations pendentes no banco de teste.
3. Crie dados isolados:
   - professor/dono da loja;
   - cliente novo;
   - cliente recorrente com compras aprovadas;
   - cliente sem compra;
   - produto individual com imagem e vídeo;
   - kit com mais de uma imagem;
   - pedido pendente, aprovado, rejeitado e cancelado;
   - cupons de cada modalidade descrita abaixo.
4. Execute inicialmente:

```bash
npm run lint
npm test -- --runInBand
npm run build
git diff --check
```

Registre quantidade de arquivos e testes aprovados. Qualquer falha impede declarar a entrega como aprovada.

## Matriz de testes

### A. Homepage, imagens e banner

- A01 — Confirmar que as imagens dos produtos na home estão aproximadamente 35% maiores que o tamanho anterior, sem sobreposição ou corte indevido.
- A02 — Testar imagens 1200×1200, 1200×900, retrato e ultrawide; a interface deve preservar o conteúdo com `object-contain` quando aplicável.
- A03 — Confirmar a recomendação de 1200×1200 para cards da home e 1200×900 para produto em proporção 4:3.
- A04 — Editar título, texto, botões, alinhamento e formatação do banner e confirmar persistência após recarregar.
- A05 — Alterar cor sólida, cor predominante, degradê linear e radial.
- A06 — Editar ícones decorativos e seus tamanhos.
- A07 — Adicionar logo/imagem à esquerda e à direita do texto.
- A08 — Testar todas as animações de entrada.
- A09 — Com `prefers-reduced-motion`, confirmar que a animação é removida.
- A10 — Testar tamanhos pequeno, médio e grande da navbar e editar seu título.
- A11 — Verificar navegação e banner em 320, 375, 768, 1024, 1440 e 1920 px.
- A12 — Validar foco de teclado, contraste, texto alternativo e ausência de rolagem horizontal.

### B. Editor da página da loja

- B01 — Confirmar que o editor começa recolhido.
- B02 — Alternar entre edição e visualização sem perder mudanças não salvas.
- B03 — Expandir a pré-visualização e confirmar que ela não fica presa a uma tela fixa.
- B04 — Salvar, atualizar o navegador e confirmar persistência.
- B05 — Enviar campos desconhecidos e conteúdo acima dos limites diretamente para a API; o servidor deve sanitizar ou rejeitar.
- B06 — Confirmar que um professor não acessa configurações de outra loja.
- B07 — Testar estado de carregamento, falha de rede, sessão expirada e salvamento duplicado.

### C. Footer, privacidade e termos

- C01 — Editar textos, títulos, contatos e redes do footer.
- C02 — Confirmar que links vazios são ocultados e links inválidos não são persistidos.
- C03 — Testar links de Privacidade, Termos e Licença de uso em desktop e celular.
- C04 — Verificar que a política descreve conta, pedidos, pagamentos, downloads, métricas, Supabase, e-mail, retenção, exportação e exclusão.
- C05 — Confirmar que a política de devolução não exige motivo ou telefone para exercer o direito aplicável.
- C06 — Verificar a licença de materiais digitais e uso relacionado ao Canva sem apresentar aconselhamento jurídico definitivo.

### D. Produtos e mídia

- D01 — Criar e editar produto individual e kit.
- D02 — Enviar imagem pelo arquivo local; confirmar gravação no Supabase Storage e URL pública segura.
- D03 — Enviar vídeo pelo arquivo local, sem digitar URL; confirmar upload, persistência e reprodução na página pública.
- D04 — Recusar extensão, MIME e tamanho inválidos.
- D05 — Confirmar que arquivo pago permanece privado e só recebe URL assinada após autorização.
- D06 — Confirmar que imagens e vídeos de vitrine são públicos, mas arquivos de download não.
- D07 — Testar galeria, miniaturas, troca de mídia e vídeo com controles.
- D08 — Alterar ordem do texto, alinhamento e tamanho na página do produto.
- D09 — Confirmar foto correta do produto no carrinho, inclusive com fallback de galeria.
- D10 — Alterar preço após adicionar ao carrinho; checkout deve reler o preço do servidor.
- D11 — Pausar ou apagar produto presente no carrinho; checkout não pode vendê-lo.

### E. Navbar, conta e sessão

- E01 — Deslogado deve ver “Entrar”.
- E02 — Logado deve ver o primeiro nome, com fallback seguro para o e-mail.
- E03 — Clicar no nome deve levar à edição da conta.
- E04 — Editar nome em “Minha conta” e em “Meus produtos”; confirmar atualização imediata e após novo login.
- E05 — Encerrar a sessão e confirmar remoção do cookie e bloqueio das rotas autenticadas.
- E06 — Simular falha no logout; a interface não deve anunciar sessão encerrada se o servidor não confirmou.
- E07 — Testar expiração da sessão durante checkout, download, devolução e edição da conta.
- E08 — Cliente não pode acessar painel do professor; professor vendedor não pode assumir papel administrativo indevido.

### F. Cadastro, login e senha

- F01 — Cadastro por e-mail com nome, e-mail e senha válidos.
- F02 — Testar cada requisito isoladamente: 8 caracteres, maiúscula, minúscula, número e especial.
- F03 — Confirmar checklist visual dos requisitos de senha.
- F04 — Repetir validações chamando a API diretamente; o servidor deve rejeitar senha fraca.
- F05 — Testar e-mail já cadastrado, credenciais erradas e limite de tentativas.
- F06 — Testar login Google e seleção de conta, se a integração estiver disponível.
- F07 — Confirmar mensagens de erro em português e sem detalhes internos do Supabase.

### G. Recuperação de senha

- G01 — Solicitar recuperação e confirmar e-mail em português.
- G02 — Abrir link válido e definir senha forte.
- G03 — Confirmar que o template usa `token_hash` e que o token só é verificado ao abrir a página.
- G04 — Simular scanner de e-mail acessando o HTML sem executar a página; o link do usuário deve continuar utilizável.
- G05 — Testar token expirado, inválido, reutilizado e ausente.
- G06 — Testar senha igual à anterior e senha fraca.
- G07 — Confirmar redirecionamento seguro para checkout, downloads ou painel, sem open redirect.
- G08 — Testar o link em navegador/dispositivo diferente do que pediu a recuperação.

### H. Checkout e pagamento

- H01 — Cliente sem conta não pode criar pagamento pela tela.
- H02 — Chamada direta a `/create-payment` sem sessão deve retornar 401 e não criar pedido/preferência.
- H03 — Criar conta no checkout e exigir confirmação quando configurada.
- H04 — Cliente logado deve ter pedido associado ao `customer_id` da sessão; o e-mail do formulário não pode substituir o da conta.
- H05 — Validar nome, e-mail, CPF e telefone nos limites esperados.
- H06 — Confirmar que preço, disponibilidade e descontos vêm do servidor.
- H07 — Confirmar invariável: total do pedido igual à soma efetivamente enviada ao Mercado Pago.
- H08 — Testar pagamento aprovado, pendente, rejeitado, cancelado e webhook duplicado.
- H09 — Confirmar idempotência entre webhook e consulta manual.
- H10 — Após aprovação, redirecionar para `/downloads?order=...` e liberar somente os itens pagos.
- H11 — Testar retorno tardio de Pix e pagamento aprovado após reserva ter sido devolvida.
- H12 — Nenhuma senha, token ou e-mail deve aparecer em query string indevida, logs ou analytics.

### I. Cupons e fidelidade

- I01 — Cupom percentual e valor fixo.
- I02 — Pedido mínimo e validade inicial/final no horário de Brasília.
- I03 — Limite global com requisições concorrentes; nunca ultrapassar o total permitido.
- I04 — Limite por cliente: permitir ou impedir reutilização conforme configuração.
- I05 — Público “todos”.
- I06 — Público “somente clientes com conta”.
- I07 — Público “primeira compra”.
- I08 — Público “clientes que já compraram”.
- I09 — Público por lista de e-mails, incluindo normalização de maiúsculas/minúsculas.
- I10 — Cupom restrito por produto ou categoria.
- I11 — Carrinho sem item elegível não recebe desconto.
- I12 — Meta de compras: X compras aprovadas liberam um uso; 2X liberam o segundo.
- I13 — Pedidos pendentes, rejeitados ou cancelados não contam para a meta.
- I14 — Duas tentativas simultâneas da mesma recompensa não podem consumir além do saldo adquirido.
- I15 — Checkout abandonado deve devolver a reserva após o prazo configurado.
- I16 — Falha antes de criar preferência deve compensar imediatamente a reserva.

### J. Meus produtos e downloads

- J01 — Confirmar subabas Produtos, Histórico e Minha conta.
- J02 — Produtos deve mostrar somente itens de pedidos aprovados.
- J03 — Histórico deve mostrar pedidos e estados corretos.
- J04 — Botão Baixar deve solicitar token novo e abrir URL assinada.
- J05 — Token expirado, reutilizado, de outro cliente ou produto não comprado deve ser recusado.
- J06 — Arquivo privado não pode ser acessado diretamente pela URL do bucket.
- J07 — Cliente sem compras deve ver estado vazio, não erro de autenticação falso.
- J08 — Pedido consultado manualmente não deve expor e-mail na URL.

### K. Solicitações de devolução

- K01 — Pedido aprovado da própria conta pode abrir solicitação.
- K02 — Pedido de outro usuário, pendente ou inexistente deve ser recusado.
- K03 — Motivo e telefone são opcionais; validar apenas tamanho/formato quando preenchidos.
- K04 — Impedir duas solicitações ativas para o mesmo pedido, inclusive sob concorrência.
- K05 — Professor deve ver somente solicitações de pedidos dentro do seu escopo.
- K06 — Professor pode registrar status: aberta, em conversa, aceita, não aceita e resolvida.
- K07 — Professor pode registrar resposta/proposta; cliente deve vê-la no histórico.
- K08 — Criar solicitação não pode executar estorno automático.
- K09 — Confirmar que dados sensíveis não aparecem para outro professor.

### L. E-mails

- L01 — Confirmação de compra deve ser enviada apenas na primeira aprovação.
- L02 — Webhook e polling simultâneos não podem gerar e-mail duplicado.
- L03 — E-mail deve conter versão HTML e texto simples.
- L04 — Marketing deve incluir descadastro de um clique; transacional não deve incluir rodapé de marketing.
- L05 — Testar SMTP ausente, credencial inválida, timeout, bounce e limite do provedor.
- L06 — Confirmar remetente em domínio verificado e resultados de SPF, DKIM e DMARC.
- L07 — Testar entrega em Gmail, Outlook e domínio corporativo; registrar caixa principal, promoções ou spam sem prometer resultado universal.
- L08 — Confirmar que falha de e-mail não desfaz pagamento nem bloqueia downloads.

### M. Publicação social

- M01 — Sem credenciais, painel deve mostrar “Configuração pendente” e bloquear publicação.
- M02 — Tokens nunca podem estar no bundle, HTML, localStorage, resposta da API ou logs.
- M03 — Facebook: publicar texto/link e imagem em página de teste.
- M04 — Instagram: criar container e publicar imagem em conta profissional de teste.
- M05 — Pinterest: criar Pin em board de sandbox/teste com título, descrição, imagem e link.
- M06 — TikTok: consultar permissões, inicializar upload, enviar vídeo e acompanhar processamento; usar visibilidade privada em cliente não auditado.
- M07 — WhatsApp: enviar para número de teste dentro da janela permitida; fora dela, confirmar erro claro ou uso de template aprovado.
- M08 — Validar mídia ausente, URL não HTTPS, arquivo grande, token vencido, escopo ausente, rate limit e indisponibilidade externa.
- M09 — Cada publicação aceita deve aparecer no log de auditoria sem legenda completa, token ou telefone exposto.
- M10 — Clique duplo não deve gerar publicações duplicadas enquanto o botão estiver processando.

### N. Segurança e privacidade

- N01 — Testar IDOR em pedidos, downloads, perfil e devoluções.
- N02 — Testar CSRF nos endpoints baseados em cookie.
- N03 — Testar XSS armazenado nos textos da home, footer, produto e respostas de devolução.
- N04 — Testar URLs `javascript:`, `data:`, HTTP e redirecionamentos externos.
- N05 — Verificar RLS nas novas tabelas e privilégios exclusivos de `service_role`.
- N06 — Verificar rate limit em autenticação, pagamento, cupom, perfil, devolução e publicação social.
- N07 — Confirmar auditoria para mudanças administrativas e publicação social.
- N08 — Confirmar que logs sanitizam senha, token, cookie, e-mail, CPF e telefone.
- N09 — Testar exportação e exclusão de dados da conta.
- N10 — Executar análise de dependências e procurar segredos no repositório e no bundle final.

### O. Compatibilidade, acessibilidade e desempenho

- O01 — Chrome, Edge, Firefox e Safari atual; Android e iOS quando disponíveis.
- O02 — Navegação completa apenas por teclado.
- O03 — Leitor de tela: nomes acessíveis, status, erros e diálogos.
- O04 — Zoom de 200% e fonte ampliada.
- O05 — Tema/contraste, foco visível e alvos de toque de pelo menos 44 px.
- O06 — Lighthouse ou equivalente na home, catálogo, produto, checkout e downloads.
- O07 — Rede lenta, offline, timeout e respostas fora de ordem.
- O08 — Confirmar ausência de vazamento de memória em polling e troca de páginas.

## Testes de banco obrigatórios

Validar as migrations:

- `20261031000000_refund_requests.sql`;
- `20261031010000_coupon_audience_and_customer_limits.sql`.

Testar upgrade em banco com dados existentes, execução repetida quando suportada, constraints, índices parciais, grants, RLS e rollback documentado. Execute concorrência real no PostgreSQL para limites de cupom e solicitação única de devolução.

## Critério final de aprovação

A entrega só pode receber “APROVADA” se:

- lint, suíte completa, build e `git diff --check` passarem;
- não houver falha crítica ou alta aberta;
- migrations forem validadas em banco de teste;
- checkout, pagamento sandbox, download e recuperação de senha funcionarem ponta a ponta;
- pelo menos uma integração social configurada for testada em ambiente privado/sandbox;
- bloqueios externos forem explicitamente listados, nunca convertidos em aprovação presumida.

## Formato do relatório final

1. Resumo executivo.
2. Ambiente e versões.
3. Resultado dos comandos automatizados.
4. Tabela com total por área: aprovados, reprovados, bloqueados e não aplicáveis.
5. Defeitos ordenados por severidade.
6. Evidências e links para artefatos.
7. Riscos residuais.
8. Itens que exigem credencial, sandbox ou ação humana.
9. Veredito final: aprovado, aprovado com ressalvas ou reprovado.
10. Percentual calculado: `aprovados / (aprovados + reprovados) × 100`; bloqueados devem ser apresentados separadamente e não contam como aprovados.
