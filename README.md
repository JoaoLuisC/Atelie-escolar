# Ateliê da Escola

Plataforma de e-commerce para venda de materiais educativos digitais (banners, atividades, máscaras, etc.) com pagamento integrado e download automático após a compra.

---

## Tecnologias Utilizadas

### Backend
| Tecnologia | Versão | Função |
|---|---|---|
| **Node.js** | LTS | Servidor HTTP e lógica da aplicação |
| **dotenv** | ^16.3.1 | Gerenciamento de variáveis de ambiente |
| **cors** | ^2.8.5 | Controle de acesso entre origens |

### Frontend
| Tecnologia | Versão | Função |
|---|---|---|
| **HTML5 / CSS3 / JS** | — | Interface do usuário |
| **Bootstrap Icons** | CDN | Ícones da interface |
| **Firebase JS SDK** | CDN | Autenticação no navegador |

### Banco de Dados e Autenticação
| Tecnologia | Versão | Função |
|---|---|---|
| **Firebase Firestore** | — | Banco de dados NoSQL (pedidos, produtos, usuários) |
| **Firebase Authentication** | — | Login e cadastro de usuários |
| **firebase-admin** | ^12.0.0 | Acesso ao Firebase pelo servidor |

### Pagamentos
| Tecnologia | Versão | Função |
|---|---|---|
| **MercadoPago SDK** | ^2.0.0 | Checkout Pro (cartão, boleto, PIX) |

### Infraestrutura e Deploy
| Tecnologia | Função |
|---|---|
| **Vercel** | Hospedagem e deploy em produção |
| **ngrok** | Túnel para testes locais do webhook |

---

## Fluxo de Funcionamento

```
1. Usuário navega pelos produtos
2. Adiciona ao carrinho e vai ao checkout
3. Sistema cria um pedido no Firestore
4. MercadoPago gera a tela de pagamento
5. Usuário realiza o pagamento
6. MercadoPago notifica via Webhook (/api/webhook)
7. Sistema confirma o pagamento e libera os downloads
8. Usuário acessa os arquivos comprados em "Meus Produtos"
```

---

## Estrutura do Projeto

```
├── server.js               # Servidor HTTP local
├── api/
│   ├── create-payment.js   # Cria pedido + preferência no MercadoPago
│   ├── webhook.js          # Recebe notificações do MercadoPago
│   ├── verify-payment.js   # Verifica status do pagamento
│   ├── products.js         # Lista produtos
│   └── download.js         # Gera links de download seguros
├── lib/
│   ├── firebase-admin.js   # Conexão com Firebase (backend)
│   └── mercadopago-config.js # Configuração do MercadoPago
├── public/                 # Frontend (HTML, CSS, JS)
└── scripts/                # Scripts utilitários (setup, add-product...)
```

---

## Como Rodar Localmente

**Modo Teste** (credenciais de sandbox):
```powershell
.\start-test.ps1
```

**Modo Produção** (credenciais reais):
```powershell
.\start-prod.ps1
```

Acesse: `http://localhost:3000`

---

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `FIREBASE_PROJECT_ID` | ID do projeto Firebase |
| `FIREBASE_CLIENT_EMAIL` | Email do service account |
| `FIREBASE_PRIVATE_KEY` | Chave privada do Firebase |
| `MERCADOPAGO_ACCESS_TOKEN` | Token de acesso MercadoPago |
| `MERCADOPAGO_PUBLIC_KEY` | Chave pública MercadoPago |
| `APP_URL` | URL base da aplicação |
| `WEBHOOK_SECRET` | Assinatura secreta do webhook |
| `DOWNLOAD_TOKEN_SECRET` | Segredo para tokens de download |
