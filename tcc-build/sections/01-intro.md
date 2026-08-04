# 1 INTRODUÇÃO

## 1.1 Contextualização e problema de pesquisa

A produção de materiais didáticos autorais figura entre as expressões mais concretas do saber profissional que os professores da educação básica constroem ao longo da carreira. Planos de aula, sequências de atividades, jogos pedagógicos e instrumentos de avaliação elaborados pelo próprio docente condensam saberes experienciais que não se encontram prontos nos livros didáticos convencionais, pois nascem do confronto cotidiano com turmas reais e contextos específicos (TARDIF, 2014). Quando circulam entre colegas, esses artefatos deixam de ser recursos meramente individuais e passam a compor um repertório coletivo da profissão. Tal movimento dialoga com a defesa de uma posição docente firmada sobre o conhecimento produzido pelos próprios professores (NÓVOA, 2017).

Entretanto, a circulação comercial desses materiais ocorre, em grande medida, por canais informais e fragmentados. Parcela expressiva dos professores divulga e vende suas produções em grupos de WhatsApp e perfis em redes sociais, entrega os arquivos por links de Google Drive e recebe pagamentos por Pix, sem qualquer garantia transacional. As consequências dessa informalidade se encadeiam: o trabalho docente é subvalorizado, a renda complementar se dissipa em negociações dispersas e os direitos autorais assegurados pela Lei nº 9.610/1998 permanecem sem proteção prática (BRASIL, 1998). Outros educadores, por sua vez, têm dificuldade de localizar bons materiais, dado que não existe um catálogo organizado e pesquisável. O quadro se agrava em um contexto de precarização e intensificação do trabalho docente, no qual a busca por fontes complementares de renda se tornou recorrente (OLIVEIRA, 2004).

Diante dessa dispersão, as plataformas digitais de comércio eletrônico apresentam-se como alternativa. A literatura sobre *e-commerce* indica que ambientes transacionais especializados reduzem custos de busca e de negociação, conferem segurança ao pagamento e ampliam o alcance geográfico de vendedores individuais (LAUDON; TRAVER, 2023). No mercado internacional, esse movimento já consolidou a figura dos *teacherpreneurs*, professores que comercializam conteúdos pedagógicos autorais em plataformas como o TeachersPayTeachers (SHELTON; ARCHAMBAULT, 2019). A lógica da cauda longa reforça a viabilidade econômica de nichos dessa natureza, uma vez que a distribuição digital permite atender demandas segmentadas ignoradas pelo mercado editorial de massa (ANDERSON, 2006). No Brasil, embora o ecossistema de tecnologias educacionais venha crescendo de forma consistente (CIEB; ABSTARTUPS, 2021), não se observa oferta consolidada voltada especificamente à comercialização de materiais didáticos autorais de professores da educação básica. É nessa lacuna que se insere o Ateliê Escolar, plataforma desenvolvida neste trabalho.

## 1.2 Pergunta de pesquisa

Diante do problema exposto, o presente trabalho orienta-se pela seguinte pergunta de pesquisa: de que forma uma plataforma web especializada pode facilitar a divulgação e a monetização de materiais didáticos autorais produzidos por professores da educação básica, reduzindo a informalidade e a fragmentação dos canais atualmente utilizados? A pergunta articula duas dimensões complementares: a compreensão do problema socioeducacional da informalidade e a construção de uma resposta tecnológica concreta, materializada no desenvolvimento da plataforma e na discussão de seus resultados. Trata-se, desse modo, de examinar não apenas a viabilidade técnica da solução, mas também sua adequação às práticas já estabelecidas pelos docentes que produzem e adquirem esses materiais.

## 1.3 Objetivos

Para responder à pergunta formulada, foram definidos o objetivo geral e os objetivos específicos descritos a seguir.

### 1.3.1 Objetivo geral

Desenvolver uma plataforma web de *e-commerce* especializada na divulgação e na comercialização de materiais didáticos autorais produzidos por professores da educação básica, oferecendo catálogo organizado, pagamento integrado e entrega digital controlada como alternativa aos canais informais hoje empregados.

### 1.3.2 Objetivos específicos

Para alcançar o objetivo geral, foram estabelecidos os seguintes objetivos específicos:

a) analisar o problema da informalidade na venda de materiais didáticos autorais pelos professores da educação básica;

b) levantar os requisitos funcionais e não funcionais da plataforma;

c) modelar a arquitetura do sistema e o banco de dados que sustentam a solução;

d) implementar a plataforma, contemplando catálogo de produtos, carrinho de compras, *checkout* com pagamento integrado, gestão de pedidos, cupons de desconto, painel administrativo, *analytics*, autenticação de usuários e auditoria de segurança;

e) discutir as tecnologias adotadas e as principais decisões de projeto;

f) apresentar os resultados obtidos e as limitações da versão implementada.

## 1.4 Justificativa

A relevância social constitui a primeira justificativa do trabalho. Ao oferecer um canal formal de divulgação e venda, a plataforma contribui para a valorização econômica de uma produção intelectual que costuma circular sem reconhecimento, convertendo-a em fonte legítima de renda complementar para uma categoria profissional historicamente afetada pela precarização (OLIVEIRA, 2004). O registro de cada transação, a identificação do autor e a entrega controlada dos arquivos criam, ainda que de modo incipiente, condições mais favoráveis à proteção dos direitos autorais previstos na legislação brasileira (BRASIL, 1998). Beneficiam-se também os professores compradores, que passam a dispor de um acervo pesquisável de materiais elaborados por pares familiarizados com as condições concretas da sala de aula.

No plano acadêmico, o tema permanece pouco explorado na produção nacional. Os estudos disponíveis sobre professores que comercializam conteúdos pedagógicos concentram-se em plataformas estrangeiras (SHELTON; ARCHAMBAULT, 2019), o que abre espaço para investigações situadas na realidade brasileira. O trabalho dialoga, ainda, com o campo da economia criativa, que reconhece o conhecimento e a criatividade individuais como ativos capazes de gerar valor econômico (HOWKINS, 2013), e aplica esse referencial a um grupo profissional raramente analisado sob tal ótica.

Há, por fim, uma justificativa de ordem tecnológica. O projeto exercita, em um caso real, um conjunto de práticas atuais de engenharia de software: arquitetura *serverless* baseada em funções Node.js, interface construída em React, banco de dados PostgreSQL gerenciado com políticas de segurança em nível de linha, integração com *gateway* de pagamento e mecanismos de conformidade com a Lei Geral de Proteção de Dados (BRASIL, 2018a). A documentação dessas decisões e de seus efeitos práticos pode servir de referência para outros projetos de conclusão de curso e para desenvolvedores que enfrentem requisitos semelhantes.

## 1.5 Estrutura do trabalho

Além desta introdução, o trabalho organiza-se em cinco seções. A seção 2 apresenta a fundamentação teórica, articulando o trabalho docente e a produção de materiais autorais, a economia criativa, o comércio eletrônico e as plataformas digitais, bem como os aspectos legais relativos a direitos autorais e à proteção de dados. A seção 3 descreve a metodologia adotada, caracterizando a natureza aplicada da pesquisa e as etapas de desenvolvimento da solução. A seção 4 detalha o desenvolvimento da plataforma, dos requisitos funcionais e não funcionais à implementação, passando pela modelagem da arquitetura e do banco de dados. A seção 5 discute os resultados alcançados, as decisões de projeto e as limitações identificadas. Por fim, a seção 6 reúne as considerações finais e indica os trabalhos futuros, entre os quais a evolução para um *marketplace* multivendedor.
