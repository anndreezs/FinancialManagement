const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
} = require('../config/auth');

test('hashing and password comparison works correctly', async () => {
  const plainPassword = 'minhasenhasegura123';
  const hashed = await hashPassword(plainPassword);

  assert.notEqual(hashed, plainPassword);
  assert.equal(typeof hashed, 'string');

  const matches = await comparePassword(plainPassword, hashed);
  assert.equal(matches, true);

  const wrongMatches = await comparePassword('senhaerrada', hashed);
  assert.equal(wrongMatches, false);
});

test('JWT token generation and verification returns valid payload', () => {
  const userPayload = {
    id: 42,
    nome: 'André Bastos',
    email: 'andre@exemplo.com',
  };

  const token = generateToken(userPayload);
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 20);

  const decoded = verifyToken(token);
  assert.equal(decoded.id, 42);
  assert.equal(decoded.nome, 'André Bastos');
  assert.equal(decoded.email, 'andre@exemplo.com');
  assert.ok(decoded.exp);
});

test('JWT verification throws on invalid token', () => {
  assert.throws(() => verifyToken('invalid.token.here'));
});
