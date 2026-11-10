import User from '../models/User.js';

// The OTP version of the app made phoneNumber unique for everyone. Google accounts have no phone,
// so a second account without one would clash on "no phone" and sign-in would fail with a 500.
// The model now asks for "unique only when present" indexes, but a database that already has the old
// index keeps it (MongoDB will not change an index of the same name). This drops any old plain
// version once, and builds the right ones. Safe to run again: it only touches indexes that are wrong.
const GUARDED = ['phoneNumber_1', 'googleId_1', 'email_1'];

export const fixLegacyUserIndexes = async () => {
  const dropped = [];
  let existing = [];
  try {
    existing = await User.collection.indexes();
  } catch (error) {
    // The collection does not exist yet: nothing to fix, the model creates the indexes
    if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) throw error;
  }

  for (const index of existing) {
    if (GUARDED.includes(index.name) && !index.partialFilterExpression) {
      await User.collection.dropIndex(index.name);
      dropped.push(index.name);
    }
  }

  // Build the indexes the model asks for (the ones just dropped come back in the right form)
  await User.createIndexes();
  return dropped;
};

export default fixLegacyUserIndexes;
