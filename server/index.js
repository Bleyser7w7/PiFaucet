/**
 * Pi Faucet — API Express + PostgreSQL (Railway).
 * Sirve la carpeta public/ y la API bajo /api.
 */

require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, migrate, getDatabaseUrl } = require('./db');

const CLAIM_COOLDOWN_MS = 10 * 60 * 1000;
const REWARD_MIN = 0.01;
const REWARD_MAX = 0.05;
const MIN_WITHDRAWAL_PI = 1;
const REFERRAL_BONUS_REFERRED = 0.05;
const REFERRAL_BONUS_REFERRER = 0.02;

const onRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const isProd = process.env.NODE_ENV === 'production' || onRailway;

/**
 * Secreto JWT: variable JWT_SECRET (recomendado) o, en Railway con DB ya enlazada,
 * derivación estable desde la URL de Postgres para que el servicio arranque sin paso extra.
 */
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && String(fromEnv).trim().length >= 16) {
    return String(fromEnv).trim();
  }
  if (onRailway) {
    const dbUrl = getDatabaseUrl();
    if (dbUrl) {
      console.warn(
          '[JWT] Sin JWT_SECRET en Variables: usando secreto derivado de DATABASE_URL. ' +
          'Opcional: añade JWT_SECRET (32+ caracteres aleatorios) para rotarlo sin tocar la DB.',
      );
      return crypto.createHash('sha256').update('pi-faucet:jwt:v1:' + dbUrl).digest('hex');
    }
    console.error(
        'Railway: falta DATABASE_URL (referencia al Postgres) y JWT_SECRET. ' +
        'Configura al menos una de las dos en el servicio web.',
    );
    process.exit(1);
  }
  if (!isProd) {
    return fromEnv && String(fromEnv).trim().length > 0 ?
      String(fromEnv).trim() :
      'dev-only-secret-change-me';
  }
  console.error(
      'Define JWT_SECRET (mín. 16 caracteres), por ejemplo en Variables de Railway.',
  );
  process.exit(1);
}

const jwtSecret = resolveJwtSecret();

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

function roundPi(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

function randomReward(min, max) {
  return roundPi(min + Math.random() * (max - min));
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function isUuid(s) {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  );
}

function signToken(user) {
  return jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      jwtSecret,
      { expiresIn: '7d' },
  );
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Debes iniciar sesión.', code: 'unauthenticated' });
  }
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET || 'dev-only-secret-change-me');
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.', code: 'unauthenticated' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Solo administradores pueden realizar esta acción.',
      code: 'permission-denied',
    });
  }
  next();
}

async function logActivity(action, userId, meta) {
  try {
    await pool.query(
        'INSERT INTO activity_logs (action, user_id, meta) VALUES ($1, $2, $3)',
        [action, userId, meta || null],
    );
  } catch (e) {
    console.error('logActivity', e);
  }
}

async function mapUserRow(row) {
  if (!row) return null;
  return {
    uid: row.id,
    email: row.email,
    balance: roundPi(row.balance),
    lastClaim: row.last_claim_at ? new Date(row.last_claim_at).getTime() : null,
    role: row.role || 'user',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
  };
}

// --- Auth ---

