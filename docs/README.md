# Documentação — Ateliê da Escola

Índice único da documentação. O que o projeto **é** e como rodá-lo está no
[README da raiz](../README.md); aqui está tudo o mais.

Três tipos de documento, e a diferença importa:

| Tipo           | Onde                                 | Regra                                                                  |
| -------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| **Vivo**       | `ProjectDocs/`, `adr/`, este arquivo | Descreve o estado atual. Muda no mesmo PR que muda o comportamento     |
| **Retrato**    | `reviews/`                           | Datado e amarrado a um commit. **Nunca se edita** — o commit é a prova |
| **Ferramenta** | `REVIEW-PROMPTS.md`                  | Não descreve o projeto; serve para operar sobre ele                    |

---

## Os 13 volumes (`ProjectDocs/`)

A fonte canônica. Toda decisão de produto, arquitetura, segurança e operação está aqui.

| #   | Documento                                                         | Quando consultar                                                |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| 01  | [Visão geral](./ProjectDocs/01-VISAO-GERAL.md)                    | Primeiro contato: personas, o que o sistema faz e o que não faz |
| 02  | [Arquitetura](./ProjectDocs/02-ARQUITETURA.md)                    | Estrutura de pastas, camadas, como um request flui              |
| 03  | [Setup](./ProjectDocs/03-SETUP.md)                                | Rodar localmente: Supabase, Mercado Pago, OAuth, Resend         |
| 04  | [Banco de dados](./ProjectDocs/04-BANCO-DE-DADOS.md)              | Schema das 18 tabelas, RLS, triggers, migrations                |
| 05  | [Fluxos](./ProjectDocs/05-FLUXOS.md)                              | Diagramas de auth, checkout, webhook, admin                     |
| 06  | [Fluxo de compra e venda](./ProjectDocs/06-FLUXO-COMPRA-VENDA.md) | Jornada do cliente + rotina do vendedor                         |
| 07  | [Dashboard admin](./ProjectDocs/07-DASHBOARD-ADMIN.md)            | As 14 abas do painel, KPIs, gestão de produtos e pedidos        |
| 08  | [Segurança](./ProjectDocs/08-SEGURANCA.md)                        | Modelo de ameaça, RLS, secrets, auditoria, LGPD                 |
| 09  | [API endpoints](./ProjectDocs/09-API-ENDPOINTS.md)                | Referência REST completa (cliente + admin)                      |
| 10  | [Marketing & analytics](./ProjectDocs/10-MARKETING-ANALYTICS.md)  | GA4, Pixel, Curva ABC, e-mail marketing, funil, custos          |
| 11  | [Regras de negócio](./ProjectDocs/11-REGRAS-NEGOCIO.md)           | Princípios invioláveis, anti-padrões, checklist de PR           |
| 12  | [Deploy & operação](./ProjectDocs/12-DEPLOY-OPERACAO.md)          | Vercel, release checklist, troubleshooting, rollback            |
| 13  | [Roadmap & pendências](./ProjectDocs/13-ROADMAP-PENDENCIAS.md)    | O que falta para produção + Fases 5 e 6                         |

### Atalhos por tarefa

| Vou…                              | Ler                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| rodar o projeto pela primeira vez | [03-SETUP](./ProjectDocs/03-SETUP.md)                                                                                            |
| adicionar um endpoint             | [02](./ProjectDocs/02-ARQUITETURA.md) + [09](./ProjectDocs/09-API-ENDPOINTS.md) + [regra E1](../CONTRIBUTING.md)                 |
| mexer no checkout                 | [06](./ProjectDocs/06-FLUXO-COMPRA-VENDA.md) + [05 §5](./ProjectDocs/05-FLUXOS.md) + [11 §G](./ProjectDocs/11-REGRAS-NEGOCIO.md) |
| criar uma tabela                  | [04](./ProjectDocs/04-BANCO-DE-DADOS.md) + [08 §RLS](./ProjectDocs/08-SEGURANCA.md)                                              |
| subir para produção               | [12 §5](./ProjectDocs/12-DEPLOY-OPERACAO.md)                                                                                     |
| planejar uma campanha             | [10](./ProjectDocs/10-MARKETING-ANALYTICS.md) + [11 §C-D](./ProjectDocs/11-REGRAS-NEGOCIO.md)                                    |
| investigar algo quebrado em prod  | [12 §7](./ProjectDocs/12-DEPLOY-OPERACAO.md)                                                                                     |

