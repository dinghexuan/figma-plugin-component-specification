import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const host = '127.0.0.1', port = 4178;
const server = createServer(async (request, response) => {
  if (request.url !== '/' && request.url !== '/ui.html') {
    response.writeHead(404); response.end('Not found'); return;
  }
  try {
    const html = await readFile(new URL('../dist/ui.html', import.meta.url));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  } catch (error) {
    console.error(error);
    response.writeHead(500); response.end('Build the plugin before starting preview.');
  }
});
server.listen(port, host, () => console.log(`Preview only (no Figma writes): http://${host}:${port}`));