app.post('/api/auth/register', async (req, res) => {
  const email = (req.body.email && String(req.body.email).trim().toLowerCase()) || '';
  const password = req.body.password || '';
  const referrerUid = (req.body.referrerUid && String(req.body.referrerUid).trim()) || null;

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email y contraseña (mín. 6) requeridos.', code: 'invalid-argument' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cnt = await client.query('SELECT COUNT(*)::int AS c FROM users');
    const isFirstUser = cnt.rows[0].c === 0;
    const role = isFirstUser ? 'admin' : 'user';

    const hash = await bcrypt.hash(password, 10);
    let referredBy = null;
    if (referrerUid && isUuid(referrerUid)) {
      const ref = await client.query('SELECT id FROM users WHERE id = $1', [referrerUid]);
      if (ref.rows.length && ref.rows[0].id) {
        referredBy = ref.rows[0].id;
      }
    }

    const ins = await client.query(
        `INSERT INTO users (email, password_hash, role, referred_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, role, balance, last_claim_at, created_at`,
        [email, hash, role, referredBy],
    );
    const newUser = ins.rows[0];

    if (referredBy && referredBy !== newUser.id) {
      await client.query(
          `UPDATE users SET balance = balance + $1 WHERE id = $2`,
          [REFERRAL_BONUS_REFERRER, referredBy],
      );
      await client.query(
          `UPDATE users SET balance = balance + $1 WHERE id = $2`,
          [REFERRAL_BONUS_REFERRED, newUser.id],
      );
    }

    await client.query('COMMIT');
    await logActivity('user_register', newUser.id, { email: newUser.email });

    const fresh = await pool.query(
        `SELECT id, email, role, balance, last_claim_at, created_at FROM users WHERE id = $1`,
        [newUser.id],
    );
    const row = fresh.rows[0];
    const token = signToken({ id: row.id, role: row.role, email: row.email });
    return res.json({ token, user: await mapUserRow(row) });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return res.status(400).json({ error: 'Ese email ya está registrado.', code: 'already-exists' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Error al registrar.', code: 'internal' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = (req.body.email && String(req.body.email).trim().toLowerCase()) || '';
  const password = req.body.password || '';
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos.', code: 'invalid-argument' });
  }
  const r = await pool.query(
      'SELECT id, email, password_hash, role, balance, last_claim_at, created_at FROM users WHERE email = $1',
      [email],
  );
  if (!r.rows.length) {
    return res.status(401).json({ error: 'Credenciales incorrectas.', code: 'unauthenticated' });
  }
  const row = r.rows[0];
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales incorrectas.', code: 'unauthenticated' });
  }
  const token = signToken({ id: row.id, role: row.role, email: row.email });
  return res.json({ token, user: await mapUserRow(row) });
});

// --- apply referral after register (si no se aplicó en el mismo request) ---
app.post('/api/referral', requireAuth, async (req, res) => {
  const referrerUid = req.body.referrerUid;
  if (
    !referrerUid ||
    typeof referrerUid !== 'string' ||
    referrerUid === req.user.id ||
    !isUuid(referrerUid)
  ) {
    return res.status(400).json({ error: 'Código de referido inválido.', code: 'invalid-argument' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(
        'SELECT id, referred_by, balance FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id],
    );
    const r = await client.query('SELECT id, balance FROM users WHERE id = $1 FOR UPDATE', [referrerUid]);
    if (!u.rows.length || !r.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado.', code: 'not-found' });
    }
    if (u.rows[0].referred_by) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya tienes un referidor asignado.', code: 'already-exists' });
    }
    await client.query(
        `UPDATE users SET referred_by = $1, balance = balance + $2 WHERE id = $3`,
        [referrerUid, REFERRAL_BONUS_REFERRED, req.user.id],
    );
    await client.query(
        `UPDATE users SET balance = balance + $1 WHERE id = $2`,
        [REFERRAL_BONUS_REFERRER, referrerUid],
    );
    await client.query('COMMIT');
    await logActivity('referral_applied', req.user.id, { referrerUid });
    return res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Error al aplicar referido.', code: 'internal' });
  } finally {
    client.release();
  }
});

// --- getUserData ---
app.get('/api/me', requireAuth, async (req, res) => {
  const u = await pool.query(
      'SELECT id, email, balance, last_claim_at, role, created_at FROM users WHERE id = $1',
      [req.user.id],
  );
  if (!u.rows.length) {
    return res.status(404).json({ error: 'Perfil no encontrado.', code: 'not-found' });
  }
  const row = u.rows[0];
  const claimsR = await pool.query(
      `SELECT id, amount, ip, created_at FROM claims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id],
  );
  const claims = claimsR.rows.map((c) => ({
    id: c.id,
    amount: roundPi(c.amount),
    timestamp: new Date(c.created_at).getTime(),
    ip: c.ip,
  }));
  const wdR = await pool.query(
      `SELECT id, pi_username, amount, status, created_at, processed_at
       FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.user.id],
  );
  const withdrawals = wdR.rows.map((w) => ({
    id: w.id,
    amount: roundPi(w.amount),
    piUsername: w.pi_username,
    status: w.status,
    createdAt: new Date(w.created_at).getTime(),
    processedAt: w.processed_at ? new Date(w.processed_at).getTime() : null,
  }));

  return res.json({
    ...(await mapUserRow(row)),
    claims,
    withdrawals,
    claimCooldownMs: CLAIM_COOLDOWN_MS,
    minWithdrawalPi: MIN_WITHDRAWAL_PI,
  });
});

