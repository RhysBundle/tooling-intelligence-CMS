// Screenshots render.html's screens at 1024x768 in a headless browser, over
// the DevTools protocol. node render.js <job.json> <browser path>
// job: { theme, button, logo, screens: [{ out, kind, ... }] }; see render.html.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const [, , jobPath, browser] = process.argv;
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const PORT = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ti-swap-browser-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(browser, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=1024,768', 'about:blank'], { stdio: 'ignore' });

function done(code) {
  proc.kill();
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 500);
}

(async () => {
  let wsUrl;
  for (let i = 0; i < 75 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) {}
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error('browser did not start');
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = {}, errors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description));
  });
  const send = (method, params = {}) => new Promise(res => { const n = ++id; pending[n] = m => res(m.result || m); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'render.html')).href });
  for (let i = 0; i < 50; i++) {
    const r = await send('Runtime.evaluate', { expression: 'typeof window.show', returnByValue: true });
    if (r.result && r.result.value === 'function') break;
    await sleep(100);
  }
  for (const screen of job.screens) {
    const o = Object.assign({ theme: job.theme, button: job.button, logo: job.logo }, screen);
    const r = await send('Runtime.evaluate', { expression: 'show(' + JSON.stringify(o) + ')', awaitPromise: true, returnByValue: true });
    if (!r.result || r.result.value !== true) throw new Error('could not draw ' + screen.out + ': ' + JSON.stringify(r) + errors.join('\n'));
    await sleep(150);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1024, height: 768, scale: 1 } });
    fs.writeFileSync(screen.out, Buffer.from(shot.data, 'base64'));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  ws.close();
  done(0);
})().catch(e => { console.error(e.message || e); done(1); });
