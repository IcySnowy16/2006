// A real-browser smoke test (not part of `npm test`): drives the built web app in headless Chrome through the whole trip, with two
// separate browser sessions (a driver and a rider), and saves a screenshot of every screen.
//
//   1. docker compose up -d && npm run build && npm run demo:reset
//   2. start the server so it serves the built app:  CLIENT_DIST=client/dist npm run dev -w @campus-hop/server   (or: npx tsx server/src/server.ts)
//   3. node scripts/ui-smoke.mjs  [--url http://localhost:3000] [--out ./ui-shots] [--chrome "C:/Program Files/Google/Chrome/Application/chrome.exe"]
//                                 [--device iphone-se|iphone-14|pixel-7|android-small|landscape|keyboard]
//
// With --device the walk runs as that phone (screen size, pixel density, touch, mobile browser) and every screen is checked for
// what goes wrong on phones: sideways scrolling, controls too small to tap (under 44 x 44 CSS px), text boxes under 16 px (iPhones zoom
// in on them), tiny text, and controls hidden under a fixed bar. The findings go to <out>/mobile-report.json and a summary is printed.
// Run `npm run demo:reset` before each device: the walk books and completes a trip.
//
// It uses the demo people from `npm run demo:reset` and the [DEMO] synthetic campus. It stops with a clear message at the first step that
// does not behave, and prints which screens it saw.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:3000');
const OUT = path.resolve(arg('out', './ui-shots'));
const CHROME = arg('chrome', process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const PORT = 9333;
const PASSWORD = 'demo-password-1';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const DEVICES = {
  'iphone-se': { width: 375, height: 667, dpr: 2, ua: IOS },
  'iphone-14': { width: 390, height: 844, dpr: 3, ua: IOS },
  'pixel-7': { width: 412, height: 915, dpr: 2.625, ua: ANDROID },
  'android-small': { width: 360, height: 740, dpr: 3, ua: ANDROID },
  landscape: { width: 844, height: 390, dpr: 3, ua: IOS, landscape: true },
  // an iPhone with the on-screen keyboard up: about 420 px of page left
  keyboard: { width: 390, height: 420, dpr: 3, ua: IOS },
};
const DEVICE_NAME = arg('device', '');
const DEVICE = DEVICE_NAME ? DEVICES[DEVICE_NAME] : null;
if (DEVICE_NAME && !DEVICE) throw new Error(`unknown --device ${DEVICE_NAME}; one of ${Object.keys(DEVICES).join(', ')}`);
const report = {};

/** Runs in the page: what would go wrong on a phone. Sizes are CSS pixels. */
const AUDIT = `(() => {
  const vw = innerWidth, out = { overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, offscreen: [], smallTargets: [], inputZoom: [], tinyText: 0, tinyTextSample: [], covered: [] };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.name || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40);
  const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.right > vw + 1 && !scroller(el) && visible(el)) out.offscreen.push(label(el) + ' (' + Math.round(r.right) + 'px)'); });
  const targets = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=radio], [role=button]')].filter(visible);
  for (const el of targets) {
    // a radio or checkbox is tapped through its label; an inline link inside a sentence is exempt (WCAG 2.5.8)
    const box = (el.type === 'radio' || el.type === 'checkbox') && el.closest('label') ? el.closest('label') : el;
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 10;
    const r = box.getBoundingClientRect();
    if (!inline && (r.width < 44 || r.height < 44)) out.smallTargets.push(label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(radio|checkbox|range|button|submit)$/.test(el.type) && parseFloat(getComputedStyle(el).fontSize) < 16) out.inputZoom.push(label(el) + ' ' + getComputedStyle(el).fontSize);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) { const t = n.textContent.trim(); if (!t || !n.parentElement || !visible(n.parentElement)) continue; const fs = parseFloat(getComputedStyle(n.parentElement).fontSize); if (fs < 12) { out.tinyText++; if (out.tinyTextSample.length < 4) out.tinyTextSample.push(t.slice(0, 30) + ' ' + fs + 'px'); } }
  // scrolled to the bottom: is any control hidden under something fixed (the bottom bar, a banner)?
  scrollTo(0, document.documentElement.scrollHeight);
  const bar = document.querySelector('.topbar'), barBottom = bar ? bar.getBoundingClientRect().bottom : 0; // content scrolling up under the sticky top bar is normal
  for (const el of targets) { const r = el.getBoundingClientRect(); if (r.top < Math.max(0, barBottom) || r.bottom > innerHeight) continue; /* only controls fully on screen */ const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const hit = document.elementFromPoint(x, y); if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !(el.closest('label') && el.closest('label').contains(hit))) out.covered.push(label(el) + ' under ' + label(hit)); }
  scrollTo(0, 0);
  return out;
})()`;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = [];
const log = (m) => {
  steps.push(m);
  console.log(m);
};

// ------------------------------------------------------------------------------------------------ minimal DevTools client
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(`${m.error.message}`));
        else resolve(m.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

class Tab {
  constructor(cdp, sessionId, name) {
    Object.assign(this, { cdp, sessionId, name });
  }
  send(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`[${this.name}] page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  async goto(p) {
    await this.send('Page.navigate', { url: new URL(p, BASE).href });
    await sleep(700);
  }
  async view(width, height = 820) {
    if (DEVICE && width < 600) return this.phone(DEVICE);
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  }
  async phone(d) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: d.width,
      height: d.height,
      deviceScaleFactor: d.dpr,
      mobile: true,
      screenOrientation: d.landscape ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await this.send('Emulation.setUserAgentOverride', { userAgent: d.ua, platform: d.ua.includes('iPhone') ? 'iPhone' : 'Linux armv8l' });
  }
  async text() {
    return this.eval('document.body.innerText');
  }
  async waitText(needle, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if ((await this.text()).toLowerCase().includes(needle.toLowerCase())) return;
      await sleep(250);
    }
    throw new Error(`[${this.name}] never saw "${needle}". Screen says:\n${(await this.text()).slice(0, 600)}`);
  }
  async path() {
    return this.eval('location.pathname + location.search');
  }
  async waitPath(prefix, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if ((await this.path()).startsWith(prefix)) return;
      await sleep(250);
    }
    throw new Error(`[${this.name}] never reached ${prefix}; at ${await this.path()}\n${(await this.text()).slice(0, 400)}`);
  }
  async click(label) {
    const ok = await this.eval(`(() => {
      const els = [...document.querySelectorAll('button, a, [role=radio]')].filter((e) => !e.disabled);
      const el = els.find((e) => e.textContent.trim() === ${JSON.stringify(label)}) || els.find((e) => (e.getAttribute('aria-label') || '') === ${JSON.stringify(label)}) || els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(label)}));
      if (!el) return false; el.click(); return true; })()`);
    if (!ok) throw new Error(`[${this.name}] no enabled button or link "${label}". Screen says:\n${(await this.text()).slice(0, 500)}`);
    await sleep(350);
  }
  async fill(label, value) {
    const ok = await this.eval(`(() => {
      const lab = [...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(${JSON.stringify(label)}));
      const el = lab && (lab.htmlFor ? document.getElementById(lab.htmlFor) : lab.querySelector('input,select'));
      if (!el) return false;
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (el.tagName === 'SELECT') { const opt = [...el.options].find((o) => o.textContent.trim().includes(${JSON.stringify(value)})); if (!opt) return 'no option'; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, opt.value); }
      else Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    if (ok !== true) throw new Error(`[${this.name}] cannot fill "${label}" (${ok})`);
  }
  async shot(name) {
    const tag = DEVICE_NAME && name.endsWith('-400') ? name.replace(/-400$/, '-' + DEVICE_NAME) : name;
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, `${tag}.png`), Buffer.from(data, 'base64'));
    if (DEVICE && name.endsWith('-400')) {
      report[tag] = await this.eval(AUDIT);
      await sleep(150);
    }
  }
  async noHorizontalScroll() {
    return this.eval('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1');
  }
}

