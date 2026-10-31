import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function backup(source, destination) {
  if (!existsSync(source)) throw new Error('Banco de origem não encontrado.');
  if (existsSync(destination)) throw new Error('O arquivo de destino já existe. Use um nome novo.');
  const db = new DatabaseSync(source, { readOnly: true });
  try { db.prepare('VACUUM INTO ?').run(resolve(destination)); }
  finally { db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [source,destination] = process.argv.slice(2);
    if (!source || !destination) throw new Error('Uso: node src/backup.mjs banco.sqlite copia.sqlite');
    backup(source,destination); console.log('Backup consistente criado. Copie-o para armazenamento externo protegido.');
  } catch(error) { console.error(error.message);process.exit(1); }
}
