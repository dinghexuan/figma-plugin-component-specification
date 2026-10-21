import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
  throw new Error('manifest.json must include a stable plugin id for private document settings.');
}
await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/main.ts'], bundle: true, outfile: 'dist/code.js', format: 'iife', target: 'es2017' }),
  build({ entryPoints: ['src/ui.ts'], bundle: true, outfile: 'dist/ui.js', format: 'iife', target: 'es2020' }),
]);
let html = await readFile('src/ui.html', 'utf8');
const css = await readFile('src/ui.css', 'utf8'), js = await readFile('dist/ui.js', 'utf8');
html = html.replace('<!-- STYLES -->', () => `<style>${css}</style>`).replace('<!-- SCRIPTS -->', () => `<script>${js.replaceAll('</script', '<\\/script')}</script>`);
html = await replaceAssets(html);
await writeFile('dist/ui.html', html);
async function replaceAssets(html) {
  const names = [...new Set(html.match(/assets\/[\w-]+\.svg/g) ?? [])];
  for (const name of names) {
    const svg = await readFile(name);
    if (!svg.length) throw new Error(`Empty asset: ${name}`);
    html = html.replaceAll(name, `data:image/svg+xml;base64,${svg.toString('base64')}`);
  }
  return html;
}
console.log('Built offline Figma plugin: dist/code.js + dist/ui.html');
