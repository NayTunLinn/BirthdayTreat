import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function vercelApiDevPlugin() {
  return {
    name: 'birthday-treat-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/votes', async (request, response) => {
        try {
          const { GET, POST } = await import('./api/votes.js');
          const method = request.method || 'GET';
          const body = method === 'GET' || method === 'HEAD'
            ? undefined
            : await readRequestBody(request);
          const webRequest = new Request('http://localhost/api/votes', {
            method,
            headers: request.headers,
            body,
            duplex: body ? 'half' : undefined
          });
          const handler = method === 'POST' ? POST : GET;
          const result = await handler(webRequest);

          response.statusCode = result.status;
          result.headers.forEach((value, key) => {
            response.setHeader(key, value);
          });
          response.end(Buffer.from(await result.arrayBuffer()));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: error.message || 'Local API failed.' }));
        }
      });
    }
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

export default defineConfig({
  plugins: [react(), vercelApiDevPlugin()]
});
