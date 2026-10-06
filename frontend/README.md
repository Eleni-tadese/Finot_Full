# Finot frontend

React + TypeScript single-page app for the Finot platform (Vite, Tailwind CSS, react-i18next). For the big picture see the [root README](../README.md) and [docs/architecture.md](../docs/architecture.md). The product and design brief is [docs/ux-design-brief.md](../docs/ux-design-brief.md).

## Run it

```bash
cp .env.example .env     # VITE_API_URL=http://localhost:8000
npm install
npm run dev              # http://localhost:5176
```

The backend must be running (see `../backend/README.md`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | development server with hot reload |
| `npx tsc -b` | type check |
| `npm run build` | type check and production build into `dist/` |
| `npm run preview` | serve the production build locally |

## Layout

```
src/
├── pages/                 route-level screens
├── features/admin-console/  the Super Admin area (/dashboard/admin/*)
├── features/              auth and roles, course attendance report, export button, service groups
├── components/            shared UI: dashboard sidebar and top bar, dialogs, filters, cards
├── layouts/               MainLayout (public) and DashboardLayout (signed in)
├── lib/                   API client, axios, i18n, date helpers
├── routes/                route table and role guards
└── assets/locales/        en.json, am.json, om.json
```

## Notes

- All visible text goes through `src/assets/locales/*.json`. Add a key to all three files; Amharic and Oromo wording should be reviewed by native speakers.
- The dashboard menu is an icon-only strip on tablets and a drawer on phones.
- No browser pop-ups: use the confirm dialog (`useConfirm()`) and toasts.
- `public/firebase-messaging-sw.js` holds the Firebase **web** config for push (not a secret, but restrict the key in Google Cloud). Replace it with your own project's values.
- Deploy the `dist/` folder to any static host with a rewrite of all paths to `index.html` (`vercel.json` does this). See [../docs/deployment.md](../docs/deployment.md).
