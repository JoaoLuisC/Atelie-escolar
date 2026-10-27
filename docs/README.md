# Documentação — Ateliê da Escola

O que o projeto é e como rodá-lo em cinco minutos está no [README da raiz](../README.md). Aqui
ficam os dez documentos vivos: cada um descreve o estado **atual** e muda no mesmo commit que muda
o comportamento que ele descreve.

| #   | Documento                                          | Quando ler                                                                       |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| 01  | [Visão geral](./01-VISAO-GERAL.md)                 | Primeiro contato: para quem é, o que faz hoje, o que não faz, quanto custa       |
| 02  | [Arquitetura](./02-ARQUITETURA.md)                 | Pastas, camadas, caminho de um request, papéis do painel e os ADRs 0001–0007     |
| 03  | [Setup e deploy](./03-SETUP-E-DEPLOY.md)           | Rodar local, variáveis de ambiente, release, smoke test, troubleshooting         |
| 04  | [Banco de dados](./04-BANCO-DE-DADOS.md)           | Tabelas, RLS, funções, jobs e migrations                                         |
| 05  | [Fluxos](./05-FLUXOS.md)                           | Login, compra, webhook, download, e-mails — diagrama e o que a pessoa vê         |
| 06  | [Painéis](./06-PAINEIS.md)                         | Painel da loja, administração da plataforma, área do professor, Minha conta      |
| 07  | [Negócio e marketing](./07-NEGOCIO-E-MARKETING.md) | Regras de negócio (A1–A7, A–I), mensuração, e-mail marketing, SEO, KPIs          |
| 08  | [Segurança](./08-SEGURANCA.md)                     | Modelo de ameaça, sessões, CSRF, rate limit, RLS, LGPD, dependências, pendências |
| 09  | [API](./09-API.md)                                 | Referência de todos os endpoints                                                 |
| 10  | [Roadmap](./10-ROADMAP.md)                         | Só o que está em aberto, incluindo a v2 (marketplace/white label, adiada)        |
| —   | [CONTRIBUTING](../CONTRIBUTING.md)                 | As regras de código (A1–F3): ler antes de abrir PR                               |

## Atalhos por tarefa

| Vou…                              | Ler                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| rodar o projeto pela primeira vez | [03](./03-SETUP-E-DEPLOY.md)                                                       |
| adicionar um endpoint             | [02](./02-ARQUITETURA.md) + [09](./09-API.md) + [CONTRIBUTING](../CONTRIBUTING.md) |
| mexer no checkout                 | [05](./05-FLUXOS.md) + [07](./07-NEGOCIO-E-MARKETING.md) (regras G)                |
| criar uma tabela                  | [04](./04-BANCO-DE-DADOS.md) + [08](./08-SEGURANCA.md)                             |
| mexer no painel                   | [06](./06-PAINEIS.md) + [02](./02-ARQUITETURA.md) (papéis e sessão)                |
| subir para produção               | [03](./03-SETUP-E-DEPLOY.md) — todo push na `main` já faz o release                |
| investigar algo quebrado em prod  | [03](./03-SETUP-E-DEPLOY.md) (troubleshooting)                                     |
| saber o que falta                 | [10](./10-ROADMAP.md)                                                              |

## Convenções

- Um assunto, um documento (regra `F2`). Se dois arquivos explicam a mesma coisa, um deles está
  errado e ninguém sabe qual.
- Decisão que atravessa vários arquivos vira ADR, na seção "Decisões estruturais" do
  [02](./02-ARQUITETURA.md); o resto fica em comentário no código (regra `F3`).
- Documentação e commits em **português**; código em inglês. Commits em
  [Conventional Commits](https://www.conventionalcommits.org/).
- A validação local grava no banco de **produção** (o `.env.local` aponta para ele).

## O que saiu daqui

Os retratos datados (revisões de julho a setembro em `reviews/`, relatórios da validação no
navegador de outubro em `validacao/`), os prompts de revisão e correção, os 7 ADRs em arquivos
separados e a pasta da v2 foram removidos em 27/10/2026. Os ADRs e a v2 foram absorvidos pelo 02
e pelo 10. Alguns comentários antigos do código ainda citam "o doc de otimização" (§2.1, §2.2,
§2.3.a…): é o `reviews/OTIMIZACAO-CODIGO-2026-08-18.md`, que continua no histórico do git:

```bash
git log --diff-filter=D --name-only -- docs/   # o commit que removeu
git show <commit>^:docs/reviews/OTIMIZACAO-CODIGO-2026-08-18.md
```

## Contato

- Técnico: `desenvolvimento@oqtem.com`
- Loja: `jlcardoso.dev@gmail.com` (o mesmo canal dos Termos e da Política de Privacidade)
