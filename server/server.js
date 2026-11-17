require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const { verifyPassword } = require('./auth');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'autofill_paiti';
const TOKEN_SECRET = process.env.TOKEN_SECRET || '';
const TOKEN_DAYS = 30;

if (!TOKEN_SECRET) {
  console.error('Falta TOKEN_SECRET en .env (cualquier texto largo y aleatorio).');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---------- Token firmado (HMAC), sin dependencias ----------
const b64 = (b) => Buffer.from(b).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');

function makeToken(user) {
  const body = b64(JSON.stringify({ id: String(user._id), u: user.username, exp: Date.now() + TOKEN_DAYS * 864e5 }));
  return body + '.' + sign(body);
}

function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? { id: p.id, username: p.u } : null;
  } catch {
    return null;
  }
}

// Pone req.user si viene un token válido; no bloquea (los flujos públicos se ven sin sesión)
app.use((req, res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  req.user = m ? readToken(m[1]) : null;
  next();
});

const needUser = (req, res, next) => (req.user ? next() : res.status(401).send('Inicia sesión primero'));
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    if (e && e.code === 11000) return res.status(409).send('Ya tienes un flujo con ese nombre');
    console.error(e);
    res.status(500).send('Error del servidor');
  });

let users;
let flows;

// Valida y limpia lo que llega del cliente
function parseFlow(body) {
  const { name, page, steps, visibility } = body || {};
  if (!String(name || '').trim() || !Array.isArray(steps) || !steps.length) return null;
  return {
    name: String(name).trim().slice(0, 120),
    page: String(page || ''),
    steps,
    visibility: visibility === 'public' ? 'public' : 'private',
  };
}

const oid = (s) => (ObjectId.isValid(s) ? new ObjectId(s) : null);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/login', wrap(async (req, res) => {
  const username = String((req.body || {}).username || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const user = username && (await users.findOne({ username }));
  // Mismo mensaje para usuario inexistente y clave errónea
  if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).send('Usuario o contraseña incorrectos');
  res.json({ token: makeToken(user), username: user.username });
}));

// Públicos (cualquiera) + propios (si hay sesión)
app.get('/api/flows', wrap(async (req, res) => {
  const me = req.user ? oid(req.user.id) : null;
  const filter = me ? { $or: [{ ownerId: me }, { visibility: 'public' }] } : { visibility: 'public' };
  const list = await flows.find(filter).sort({ name: 1 }).toArray();
  res.json(list.map((f) => ({ ...f, mine: !!me && String(f.ownerId) === String(me) })));
}));

app.post('/api/flows', needUser, wrap(async (req, res) => {
  const f = parseFlow(req.body);
  if (!f) return res.status(400).send('Datos incompletos');
  const now = new Date();
  const doc = { ...f, ownerId: oid(req.user.id), owner: req.user.username, createdAt: now, updatedAt: now };
  const r = await flows.insertOne(doc);
  res.json({ ok: true, id: r.insertedId });
}));

// Editar: solo el dueño
app.put('/api/flows/:id', needUser, wrap(async (req, res) => {
  const id = oid(req.params.id);
  const f = parseFlow(req.body);
  if (!id || !f) return res.status(400).send('Datos incompletos');
  const r = await flows.updateOne({ _id: id, ownerId: oid(req.user.id) }, { $set: { ...f, updatedAt: new Date() } });
  if (!r.matchedCount) return res.status(404).send('Flujo no encontrado o no es tuyo');
  res.json({ ok: true });
}));

// Clonar un flujo propio o público: la copia es privada y queda a nombre de quien clona
app.post('/api/flows/:id/clone', needUser, wrap(async (req, res) => {
  const id = oid(req.params.id);
  const me = oid(req.user.id);
  const src = id && (await flows.findOne({ _id: id, $or: [{ ownerId: me }, { visibility: 'public' }] }));
  if (!src) return res.status(404).send('Flujo no encontrado');
  let name = src.name + ' (copia)';
  for (let n = 2; await flows.findOne({ ownerId: me, name }); n++) name = src.name + ' (copia ' + n + ')';
  const now = new Date();
  const r = await flows.insertOne({
    name,
    page: src.page,
    steps: src.steps,
    visibility: 'private',
    ownerId: me,
    owner: req.user.username,
    createdAt: now,
    updatedAt: now,
  });
  res.json({ ok: true, id: r.insertedId, name });
}));

app.delete('/api/flows/:id', needUser, wrap(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).send('Id inválido');
  const r = await flows.deleteOne({ _id: id, ownerId: oid(req.user.id) });
  res.json({ deleted: r.deletedCount });
}));

MongoClient.connect(MONGO_URI).then(async (client) => {
  const db = client.db(DB_NAME);
  users = db.collection('users');
  flows = db.collection('flows');
  await users.createIndex({ username: 1 }, { unique: true });
  // El índice anterior era por (user, name); estorba con el modelo nuevo
  await flows.dropIndex('user_1_name_1').catch(() => {});
  await flows.createIndex({ ownerId: 1, name: 1 }, { unique: true, partialFilterExpression: { ownerId: { $exists: true } } });
  await flows.createIndex({ visibility: 1 });
  app.listen(PORT, () => console.log('Servidor en http://localhost:' + PORT + ' · DB ' + DB_NAME));
}).catch((e) => {
  console.error('No se pudo conectar a Mongo:', e.message);
  process.exit(1);
});