---

## Decisões estruturais (`adr/`)

[Índice dos 7 ADRs](./adr/README.md) — uma página por decisão que atravessa vários arquivos e
que alguém "consertaria" de volta para o estado errado sem o contexto. Por que CommonJS no
backend e ESM no front, por que um handler serve Vercel e Express, por que um mecanismo de
rate limit e não dois.

## Padrões de código

[CONTRIBUTING.md](../CONTRIBUTING.md) — 29 regras de convenção, cada uma com a divergência
medida que a motivou. Cite o identificador da regra (`A1`, `E3`…) em review de PR.

## Análise de dependências

[SECURITY-ADVISORIES.md](./SECURITY-ADVISORIES.md) — quais advisories do `npm audit` são
alcançáveis neste código e quais não são. Existe porque `npm audit` conta advisories, não risco.

---

## Retratos datados (`reviews/`)

Cada arquivo é o estado do projeto num dia, amarrado a um commit. **Não se editam** para
refletir o presente: quando o achado é corrigido, o commit é a prova. Os anteriores a
13/08/2026 abrem com um cabeçalho de 📅 retrato histórico — sem ele, um documento de agosto
continuava sendo lido como estado atual.

| Documento                                                                                 | Sobre                                                                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [REVIEW-AUTH-2026-09-01](./reviews/REVIEW-AUTH-2026-09-01.md)                             | Fluxo de login de ponta a ponta: guardas fora do caminho de produção, 2FA em repouso, cobertura        |
| [OTIMIZACAO-CODIGO-2026-08-18](./reviews/OTIMIZACAO-CODIGO-2026-08-18.md)                 | Desempenho: caminho crítico do bundle (−35% medido), tetos de escala do backend, código sem consumidor |
| [REVIEW-GERAL-2026-08-12](./reviews/REVIEW-GERAL-2026-08-12.md)                           | Arquitetura, segurança e processos — originou as 29 regras                                             |
| [REVIEW-RESULTS-2026-08-12](./reviews/REVIEW-RESULTS-2026-08-12.md)                       | Consolidação dos resultados por área                                                                   |
| [AREA-08-qualidade-codigo-arquitetura](./reviews/AREA-08-qualidade-codigo-arquitetura.md) | Qualidade de código e arquitetura                                                                      |
| [AREA-09-testes-confiabilidade](./reviews/AREA-09-testes-confiabilidade.md)               | Testes e confiabilidade                                                                                |
| [REVIEW-GERAL-2026-07-03](./reviews/REVIEW-GERAL-2026-07-03.md)                           | Revisão geral anterior                                                                                 |

**Ferramenta, não relatório:** [REVIEW-PROMPTS.md](./REVIEW-PROMPTS.md) traz os prompts de
review profundo, um por área. É o que gera os documentos da tabela acima.

---

## Convenções

- Documento vivo se atualiza **no mesmo PR** que muda o comportamento que ele descreve.
- Um assunto, um documento (regra `F2`). Se dois arquivos explicam a mesma coisa, um deles está
  errado e ninguém sabe qual.
- Decisão que atravessa arquivos vira [ADR](./adr/README.md); o resto fica em comentário no
  código (regra `F3`).
- Commits em [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, `refactor:`, `chore:`).
- Documentação e commits em **português**; código em inglês.

## Contato

- Técnico: `desenvolvimento@oqtem.com`
- Loja: `contato@profamarciarcardoso.com.br`
