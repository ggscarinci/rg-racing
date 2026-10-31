import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup } from '../src/backup.mjs';

test('consistent backup includes WAL transactions and never overwrites a previous backup', () => {
  const dir=mkdtempSync(join(tmpdir(),'rg-backup-')),source=join(dir,'source.sqlite'),dest=join(dir,'backup.sqlite');
  const db=new DatabaseSync(source);
  try {
    db.exec('PRAGMA journal_mode=WAL;CREATE TABLE sample(value TEXT);INSERT INTO sample VALUES (\'persisted\');');
    backup(source,dest);
    const restored=new DatabaseSync(dest,{readOnly:true});
    assert.equal(restored.prepare('SELECT value FROM sample').get().value,'persisted');restored.close();
    assert.throws(()=>backup(source,dest),/já existe/);
    assert.throws(()=>backup(join(dir,'missing.sqlite'),join(dir,'other.sqlite')),/não encontrado/);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
