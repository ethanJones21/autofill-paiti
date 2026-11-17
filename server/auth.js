const crypto = require('crypto');

// Formato guardado: "scrypt$<sal hex>$<hash hex>"
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const got = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(got, expected);
}

module.exports = { hashPassword, verifyPassword };
