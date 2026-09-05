import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

test('live preview verification rejects an HTTP 200 page with an empty catalogue', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<html><button class="theme-toggle"></button><nav>' + '<sup>0</sup>'.repeat(5) + '</nav></html>');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/verify-preview.mjs', `http://127.0.0.1:${server.address().port}/`], { windowsHide: true, timeout: 20000 });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', reject);
      child.once('close', code => resolve({ code, output }));
    });
    assert.equal(result.code, 1, 'An empty live catalogue must fail verification');
    assert.match(result.output, /Live category counts do not match the catalogue/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
