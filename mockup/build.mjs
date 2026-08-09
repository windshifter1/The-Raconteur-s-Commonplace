import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'kobo-dist');
const base = '/The-Raconteur-s-Commonplace';

function copyMockup(name) {
  const src = join(root, name);
  const out = join(dist, name);
  mkdirSync(out, { recursive: true });
  cpSync(join(src, 'index.html'), join(out, 'index.html'));
  cpSync(join(src, 'styles.css'), join(out, 'styles.css'));
  console.log('Wrote kobo-dist/' + name + '/');
}

copyMockup('mockup1');
copyMockup('mockup2');
copyMockup('mockup3');

const hubOut = join(dist, 'mockup');
mkdirSync(hubOut, { recursive: true });
writeFileSync(
  join(hubOut, 'index.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Catalogue mockups</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14221f;color:#f4f7f6;font-family:Georgia,serif}
main{width:min(28rem,calc(100% - 2rem))}
h1{font-size:1.5rem;margin:0 0 1rem}
a{display:block;color:#f4f7f6;text-decoration:none;padding:.85rem 0;border-top:1px solid rgba(244,247,246,.2)}
a:last-child{border-bottom:1px solid rgba(244,247,246,.2)}
a:hover{color:#c45c26}
span{display:block;font-size:.9rem;opacity:.7;margin-top:.2rem}
</style>
</head>
<body>
<main>
<h1>The Raconteur's Commonplace</h1>
<a href="${base}/mockup1/">Mockup 1 <span>Cozy &amp; stylized catalogue</span></a>
<a href="${base}/mockup2/">Mockup 2 <span>Pixel-art library room</span></a>
<a href="${base}/mockup3/">Mockup 3 <span>Soft shelves (storybook-inspired)</span></a>
</main>
</body>
</html>
`,
  'utf8',
);
console.log('Wrote kobo-dist/mockup/ hub');
