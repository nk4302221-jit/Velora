// Velora QA: login redirects + portal layout audit.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire('C:/Users/Nirbhay Kumar/OneDrive/Desktop/Velora/package.json');
const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:5000';
const OUT = 'vqa-out';


const ADMIN_ROUTES = [
  '/admin/dashboard', '/admin/orders', '/admin/products', '/admin/customers',
  '/admin/inventory', '/admin/reports', '/admin/returns',
];
const SA_ROUTES = [
  '/super-admin/dashboard', '/super-admin/admins', '/super-admin/roles',
  '/super-admin/audit-logs', '/super-admin/payments',
];
const STORE_ROUTES = ['/orders', '/profile', '/wishlist'];
const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];

const CUSTOMER = { id: 'customer@shopvanguard.com', pw: 'Customer@123' };
const ADMIN = { id: 'admin@velora.com', pw: 'Admin@123' };
const ADMIN2 = { id: 'admin@shopvanguard.com', pw: 'Admin@123' };
const SUPER = { id: 'superadmin@velora.com', pw: 'SuperAdmin@123' };

async function formLogin(page, creds) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-identifier', { timeout: 15000 });
  await page.fill('#login-identifier', creds.id);
  await page.fill('#login-password', creds.pw);
  await page.click('#login-submit-btn');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(700);
  return new URL(page.url()).pathname;
}

async function apiToken(creds) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: creds.id, password: creds.pw }),
  });
  const body = await res.json();
  return body?.data?.token || null;
}

