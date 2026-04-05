# Caderneta de Gestante do SUS - WebApp

Este é o diretório principal do frontend e backend da aplicação (Next.js 14 App Router + Prisma). 
Abaixo está o guia completo para rodar o ambiente de desenvolvimento após clonar o repositório em um novo computador.

---

## 🚀 Como rodar o ambiente passo a passo

### 1. Clonar o Repositório
Abra o seu terminal (CMD, PowerShell ou bash) e clone o repositório:
```bash
git clone <URL_DO_SEU_REPOSITORIO>
cd sus-prenatal-ai-icei-puc-minas-cc
```

### 2. Subir o Banco de Dados (Docker)
Na **raiz do projeto**, suba o container do PostgreSQL. Certifique-se de estar com o Docker rodando na sua máquina.
```bash
docker-compose up -d
```
> **Nota:** Isso criará um container rodando o PostgreSQL na porta `5432`.

### 3. Entrar na pasta do WebApp e Instalar as Dependências
Todo o código principal fica na pasta `Codigo/webapp`. Navegue até ela e instale as bibliotecas.
```bash
cd Codigo/webapp
npm install
```

### 4. Configurar as Variáveis de Ambiente
Dentro da pasta `Codigo/webapp`, crie um arquivo chamado **`.env`** (ou copie `.env.example` caso exista) e adicione:
```env
DATABASE_URL="postgresql://postgres:123456@localhost:5432/sus_prenatal?schema=public"
NEXTAUTH_SECRET="sus-prenatal-secret-dev-tcc-2026"
```

### 5. Sincronizar as Tabelas no Banco de Dados
Ainda dentro de `Codigo/webapp`, compile o schema do Prisma e crie as tabelas no PostgreSQL:
```bash
npx prisma db push
npx prisma generate
```

### 6. Executar o Servidor 
Inicie o servidor Next.js:
```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador para ver a aplicação funcionando.

---

## 🛠 Arquitetura & Tecnologias
- **Frontend / Backend:** Next.js 14
- **ORM do Banco de Dados:** Prisma (Versão 7) 
- **Banco de Dados:** PostgreSQL 15 via Docker
- **Estilização:** Tailwind CSS

---

## Documentação Oficial do Next.js

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

### Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
