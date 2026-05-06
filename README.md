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

1. Crea un proyecto y despliega este repo (GitHub) como servicio **Node**.
2. Añade **PostgreSQL** (botón **+ New** → **Database** → **PostgreSQL**).
3. **Importante:** `DATABASE_URL` se crea en el servicio **Postgres**, no en el web. Debes **referenciarla** en tu app:
   - Abre tu servicio **web** (el Node) → pestaña **Variables**.
   - **+ New Variable** → **Add Reference** (o «Variable Reference»).
   - Elige el servicio **Postgres** y la variable **`DATABASE_URL`**.
   - Guarda (quedará algo como `${{ Postgres.DATABASE_URL }}` según el nombre del servicio).
4. En el mismo servicio web, añade una variable normal **`JWT_SECRET`**: una cadena aleatoria larga (mín. 16 caracteres, mejor 32+).
5. Redeploy si hace falta.

La app usa `PORT` automáticamente y sirve `public/` + `/api/*`.

Si sigue diciendo «Falta DATABASE_URL», casi siempre es porque falta el **reference** del Postgres en el servicio web, no porque no exista la base.

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
