import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

async function main() {
  try { process.loadEnvFile('.env.local'); } catch { /* CI can supply environment directly. */ }
  const { addVoiceReply, readVoiceReplies } = await import('../lib/os/voice-inbox-store');
  const { getAccountingDb } = await import('../lib/accounting/db');
  const db = getAccountingDb();
  if (process.argv[2] === '--read') {
    try {
      const [, , , key, id, since] = process.argv;
      const rows = await readVoiceReplies(key, Number(since));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, id);
      assert.equal(rows[0].message, 'Reliability test');
      assert.equal(rows[0].agent, 'bjorn');
      assert.deepEqual(rows[0].images, ['https://example.com/test.png']);
      assert.deepEqual(await readVoiceReplies(key + '-other-owner', 0), []);
      assert.deepEqual(await readVoiceReplies(key, rows[0].timestamp + 1), []);
    } finally { await db.$disconnect(); }
    return;
  }
  const key = `voice-test-${randomUUID()}`;
  try {
    const item = await addVoiceReply(key, {message:'Reliability test',agent:'Björn',images:['https://example.com/test.png'],imageUrls:['https://example.com/test.png']});
    const require = createRequire(import.meta.url);
    execFileSync(process.execPath, [require.resolve('tsx/cli'), fileURLToPath(import.meta.url), '--read', key, item.id, String(item.timestamp)], {stdio:'inherit',windowsHide:true});
    console.log('PASS: persisted reply read from another process, owner isolation, inclusive cursor, specialist identity and image deduplication.');
  } finally {
    await db.companyVoiceReply.deleteMany({where:{ownerHash:createHash('sha256').update(key).digest('hex')}});
    await db.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode=1; });