const COLLECT = () => {
  const de = document.documentElement;
  const desc = (el) => {
    if (!el || el === document.body) return 'body';
    const parts = [];
    let node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let s = node.tagName.toLowerCase();
      if (node.id) { s += '#' + node.id; parts.unshift(s); break; }
      if (node.className && typeof node.className === 'string') {
        s += '.' + node.className.trim().split(/\s+/).slice(0, 3).join('.');
      }
      parts.unshift(s);
      node = node.parentElement;
      depth += 1;
    }
    return parts.join(' > ');
  };
  const out = {
    path: location.pathname,
    doc: { scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight },
    scrollers: [], sidebar: null, content: null, overlap: false,
    overflowingEls: [], header: null, table: null, smallTargets: [],
  };
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const oy = cs.overflowY, ox = cs.overflowX;
    const v = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2;
    const h = (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2;
    if ((v || h) && el !== document.documentElement && el !== document.body) {
      out.scrollers.push({ sel: desc(el), vertical: v, horizontal: h, scrollH: el.scrollHeight, clientH: el.clientHeight });
    }
  }
  const sidebar = document.querySelector('.admin-sidebar');
  const content = document.querySelector('.admin-content');
  if (sidebar) {
    const cs = getComputedStyle(sidebar);
    const r = sidebar.getBoundingClientRect();
    out.sidebar = {
      rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
      position: cs.position, scrollH: sidebar.scrollHeight, clientH: sidebar.clientHeight,
      scrollable: sidebar.scrollHeight > sidebar.clientHeight + 2,
      inner: (() => { const i = sidebar.firstElementChild; if (!i) return null; const ir = i.getBoundingClientRect(); return { cls: i.className, h: Math.round(ir.height) }; })(),
    };
  }
  if (content) {
    const cs = getComputedStyle(content);
    const r = content.getBoundingClientRect();
    out.content = {
      rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
      overflowX: cs.overflowX, overflowY: cs.overflowY,
      scrollable: (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && content.scrollHeight > content.clientHeight + 2,
      pad: cs.padding, boxSizing: cs.boxSizing,
    };
  }
  if (sidebar && content) {
    const s = sidebar.getBoundingClientRect(), c = content.getBoundingClientRect();
    out.overlap = s.right > c.left + 1;
  }
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > window.innerWidth + 2 || r.left < -2) {
      let p = el.parentElement, inside = false;
      while (p) {
        const pcs = getComputedStyle(p);
        if ((pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 2) { inside = true; break; }
        p = p.parentElement;
      }
      if (!inside) out.overflowingEls.push({ sel: desc(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  out.overflowingEls = out.overflowingEls.slice(0, 6);

  const table = document.querySelector('.table');
  if (table) {
    const wrap = table.closest('.table-responsive');
    const tcs = getComputedStyle(table);
    out.table = {
      minWidth: tcs.minWidth, width: Math.round(table.getBoundingClientRect().width),
      hasWrap: Boolean(wrap), wrapOverflowX: wrap ? getComputedStyle(wrap).overflowX : null,
      wrapScrollable: wrap ? wrap.scrollWidth > wrap.clientWidth + 2 : false,
      wrapW: wrap ? wrap.clientWidth : null, tableW: Math.round(table.getBoundingClientRect().width),
      thAlign: Array.from(table.querySelectorAll('thead th')).map((th) => ({ t: th.innerText.trim().slice(0, 12), a: getComputedStyle(th).textAlign, w: Math.round(th.getBoundingClientRect().width) })),
      cellOverflow: Array.from(table.querySelectorAll('tbody td')).some((td) => td.scrollWidth > td.clientWidth + 2),
    };
  }

  const header = document.querySelector('.page-header');
  if (header) {
    const cs = getComputedStyle(header);
    const r = header.getBoundingClientRect();
    out.header = { display: cs.display, flexWrap: cs.flexWrap, w: Math.round(r.width), h: Math.round(r.height), children: header.children.length };
  }
  return out;
};

const digest = (label, m) => {
  const bits = [];
  const v = m.scrollers.filter((s) => s.vertical);
  const h = m.scrollers.filter((s) => s.horizontal);
  bits.push(m.doc.scrollW > m.doc.clientW + 2 ? `H-OVERFLOW(${m.doc.scrollW}>${m.doc.clientW})` : 'no-h-overflow');
  bits.push(m.doc.scrollH > m.doc.clientH + 2 ? `pageScroll(${m.doc.scrollH})` : 'page-fit');
  if (v.length) bits.push('nestedV=' + v.map((s) => s.sel).join(';'));
  if (h.length) bits.push('nestedH=' + h.map((s) => s.sel).join(';'));
  if (m.sidebar?.scrollable) bits.push(`SIDEBAR-SCROLLS(${m.sidebar.scrollH}>${m.sidebar.clientH})`);
  if (m.content?.scrollable) bits.push('CONTENT-SCROLLS');
  if (m.overlap) bits.push('OVERLAP');
  if (m.overflowingEls.length) bits.push('overflowEls=' + m.overflowingEls.map((e) => `${e.sel}(${e.left},${e.right})`).join(';'));
  if (m.table) bits.push(`table(w=${m.table.width},min=${m.table.minWidth},wrap=${m.table.hasWrap ? (m.table.wrapScrollable ? 'hscroll' : 'fits') : 'none'},cellOverflow=${m.table.cellOverflow})`);
  return `${label}: ${bits.join(' | ')}`;
};

(async () => {
  const browser = await chromium.launch();
  const log = [];
  const errors = [];

  // ---------- 1. LOGIN REDIRECTS ----------
  const redirectResults = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
    redirectResults.customer = await formLogin(page, CUSTOMER);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    redirectResults.admin = await formLogin(page, ADMIN).then(async (p) => p === '/login' ? formLogin(page, ADMIN2) : p);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    redirectResults.superAdmin = await formLogin(page, SUPER);
    await ctx.close();
  }
  // Google OAuth callback path: /login?token=<jwt>
  {
    const token = await apiToken(CUSTOMER);
    if (!token) {
      redirectResults.googleCustomer = 'NO-TOKEN';
    } else {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login?token=${token}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !location.pathname.startsWith('/login'), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(700);
      redirectResults.googleCustomer = new URL(page.url()).pathname;
      await ctx.close();
    }
    const adminToken = await apiToken(await (async () => {
      const t = await apiToken(ADMIN); return t ? ADMIN : ADMIN2;
    })());
    if (adminToken) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login?token=${adminToken}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !location.pathname.startsWith('/login'), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(700);
      redirectResults.googleAdmin = new URL(page.url()).pathname;
      await ctx.close();
    }
  }
  console.log('=== LOGIN REDIRECTS ===');
  console.log(JSON.stringify(redirectResults, null, 2));
  fs.writeFileSync(path.join(OUT, 'redirects.json'), JSON.stringify(redirectResults, null, 2));

  // ---------- 2. LAYOUT AUDIT ----------
  console.log('=== LAYOUT ===');
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${vp.name}] pageerror: ` + String(e.message).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${vp.name}] console: ` + m.text().slice(0, 160)); });

    await formLogin(page, ADMIN);
    for (const route of ADMIN_ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1200);
      const m = await page.evaluate(COLLECT);
      log.push(digest(`${vp.name} ${route}`, m));
      if (route === '/admin/dashboard' || route === '/admin/orders') {
        await page.screenshot({ path: path.join(OUT, `${vp.name}${route.replace(/\//g, '_')}.png`) });
      }
      // sidebar scroll behaviour after page scroll
      const sticky = await page.evaluate(() => {
        const s = document.querySelector('.admin-sidebar');
        if (!s) return null;
        const y0 = s.getBoundingClientRect().top;
        const max = Math.min(600, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo(0, max);
        const y1 = s.getBoundingClientRect().top;
        window.scrollTo(0, 0);
        return { y0: Math.round(y0), y1: Math.round(y1), to: max };
      });
      if (sticky && sticky.y0 !== sticky.y1) log.push(`${vp.name} ${route}: sidebar moves on scroll ${JSON.stringify(sticky)}`);
    }

    await formLogin(page, SUPER);
    for (const route of SA_ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1200);
      const m = await page.evaluate(COLLECT);
      log.push(digest(`${vp.name} ${route}`, m));
      if (route === '/super-admin/dashboard' || route === '/super-admin/admins') {
        await page.screenshot({ path: path.join(OUT, `${vp.name}${route.replace(/\//g, '_')}.png`) });
      }
    }

    await formLogin(page, CUSTOMER);
    for (const route of STORE_ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1200);
      const m = await page.evaluate(COLLECT);
      log.push(digest(`${vp.name} ${route}`, m));
      await page.screenshot({ path: path.join(OUT, `${vp.name}${route.replace(/\//g, '_')}.png`) });
    }
    await page.goto(BASE + '/customer/orders', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(1200);
    log.push(digest(`${vp.name} /customer/orders`, await page.evaluate(COLLECT)));
    await page.screenshot({ path: path.join(OUT, `${vp.name}_customer_orders.png`) });

    await ctx.close();
  }

  console.log(log.join('\n'));
  console.log('=== ERRORS ===');
  console.log(JSON.stringify([...new Set(errors)].slice(0, 25), null, 1));
  fs.writeFileSync(path.join(OUT, 'layout.txt'), log.join('\n'));
  fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify([...new Set(errors)], null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

