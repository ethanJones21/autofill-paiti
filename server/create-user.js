// Uso: node create-user.js <usuario> <contraseña>
// Crea el usuario, o cambia su contraseña si ya existe.
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { hashPassword } = require('./auth');

(async () => {
  const username = String(process.argv[2] || '').trim().toLowerCase();
  const password = String(process.argv[3] || '');
  if (!username || !password) {
    console.error('Uso: node create-user.js <usuario> <contraseña>');
    process.exit(1);
  }
  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://localhost:27017');
  const users = client.db(process.env.DB_NAME || 'autofill_paiti').collection('users');
  await users.createIndex({ username: 1 }, { unique: true });
  const r = await users.updateOne(
    { username },
    { $set: { passwordHash: hashPassword(password) }, $setOnInsert: { username, createdAt: new Date() } },
    { upsert: true }
  );
  console.log(r.upsertedCount ? 'Usuario creado: ' + username : 'Contraseña actualizada: ' + username);
  await client.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
