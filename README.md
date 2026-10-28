# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- **Backend**: Serverless Functions na Vercel (`api/`, Node) + Postgres no Neon
  (sem Supabase — veja `docs/backend-sem-supabase.md`)

## Como rodar

```sh
npm i
npm run dev          # frontend (porta 8080)
npm run typecheck    # tsc do app + da api
npm test             # vitest
```

Para a API em desenvolvimento, use `npx vercel dev` e aponte
`VITE_API_PROXY_TARGET` para a porta em que ele rodar (padrão `:3001`).

## Variáveis de ambiente (Vercel)

| Variável | Para quê |
|---|---|
| `JWT_SECRET` | assina/valida o token de sessão |
| `NEON_DATABASE_URL` | conexão com o Postgres do Neon (driver serverless) |
| `LOVABLE_API_KEY` + `NEON_API_KEY` | alternativa via connector gateway (lotes transacionais) |

Detalhes em [docs/backend-sem-supabase.md](docs/backend-sem-supabase.md).

## How can I deploy this project?

O deploy é feito na Vercel (`git push` já dispara o build). As migrations ficam em
`db/migrations/` e são aplicadas no banco antes de publicar.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
