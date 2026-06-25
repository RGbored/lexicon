'use strict';

/**
 * One-shot: turn the migrated single-user progress (currently the frictionless
 * "default" account) into a real named account.
 *
 *   node scripts/claim-account.js <username> <password>
 *
 * After this, the existing progress belongs to <username> (log in to see it) and
 * a fresh, empty "default" account is left for anonymous visitors. Run it once,
 * after deploying. The password is hashed (scrypt) — only the hash is stored.
 */

const db = require('../db');

const [, , username, password] = process.argv;
if (!username || !password) {
  console.error('Usage: node scripts/claim-account.js <username> <password>');
  process.exit(1);
}

db.init(); // ensures tables exist + migrates any legacy progress.json into default first
try {
  const user = db.makeOwnerAccount(username, password);
  console.log(`✓ Progress moved to account "${user.username}". Log in with it to see your data.`);
  console.log('  A fresh empty "default" (guest) account now serves anonymous visitors.');
} catch (e) {
  console.error('✗', e.message);
  process.exit(1);
}