async function login(tab, email) {
  await tab.goto('/login');
  await tab.waitText('Welcome back');
  await tab.fill('NTU e-mail', email);
  await tab.fill('Password', PASSWORD);
  await tab.click('Sign in');
}

// ------------------------------------------------------------------------------------------------ run
const profile = mkdtempSync(path.join(tmpdir(), 'ch-ui-'));
const chrome = spawn(
  CHROME,
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--disable-gpu', '--no-sandbox', 'about:blank'],
  { stdio: 'ignore' },
);
let exitCode = 0;
try {
  let version;
  for (let i = 0; i < 40 && !version; i++) {
    try {
      version = await (await fetch(`http://localhost:${PORT}/json/version`)).json();
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error('Chrome did not start. Pass --chrome with the path to chrome.exe.');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  const cdp = new Cdp(ws);

  async function newTab(name, geo) {
    const { browserContextId } = await cdp.send('Target.createBrowserContext');
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const tab = new Tab(cdp, sessionId, name);
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');
    if (geo) {
      await cdp.send('Browser.grantPermissions', { permissions: ['geolocation'], origin: new URL(BASE).origin, browserContextId });
      await tab.send('Emulation.setGeolocationOverride', { latitude: geo.lat, longitude: geo.lng, accuracy: 10 });
    }
    await tab.view(400);
    return tab;
  }

  // The synthetic campus: Hall A is where the driver starts, Hall B is the rider's stop, the Main Gate is the exit.
  // Hall A is DEMO_GRID_ORIGIN (same default as server/src/seed/demo.ts: near the middle of NTU).
  const origin = (() => {
    const m = /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/.exec((process.env.DEMO_GRID_ORIGIN || '').trim());
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : { lat: 1.348, lng: 103.683 };
  })();
  const driver = await newTab('driver', origin);
  const rider = await newTab('rider');
  const locked = await newTab('locked');
  const wide = await newTab('wide');
  await wide.view(1000, 800);

  // ---- sign-in, role choice
  await driver.goto('/login');
  await driver.waitText('Welcome back');
  await driver.shot('01-login-400');
  await driver.goto('/register');
  await driver.waitText('Create your account');
  await driver.shot('02-register-400');
  await login(driver, 'demo.driver@e.ntu.edu.sg');
  await driver.waitPath('/choose-role');
  await driver.waitText('How do you want to use Campus Hop today?');
  await driver.shot('03-choose-role-400');
  log('OK  login, register and role choice (Dana holds both roles)');
  await driver.click('I am driving (driver)');
  await driver.waitPath('/driver');
  await driver.waitText('Hi Dana');
  await driver.shot('04-driver-home-400');

  // ---- presets
  await driver.goto('/driver/presets');
  await driver.waitText('Shared ride to the gate');
  await driver.shot('05-presets-400');
  await driver.click('Edit');
  await driver.waitText('Edit preset');
  await driver.shot('06-preset-editor-400');
  log('OK  presets list and editor');

  // ---- go live
  await driver.goto('/driver/go-live');
  await driver.waitText('Go live');
  await driver.shot('07-go-live-400');
  await driver.click('Share my location and go live');
  await driver.waitPath('/driver/journey/');
  await driver.waitText('Your journey');
  const journeyPath = (await driver.path()).split('?')[0];
  await driver.shot('08-driver-waiting-400');
  log('OK  the driver went live and the route was stored');

  // ---- the rider asks, sees the match, books
  await login(rider, 'demo.rider1@e.ntu.edu.sg');
  await rider.waitPath('/passenger');
  await rider.waitText('Hi Priya');
  await rider.shot('09-passenger-home-400');
  await rider.click('Request a hop');
  await rider.waitText('Request a hop');
  await rider.fill('I am at', 'Hall B');
  await rider.fill('I am going to', 'Main Gate');
  await rider.shot('10-request-hop-400');
  await rider.click('Find a ride');
  await rider.waitPath('/passenger/matches/');
  await rider.waitText('Dana');
  await rider.shot('11-matches-400');
  log('OK  the request found the driver (ranked match with walk, time and fare)');
  await rider.click('Choose this ride');
  await rider.waitText('Confirm your booking');
  await rider.waitText('You have enough in your wallet');
  await rider.shot('12-confirm-booking-400');
  await rider.click('Ask the driver');
  await rider.waitPath('/passenger/booking/');
  await rider.waitText('Waiting for the driver to confirm');
  await rider.shot('13-booking-waiting-400');
  log('OK  the wallet check passed and the booking is waiting');

  // ---- the driver accepts
  await driver.goto(journeyPath);
  await driver.waitText('Priya');
  await driver.shot('14-request-cards-400');
  await driver.click('Accept');
  await driver.waitText('Confirmed riders (1)');
  await driver.shot('15-driver-accepted-400');
  await rider.goto((await rider.path()).split('?')[0]);
  await rider.waitText('Cancel booking');
  await rider.shot('16-booking-confirmed-400');
  log('OK  the driver accepted; the seat and the hold are in place');

  // ---- the trip
  await driver.click('Start trip');
  await driver.waitPath('/driver/trip/');
  await driver.waitText('Trip in progress');
  await sleep(6000); // the driver's phone sends its first position; the rider's screen joins the live room
  await driver.shot('17-active-trip-400');
  await rider.goto((await rider.path()).split('?')[0]);
  await rider.waitText('Approaching', 20000);
  await rider.shot('18-passenger-tracking-400');
  log('OK  the trip started and the rider sees the live position');
  await driver.click('Picked up');
  await driver.waitText('Dropped off');
  await driver.click('Dropped off');
  await sleep(5000); // the list refreshes every 4 s
  await driver.click('Complete trip');
  await driver.waitPath('/driver/complete/');
  await driver.waitText('Trip complete');
  await driver.waitText('$3.00');
  await driver.shot('19-trip-complete-400');
  log('OK  the trip completed and the driver was paid $3.00 (simulated)');

  // ---- the rider's end: rating, wallet, history, notifications
  await rider.goto((await rider.path()).split('?')[0]);
  await rider.waitText('How was the ride?');
  await rider.click('5 stars');
  await rider.click('Send rating');
  await rider.waitText('Thanks for rating');
  await rider.shot('20-rate-400');
  await rider.goto('/wallet');
  await rider.waitText('SIMULATED');
  await rider.waitText('$17.00');
  await rider.shot('21-wallet-400');
  await rider.goto('/history');
  await rider.waitText('PAID'.toLowerCase());
  await rider.shot('22-history-400');
  await rider.goto('/notifications');
  await rider.waitText('Trip complete');
  await rider.shot('23-notifications-400');
  await rider.goto('/profile');
  await rider.waitText('Profile');
  await rider.shot('24-profile-400');
  log('OK  rating, wallet ($20.00 minus the $3.00 fare), history, notifications and profile');

  // ---- the locked account
  await login(locked, 'demo.locked@e.ntu.edu.sg');
  await locked.waitPath('/passenger');
  await locked.waitText('Your account is locked');
  await locked.goto('/locked');
  await locked.waitText('What you owe');
  await locked.waitText('$0.70');
  await locked.shot('25-locked-account-400');
  log('OK  the locked account shows the exact debt');

  // ---- wide screen, and no sideways scrolling anywhere
  await login(wide, 'demo.rider1@e.ntu.edu.sg');
  await wide.waitPath('/passenger');
  await wide.shot('26-passenger-home-1000');
  await wide.goto('/dev/components');
  await wide.waitText('Components');
  await wide.shot('27-components-1000');
  for (const [tab, route] of [
    [rider, '/passenger'],
    [rider, '/wallet'],
    [rider, '/history'],
    [driver, '/driver/presets'],
    [driver, '/driver'],
    [locked, '/locked'],
  ]) {
    await tab.goto(route);
    await sleep(800);
    if (!(await tab.noHorizontalScroll())) throw new Error(`[${tab.name}] ${route} scrolls sideways at ${DEVICE_NAME || '400 px'}`);
  }
  log(`OK  no screen scrolls sideways at ${DEVICE_NAME || '400 px'}`);
  if (DEVICE) {
    writeFileSync(path.join(OUT, 'mobile-report.json'), JSON.stringify({ device: DEVICE_NAME, ...DEVICE, screens: report }, null, 2));
    const sum = (k) => Object.values(report).reduce((n, r) => n + (Array.isArray(r[k]) ? r[k].length : r[k] ? 1 : 0), 0);
    log(
      `MOBILE ${DEVICE_NAME} (${DEVICE.width}x${DEVICE.height}): ${Object.keys(report).length} screens; sideways ${sum('overflowX')}, off-screen ${sum('offscreen')}, small tap targets ${sum('smallTargets')}, inputs that zoom ${sum('inputZoom')}, tiny text ${Object.values(report).reduce((n, r) => n + r.tinyText, 0)}, covered controls ${sum('covered')}`,
    );
  }
  log(`\nAll steps passed. ${steps.filter((s) => s.startsWith('OK')).length} groups, screenshots in ${OUT}`);
} catch (err) {
  exitCode = 1;
  console.error('\nSMOKE TEST FAILED\n' + (err instanceof Error ? err.message : err));
} finally {
  chrome.kill();
  process.exit(exitCode);
}
