import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, clearData, User } from '../test-support/setup.js';
import { fixLegacyUserIndexes } from '../app/utils/fixIndexes.js';

before(start);
after(stop);
beforeEach(clearData);

describe('old unique-phone index from the OTP version', () => {
  test('without the repair, a second Google-only account cannot be created', async () => {
    await User.collection.dropIndexes();
    await User.collection.createIndex({ phoneNumber: 1 }, { unique: true, name: 'phoneNumber_1' });

    await User.create({ email: 'a@example.com', googleId: 'g-a', name: 'A' });
    await assert.rejects(() => User.create({ email: 'b@example.com', googleId: 'g-b', name: 'B' }), (error) => error.code === 11000);
  });

  test('the repair drops the old index and lets many accounts have no phone', async () => {
    await User.collection.dropIndexes();
    await User.collection.createIndex({ phoneNumber: 1 }, { unique: true, name: 'phoneNumber_1' });

    const dropped = await fixLegacyUserIndexes();
    assert.deepEqual(dropped, ['phoneNumber_1']);

    await User.create({ email: 'a@example.com', googleId: 'g-a', name: 'A' });
    await User.create({ email: 'b@example.com', googleId: 'g-b', name: 'B' });
    await User.create({ email: 'c@example.com', googleId: 'g-c', name: 'C' });
    assert.equal(await User.countDocuments(), 3);

    // Two people with the same real phone number are still refused
    await User.create({ email: 'd@example.com', googleId: 'g-d', name: 'D', phoneNumber: '+911234567890' });
    await assert.rejects(() => User.create({ email: 'e@example.com', googleId: 'g-e', name: 'E', phoneNumber: '+911234567890' }), (error) => error.code === 11000);
  });

  test('running the repair again changes nothing', async () => {
    await fixLegacyUserIndexes();
    assert.deepEqual(await fixLegacyUserIndexes(), []);
  });
});