// --- claim ---
app.post('/api/claim', requireAuth, async (req, res) => {
  if (req.body.hp && String(req.body.hp).length > 0) {
    return res.status(400).json({ error: 'Solicitud no válida.', code: 'failed-precondition' });
  }
  const uid = req.user.id;
  const ip = getClientIp(req);
  const ipKey = ip.replace(/\//g, '_').substring(0, 200) || 'unknown';
  const now = Date.now();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userR = await client.query(
        'SELECT id, balance, last_claim_at FROM users WHERE id = $1 FOR UPDATE',
        [uid],
    );
    if (!userR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado.', code: 'not-found' });
    }
    const user = userR.rows[0];
    if (user.last_claim_at) {
      const elapsed = now - new Date(user.last_claim_at).getTime();
      if (elapsed < CLAIM_COOLDOWN_MS) {
        const wait = CLAIM_COOLDOWN_MS - elapsed;
        await client.query('ROLLBACK');
        return res.status(429).json({
          error: `Espera ${Math.ceil(wait / 1000)} segundos para volver a reclamar.`,
          code: 'resource-exhausted',
          details: { retryAfterMs: wait },
        });
      }
    }

    const ipR = await client.query(
        'SELECT last_claim_at FROM ip_cooldowns WHERE ip_key = $1 FOR UPDATE',
        [ipKey],
    );
    if (ipR.rows.length) {
      const elapsedIp = now - new Date(ipR.rows[0].last_claim_at).getTime();
      if (elapsedIp < CLAIM_COOLDOWN_MS) {
        const waitIp = CLAIM_COOLDOWN_MS - elapsedIp;
        await client.query('ROLLBACK');
        return res.status(429).json({
          error: `Esta red/IP debe esperar ${Math.ceil(waitIp / 1000)} segundos.`,
          code: 'resource-exhausted',
          details: { retryAfterMs: waitIp },
        });
      }
    }

    const reward = randomReward(REWARD_MIN, REWARD_MAX);
    const newBalance = roundPi(Number(user.balance) + reward);

    const claimIns = await client.query(
        `INSERT INTO claims (user_id, amount, ip) VALUES ($1, $2, $3) RETURNING id`,
        [uid, reward, ip],
    );
    await client.query(
        `UPDATE users SET balance = $1, last_claim_at = NOW() WHERE id = $2`,
        [newBalance, uid],
    );
    await client.query(
        `INSERT INTO ip_cooldowns (ip_key, last_claim_at, last_user_id)
         VALUES ($1, NOW(), $2)
         ON CONFLICT (ip_key) DO UPDATE SET last_claim_at = NOW(), last_user_id = $2`,
        [ipKey, uid],
    );

    await client.query('COMMIT');
    await logActivity('claim', uid, { amount: reward, ip });
    return res.json({
      reward,
      balance: newBalance,
      claimId: claimIns.rows[0].id,
      nextClaimAt: Date.now() + CLAIM_COOLDOWN_MS,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Error al reclamar.', code: 'internal' });
  } finally {
    client.release();
  }
});

// --- withdrawal request ---
app.post('/api/withdrawals', requireAuth, async (req, res) => {
  const piUsername = (req.body.piUsername && String(req.body.piUsername).trim()) || '';
  const amount = roundPi(Number(req.body.amount));
  if (!piUsername || piUsername.length < 2) {
    return res.status(400).json({ error: 'Username de Pi inválido.', code: 'invalid-argument' });
  }
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_PI) {
    return res.status(400).json({
      error: `La cantidad mínima es ${MIN_WITHDRAWAL_PI} Pi.`,
      code: 'invalid-argument',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userR = await client.query(
        'SELECT id, balance FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id],
    );
    if (!userR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado.', code: 'not-found' });
    }
    const balance = roundPi(userR.rows[0].balance);
    const pendR = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS s FROM withdrawals
         WHERE user_id = $1 AND status = 'pending'`,
        [req.user.id],
    );
    const pending = roundPi(pendR.rows[0].s);
    const available = roundPi(balance - pending);
    if (amount > available) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Saldo insuficiente (considerando retiros pendientes).',
        code: 'failed-precondition',
        details: { balance, pending, available },
      });
    }
    await client.query(
        `INSERT INTO withdrawals (user_id, pi_username, amount, status)
         VALUES ($1, $2, $3, 'pending')`,
        [req.user.id, piUsername, amount],
    );
    await client.query('COMMIT');
    await logActivity('withdrawal_request', req.user.id, { piUsername, amount });
    return res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Error al crear retiro.', code: 'internal' });
  } finally {
    client.release();
  }
});

// --- admin ---
app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  const usersR = await pool.query(
      `SELECT id, email, balance, role, created_at FROM users ORDER BY created_at ASC`,
  );
  const users = usersR.rows.map((x) => ({
    uid: x.id,
    email: x.email,
    balance: roundPi(x.balance),
    role: x.role,
    createdAt: new Date(x.created_at).getTime(),
  }));
  const sumR = await pool.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS s FROM claims`);
  const totalPiDelivered = roundPi(sumR.rows[0].s);
  const pendR = await pool.query(
      `SELECT id, user_id, pi_username, amount, status, created_at
       FROM withdrawals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100`,
  );
  const pendingWithdrawals = pendR.rows.map((w) => ({
    id: w.id,
    userId: w.user_id,
    piUsername: w.pi_username,
    amount: roundPi(w.amount),
    status: w.status,
    createdAt: new Date(w.created_at).getTime(),
  }));
  return res.json({
    totalUsers: users.length,
    totalPiDelivered,
    pendingWithdrawalsCount: pendingWithdrawals.length,
    users,
    pendingWithdrawals,
  });
});

app.post('/api/admin/approve-withdrawal', requireAuth, requireAdmin, async (req, res) => {
  const withdrawalId = req.body.withdrawalId;
  if (!withdrawalId) {
    return res.status(400).json({ error: 'withdrawalId requerido.', code: 'invalid-argument' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wR = await client.query(
        `SELECT id, user_id, amount, status FROM withdrawals WHERE id = $1 FOR UPDATE`,
        [withdrawalId],
    );
    if (!wR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Retiro no encontrado.', code: 'not-found' });
    }
    const w = wR.rows[0];
    if (w.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El retiro ya fue procesado.', code: 'failed-precondition' });
    }
    const uR = await client.query(
        'SELECT id, balance FROM users WHERE id = $1 FOR UPDATE',
        [w.user_id],
    );
    if (!uR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado.', code: 'not-found' });
    }
    const balance = roundPi(uR.rows[0].balance);
    const amt = roundPi(w.amount);
    if (balance < amt) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Saldo insuficiente para aprobar.', code: 'failed-precondition' });
    }
    await client.query(`UPDATE users SET balance = $1 WHERE id = $2`, [roundPi(balance - amt), w.user_id]);
    await client.query(
        `UPDATE withdrawals SET status = 'approved', processed_at = NOW() WHERE id = $1`,
        [withdrawalId],
    );
    await client.query('COMMIT');
    await logActivity('withdrawal_approved', req.user.id, { withdrawalId });
    return res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Error al aprobar.', code: 'internal' });
  } finally {
    client.release();
  }
});

app.post('/api/admin/reject-withdrawal', requireAuth, requireAdmin, async (req, res) => {
  const withdrawalId = req.body.withdrawalId;
  if (!withdrawalId) {
    return res.status(400).json({ error: 'withdrawalId requerido.', code: 'invalid-argument' });
  }
  const wR = await pool.query(`SELECT status FROM withdrawals WHERE id = $1`, [withdrawalId]);
  if (!wR.rows.length) {
    return res.status(404).json({ error: 'Retiro no encontrado.', code: 'not-found' });
  }
  if (wR.rows[0].status !== 'pending') {
    return res.status(400).json({ error: 'El retiro ya fue procesado.', code: 'failed-precondition' });
  }
  await pool.query(
      `UPDATE withdrawals SET status = 'rejected', processed_at = NOW() WHERE id = $1`,
      [withdrawalId],
  );
  await logActivity('withdrawal_rejected', req.user.id, { withdrawalId });
  return res.json({ ok: true });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

async function main() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.error(
        'Falta conexión a PostgreSQL (DATABASE_URL o variables PG*).\n' +
        '  Local: copia .env.example a .env y define DATABASE_URL.\n' +
        '  Railway: en el servicio WEB (Node) → Variables → «+ New Variable» →\n' +
        '    «Variable Reference» → elige tu servicio Postgres → DATABASE_URL.\n' +
        '  O crea Postgres desde el mismo proyecto y vincúlalo al servicio web.',
    );
    process.exit(1);
  }
  await migrate();
  app.listen(PORT, () => {
    console.log(`Pi Faucet API en http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
