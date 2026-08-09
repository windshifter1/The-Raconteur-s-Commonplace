import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'kobo-dist', 'mockup');

mkdirSync(outDir, { recursive: true });
cpSync(join(__dirname, 'index.html'), join(outDir, 'index.html'));
cpSync(join(__dirname, 'styles.css'), join(outDir, 'styles.css'));
console.log('Wrote kobo-dist/mockup/');
