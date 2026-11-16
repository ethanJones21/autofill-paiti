require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'autofill_paiti';
const API_KEY = process.env.API_KEY || '';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Sin clave: sirve para comprobar desde el navegador que el servidor está arriba
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Clave compartida opcional (si se define API_KEY en .env)
app.use((req, res, next) => {
  if (API_KEY && req.get('x-api-key') !== API_KEY) return res.status(401).send('API key inválida');
  next();
});

let forms;
let flows;

app.get('/api/flows', async (req, res) => {
  const user = String(req.query.user || '').trim();
  if (!user) return res.status(400).send('Falta user');
  res.json(await flows.find({ user }).toArray());
});

app.post('/api/flows', async (req, res) => {
  const { user, name, page, steps } = req.body || {};
  if (!user || !name || !Array.isArray(steps)) return res.status(400).send('Datos incompletos');
  await flows.updateOne(
    { user, name },
    { $set: { user, name, page: page || '', steps, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

app.delete('/api/flows/:id', async (req, res) => {
  const user = String(req.query.user || '').trim();
  const r = await flows.deleteOne({ _id: new ObjectId(req.params.id), user });
  res.json({ deleted: r.deletedCount });
});

app.get('/api/forms', async (req, res) => {
  const user = String(req.query.user || '').trim();
  if (!user) return res.status(400).send('Falta user');
  res.json(await forms.find({ user }).toArray());
});

// Crea o actualiza por (user, name)
app.post('/api/forms', async (req, res) => {
  const { user, name, page, fields, button, records } = req.body || {};
  if (!user || !name || !Array.isArray(fields)) return res.status(400).send('Datos incompletos');
  await forms.updateOne(
    { user, name },
    { $set: { user, name, page: page || '', fields, button: button || null, records: Array.isArray(records) ? records : [], updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

app.delete('/api/forms/:id', async (req, res) => {
  const user = String(req.query.user || '').trim();
  const r = await forms.deleteOne({ _id: new ObjectId(req.params.id), user });
  res.json({ deleted: r.deletedCount });
});

MongoClient.connect(MONGO_URI).then(async (client) => {
  forms = client.db(DB_NAME).collection('forms');
  await forms.createIndex({ user: 1, name: 1 }, { unique: true });
  flows = client.db(DB_NAME).collection('flows');
  await flows.createIndex({ user: 1, name: 1 }, { unique: true });
  app.listen(PORT, () => console.log('Servidor en http://localhost:' + PORT + ' · DB ' + DB_NAME));
}).catch((e) => {
  console.error('No se pudo conectar a Mongo:', e.message);
  process.exit(1);
});
