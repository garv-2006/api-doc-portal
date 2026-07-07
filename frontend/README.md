# AI API documentation and testing portal — frontend

React + Vite frontend. Talks to a Python backend (FastAPI recommended) at `/api`.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:5173. It expects a backend running at http://localhost:8000
with two routes (see next message for the FastAPI code):

- `POST /api/generate` — body `{ "spec": {...} }`, returns `{ "documentation": [...], "testCases": [...] }`
- `POST /api/run-test` — body `{ "method", "url", "headers", "body" }`, returns `{ "status", "body" }`

## Project structure

```
frontend/
  index.html
  vite.config.js       # proxies /api -> http://localhost:8000
  package.json
  .env.example
  src/
    main.jsx
    App.jsx             # all UI + fetch calls live here
    App.css
```

## Build for production

```bash
npm run build
```

Outputs static files to `dist/`, which any static host (or your FastAPI server via
`StaticFiles`) can serve.
