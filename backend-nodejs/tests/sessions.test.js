import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { start, stop, clearData, makeUser, api, User } from '../test-support/setup.js';
import { generateJWT } from '../app/middleware/auth.js';

before(start);
after(stop);
beforeEach(clearData);

describe('sign out of all devices (item 13)', () => {
  test('tokens now carry a version and expire in a day by default', async () => {
    const { user } = await makeUser();
    const configured = process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_EXPIRES_IN; // test the built-in default, whatever .env says
    const decoded = jwt.decode(generateJWT(String(user._id), 0));
    if (configured !== undefined) process.env.JWT_EXPIRES_IN = configured;
    assert.equal(decoded.tv, 0);
    const lifetimeHours = (decoded.exp - decoded.iat) / 3600;
    assert.ok(lifetimeHours <= 24, `lasted ${lifetimeHours}h`);
  });

  test('signing out everywhere cancels every earlier token, but a new sign-in works', async () => {
    const { user, token } = await makeUser();
    const secondDevice = generateJWT(String(user._id), 0);
    assert.equal((await api('GET', '/api/auth/profile', { token })).status, 200);
    assert.equal((await api('GET', '/api/auth/profile', { token: secondDevice })).status, 200);

    assert.equal((await api('POST', '/api/auth/logout-all', { token })).status, 200);

    assert.equal((await api('GET', '/api/auth/profile', { token })).status, 401);
    assert.equal((await api('GET', '/api/auth/profile', { token: secondDevice })).status, 401);

    const fresh = generateJWT(String(user._id), (await User.findById(user._id)).tokenVersion);
    assert.equal((await api('GET', '/api/auth/profile', { token: fresh })).status, 200);
  });

  test('it only affects the person who asked', async () => {
    const one = await makeUser();
    const two = await makeUser();
    await api('POST', '/api/auth/logout-all', { token: one.token });
    assert.equal((await api('GET', '/api/auth/profile', { token: two.token })).status, 200);
  });

  test('you must be signed in to use it', async () => {
    assert.equal((await api('POST', '/api/auth/logout-all')).status, 401);
  });

  test('old tokens made before versions existed still work until the user signs out everywhere', async () => {
    const { user } = await makeUser();
    const legacy = jwt.sign({ userId: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await api('GET', '/api/auth/profile', { token: legacy })).status, 200);
  });
});
