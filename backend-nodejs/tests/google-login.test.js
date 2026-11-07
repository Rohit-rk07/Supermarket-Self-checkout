import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, clearData, api, makeUser, User, setGoogleVerifier } from '../test-support/setup.js';

before(start);
after(stop);

// A fake Google: the "credential" the browser sends is looked up here instead of asking Google
const accounts = new Map();
const google = (sub, email, extra = {}) => {
  const credential = `fake-credential-${sub}-${'x'.repeat(30)}`;
  accounts.set(credential, { sub, email, email_verified: true, name: `Person ${sub}`, picture: 'https://example.com/p.png', ...extra });
  return credential;
};
const signIn = (credential) => api('POST', '/api/auth/google', { body: { credential } });

beforeEach(async () => {
  await clearData();
  accounts.clear();
  setGoogleVerifier(async (credential) => {
    if (!accounts.has(credential)) throw new Error('not a real Google token');
    return accounts.get(credential);
  });
});

describe('Google sign-in', () => {
  test('a first-time visitor becomes a customer and gets a working token', async () => {
    const res = await signIn(google('1', 'Ana@Example.com'));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'customer');
    assert.equal(res.body.data.user.email, 'ana@example.com');
    assert.equal(res.body.data.user.name, 'Person 1');

    const profile = await api('GET', '/api/auth/profile', { token: res.body.data.token });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.email, 'ana@example.com');
  });

  test('signing in again uses the same account, and keeps a name the person changed', async () => {
    const credential = google('2', 'bo@example.com');
    const first = await signIn(credential);
    await api('PUT', '/api/auth/profile', { token: first.body.data.token, body: { name: 'Bo Renamed' } });
    const second = await signIn(credential);
    assert.equal(second.body.data.user._id, first.body.data.user._id);
    assert.equal(second.body.data.user.name, 'Bo Renamed');
    assert.equal(await User.countDocuments({ email: 'bo@example.com' }), 1);
  });

  test('an email listed in ADMIN_EMAILS becomes admin, whatever the capital letters', async () => {
    const res = await signIn(google('3', 'BOSS@example.com'));
    assert.equal(res.body.data.user.role, 'admin');
  });

  test('an old account with the same email is linked, and keeps its role and phone number', async () => {
    await User.create({ email: 'legacy@example.com', name: 'Old Staff', role: 'staff', phoneNumber: '+919800000001', isPhoneVerified: true });
    const res = await signIn(google('4', 'legacy@example.com'));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'staff');
    assert.equal(res.body.data.user.phoneNumber, '+919800000001');
    assert.equal(await User.countDocuments({ email: 'legacy@example.com' }), 1);
    assert.equal((await User.findOne({ email: 'legacy@example.com' })).googleId, '4');
  });

  test('a token Google did not issue, a missing credential, or an unverified email are refused', async () => {
    assert.equal((await signIn('not-a-real-token-but-long-enough-to-pass-the-check')).status, 401);
    assert.equal((await api('POST', '/api/auth/google', { body: {} })).status, 400);
    const unverified = await signIn(google('5', 'nope@example.com', { email_verified: false }));
    assert.equal(unverified.status, 401);
    assert.equal(await User.countDocuments({ email: 'nope@example.com' }), 0);
  });

  test('a deactivated account cannot sign in, and its old tokens stop working', async () => {
    const credential = google('6', 'gone@example.com');
    const first = await signIn(credential);
    await User.updateOne({ email: 'gone@example.com' }, { $set: { isActive: false } });

    const again = await signIn(credential);
    assert.equal(again.status, 403);
    assert.equal(again.body.data, undefined);
    assert.equal((await api('GET', '/api/auth/profile', { token: first.body.data.token })).status, 401);
  });

  test('the sign-in screen can ask which client id to use, and a server without one says so', async () => {
    const config = await api('GET', '/api/auth/config');
    assert.equal(config.body.data.googleClientId, process.env.GOOGLE_CLIENT_ID);

    const saved = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    assert.equal((await signIn(google('7', 'x@example.com'))).status, 503);
    process.env.GOOGLE_CLIENT_ID = saved;
  });

  test('the old phone sign-in routes are gone', async () => {
    assert.equal((await api('POST', '/api/auth/phone/send-otp', { body: { phoneNumber: '+919800000000' } })).status, 404);
    assert.equal((await api('POST', '/api/auth/phone/verify-otp', { body: { phoneNumber: '+919800000000', otp: '123456' } })).status, 404);
    assert.equal((await api('POST', '/api/auth/demo-login')).status, 404);
  });
});

describe('profile and roles after the switch', () => {
  test('a person can edit their name and add a contact number, but not their email', async () => {
    const { token } = await makeUser();
    const res = await api('PUT', '/api/auth/profile', { token, body: { name: 'New Name', phoneNumber: '+919811111111', email: 'hacker@example.com' } });
    // The email is not an allowed field, so the request is refused outright
    assert.equal(res.status, 400);

    const ok = await api('PUT', '/api/auth/profile', { token, body: { name: 'New Name', phoneNumber: '+919811111111' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.phoneNumber, '+919811111111');
    const removed = await api('PUT', '/api/auth/profile', { token, body: { phoneNumber: '' } });
    assert.equal(removed.body.data.phoneNumber, undefined);
  });

  test('two people cannot use the same contact number', async () => {
    const one = await makeUser();
    const two = await makeUser();
    await api('PUT', '/api/auth/profile', { token: one.token, body: { phoneNumber: '+919822222222' } });
    const clash = await api('PUT', '/api/auth/profile', { token: two.token, body: { phoneNumber: '+919822222222' } });
    assert.equal(clash.status, 409);
  });

  test('an admin can make someone staff, but admins are only made through ADMIN_EMAILS', async () => {
    const admin = await makeUser('admin');
    const customer = await makeUser();
    const other = await makeUser('admin');

    assert.equal((await api('PUT', `/api/v1/users/${customer.user._id}/role`, { token: admin.token, body: { role: 'staff' } })).status, 200);
    assert.equal((await api('PUT', `/api/v1/users/${customer.user._id}/role`, { token: admin.token, body: { role: 'admin' } })).status, 400);
    assert.equal((await api('PUT', `/api/v1/users/${other.user._id}/role`, { token: admin.token, body: { role: 'customer' } })).status, 400);
    assert.equal((await User.findById(other.user._id)).role, 'admin');
  });

  test('the staff list finds people by email', async () => {
    const admin = await makeUser('admin');
    await signIn(google('8', 'findme@example.com'));
    const list = await api('GET', '/api/v1/users?search=findme', { token: admin.token });
    assert.equal(list.body.data.users.length, 1);
  });
});
