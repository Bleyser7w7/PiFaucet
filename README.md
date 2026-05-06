# Pi Faucet (simulado) — Railway + PostgreSQL

Faucet con moneda Pi **simulada**: registro/login con JWT, reclamos con cooldown, retiros con panel admin. **Sin Firebase**: backend **Express** y base **PostgreSQL**.

## Requisitos

- Node.js 18+
- PostgreSQL (local o [Railway](https://railway.app/))

## Local

1. Copia `.env.example` a `.env` y ajusta `DATABASE_URL` y `JWT_SECRET`.
2. Crea la base de datos vacía (el servidor crea tablas al arrancar).

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

- El **primer usuario** registrado recibe rol **`admin`** automáticamente.
- Los siguientes son `user`.

## Railway

1. Crea un proyecto en Railway y conecta este repo (GitHub).
2. Añade el plugin **PostgreSQL**; Railway define `DATABASE_URL`.
3. En **Variables** del servicio Node, añade:
   - `JWT_SECRET` — cadena larga y aleatoria (mín. 16 caracteres; recomendado 32+).
4. Deploy: Railway ejecutará `npm install` y `npm start` (ver `package.json`).

La app escucha en `process.env.PORT` y sirve `public/` + API en `/api/*`.

## API (resumen)

| Método | Ruta | Auth |
|--------|------|------|
| POST | `/api/auth/register` | No |
| POST | `/api/auth/login` | No |
| GET | `/api/me` | Bearer JWT |
| POST | `/api/claim` | Bearer |
| POST | `/api/withdrawals` | Bearer |
| POST | `/api/referral` | Bearer |
| GET | `/api/admin/stats` | Admin |
| POST | `/api/admin/approve-withdrawal` | Admin |
| POST | `/api/admin/reject-withdrawal` | Admin |

## Subir a GitHub

```bash
git init
git add .
git commit -m "Pi Faucet: Express + PostgreSQL para Railway"
```

Crea un repositorio vacío en GitHub y enlázalo:

```bash
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git branch -M main
git push -u origin main
```

(Si la carpeta `functions/` antigua no se borró del todo en Windows por archivos bloqueados, puedes eliminarla a mano; está en `.gitignore`.)

## Nota Pi Network

La moneda es simulada. Una integración real requeriría API/pagos externos y revisión de seguridad aparte.
