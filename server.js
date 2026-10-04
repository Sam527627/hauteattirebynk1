/**
 * Haute Attire by NK — API + static server
 * Zero dependencies. Run with:  node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'hauteattire2026';
const WHATSAPP = process.env.WHATSAPP_NUMBER || '919310140206';

const store = {
  read(file, fallback) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); }
    catch { return fallback; }
  },
  write(file, value) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(path.join(DATA, file), JSON.stringify(value, null, 2));
  }
};

let products = store.read('products.json', []);
const carts = new Map();
const extras = new Map(); // per-session: promo code, gift wrap, gift message

/* ---- Diwali Festive Edit settings (change here, push, done) ---- */
const FESTIVE = {
  name: 'The Festive Edit', diwaliDate: '2026-11-08',
  code: 'FESTIVE10', percent: 10, minSpend: 5999, expires: '2026-11-15T23:59:59+05:30',
  giftWrap: 199
};
const codeLive = () => Date.now() <= new Date(FESTIVE.expires).getTime();
const wishlists = new Map();
const adminTokens = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 1.2e7) { req.destroy(); reject(new Error('That photo is too large — keep it under 8MB')); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(pair => {
    const i = pair.indexOf('=');
    if (i > -1) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function sessionOf(req, res) {
  let sid = parseCookies(req).ha_session;
  if (!sid || !/^[a-f0-9]{32}$/.test(sid)) {
    sid = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `ha_session=${sid}; Path=/; Max-Age=2592000; SameSite=Lax`);
  }
  return sid;
}

const publicProducts = () => products.filter(p => p.published);
const findProduct = id => products.find(p => p.id === id || p.slug === id);
const stockFor = (p, size) => (p.stock && p.stock[size]) || 0;
const rupees = n => '₹' + Number(n).toLocaleString('en-IN');

function cartView(sid) {
  const raw = carts.get(sid) || [];
  const items = raw.map(line => {
    const p = findProduct(line.productId);
    if (!p) return null;
    return {
      productId: p.id, slug: p.slug, name: p.name, image: p.image,
      size: line.size, qty: line.qty, price: p.price,
      lineTotal: p.price * line.qty, maxQty: stockFor(p, line.size)
    };
  }).filter(Boolean);
  const ex = extras.get(sid) || {};
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const shipping = subtotal === 0 || subtotal >= 2499 ? 0 : 149;
  let discount = 0, codeApplied = '', codeNote = '';
  if (ex.code === FESTIVE.code) {
    if (!codeLive()) codeNote = 'This code has expired.';
    else if (subtotal < FESTIVE.minSpend) codeNote = `Add ${rupees(FESTIVE.minSpend - subtotal + 1)} more to use ${FESTIVE.code}.`;
    else { discount = Math.round(subtotal * FESTIVE.percent / 100); codeApplied = FESTIVE.code; }
  }
  const giftWrap = ex.gift && subtotal > 0 ? FESTIVE.giftWrap : 0;
  return {
    items, count: items.reduce((s, i) => s + i.qty, 0),
    subtotal, discount, codeApplied, codeNote, shipping,
    giftWrap, giftMessage: giftWrap ? String(ex.giftMessage || '') : '',
    total: subtotal - discount + shipping + giftWrap,
    amountToFreeShipping: subtotal > 0 && subtotal < 2499 ? 2499 - subtotal : 0
  };
}

const isAdmin = req => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  return token && adminTokens.has(token);
};

/* build the WhatsApp message for an order */
function whatsappLink(order) {
  const lines = [
    `Hi Haute Attire! I'd like to place this order.`,
    ``,
    `*Order ${order.id}*`,
    ...order.items.map(i => `• ${i.name} — size ${i.size} × ${i.qty} — ${rupees(i.lineTotal)}`),
    ``,
    `Subtotal: ${rupees(order.subtotal)}`,
    order.discount ? `Festive code ${order.codeApplied}: −${rupees(order.discount)}` : '',
    order.giftWrap ? `Gift wrap: ${rupees(order.giftWrap)}` : '',
    order.giftMessage ? `Card message: "${order.giftMessage}"` : '',
    `Shipping: ${order.shipping ? rupees(order.shipping) : 'Free'}`,
    `*Total: ${rupees(order.total)}*`,
    ``,
    `Name: ${order.customer.name}`,
    `Phone: ${order.customer.phone}`,
    `Address: ${order.shipTo.address}, ${order.shipTo.city} — ${order.shipTo.pincode}`,
    order.notes ? `Notes: ${order.notes}` : ''
  ].filter(Boolean);
  return `https://wa.me/${WHATSAPP}?text=` + encodeURIComponent(lines.join('\n'));
}

async function api(req, res, url) {
  const sid = sessionOf(req, res);
  const seg = url.pathname.split('/').filter(Boolean);
  const [, resource, a, b] = seg;
  const method = req.method;

  if (resource === 'config' && method === 'GET') {
    return send(res, 200, { whatsapp: WHATSAPP, freeShippingOver: 2499, festive: { ...FESTIVE, live: codeLive() } });
  }

  if (resource === 'products' && method === 'GET') {
    if (a) {
      const p = findProduct(a);
      if (!p || !p.published) return send(res, 404, { error: 'Product not found' });
      const related = publicProducts().filter(x => x.category === p.category && x.id !== p.id).slice(0, 4);
      return send(res, 200, { product: p, related });
    }
    let list = publicProducts();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const category = url.searchParams.get('category');
    const occasion = url.searchParams.get('occasion');
    if (occasion) list = list.filter(p => (p.occasions || []).includes(occasion));
    if (url.searchParams.get('festive')) list = list.filter(p => p.festive);
    const sort = url.searchParams.get('sort');
    if (q) list = list.filter(p => (p.name + ' ' + p.description + ' ' + p.categoryLabel + ' ' + (p.colours || '')).toLowerCase().includes(q));
    if (category && category !== 'all') list = list.filter(p => p.category === category);
    if (sort === 'price-asc') list = [...list].sort((x, y) => x.price - y.price);
    if (sort === 'price-desc') list = [...list].sort((x, y) => y.price - x.price);
    return send(res, 200, { products: list, total: list.length });
  }

  if (resource === 'categories' && method === 'GET') {
    const map = new Map();
    publicProducts().forEach(p => {
      const e = map.get(p.category) || { slug: p.category, label: p.categoryLabel, count: 0, image: p.image };
      e.count++; map.set(p.category, e);
    });
    return send(res, 200, { categories: [...map.values()] });
  }

  if (resource === 'cart' && a === 'extras' && method === 'POST') {
    const body = await readBody(req);
    const ex = extras.get(sid) || {};
    if ('code' in body) {
      const c = String(body.code || '').trim().toUpperCase();
      if (c && c !== FESTIVE.code) return send(res, 400, { error: 'That code is not valid' });
      if (c && !codeLive()) return send(res, 400, { error: 'This code has expired' });
      ex.code = c;
    }
    if ('gift' in body) ex.gift = !!body.gift;
    if ('giftMessage' in body) ex.giftMessage = String(body.giftMessage || '').slice(0, 200);
    extras.set(sid, ex);
    return send(res, 200, cartView(sid));
  }

  if (resource === 'cart') {
    if (method === 'GET') return send(res, 200, cartView(sid));
    if (method === 'POST') {
      const { productId, size, qty = 1 } = await readBody(req);
      const p = findProduct(productId);
      if (!p || !p.published) return send(res, 404, { error: 'Product not found' });
      if (!size || !(size in (p.stock || {}))) return send(res, 400, { error: 'Choose a size before adding to bag' });
      const lines = carts.get(sid) || [];
      const existing = lines.find(l => l.productId === p.id && l.size === size);
      const wanted = (existing ? existing.qty : 0) + Number(qty);
      const available = stockFor(p, size);
      if (available === 0) return send(res, 409, { error: `Size ${size} is sold out` });
      if (wanted > available) return send(res, 409, { error: `Only ${available} left in size ${size}` });
      if (existing) existing.qty = wanted; else lines.push({ productId: p.id, size, qty: Number(qty) });
      carts.set(sid, lines);
      return send(res, 200, cartView(sid));
    }
    if (method === 'PATCH') {
      const { productId, size, qty } = await readBody(req);
      const lines = carts.get(sid) || [];
      const line = lines.find(l => l.productId === productId && l.size === size);
      if (!line) return send(res, 404, { error: 'That item is no longer in your bag' });
      const p = findProduct(productId);
      const n = Number(qty);
      if (n <= 0) carts.set(sid, lines.filter(l => l !== line));
      else if (n > stockFor(p, size)) return send(res, 409, { error: `Only ${stockFor(p, size)} left in size ${size}` });
      else line.qty = n;
      return send(res, 200, cartView(sid));
    }
    if (method === 'DELETE') {
      const { productId, size } = await readBody(req);
      carts.set(sid, (carts.get(sid) || []).filter(l => !(l.productId === productId && l.size === size)));
      return send(res, 200, cartView(sid));
    }
  }

  if (resource === 'wishlist') {
    const ids = wishlists.get(sid) || [];
    if (method === 'GET') return send(res, 200, { ids, items: ids.map(findProduct).filter(p => p && p.published) });
    if (method === 'POST') {
      const { productId } = await readBody(req);
      if (!findProduct(productId)) return send(res, 404, { error: 'Product not found' });
      const next = ids.includes(productId) ? ids.filter(i => i !== productId) : [...ids, productId];
      wishlists.set(sid, next);
      return send(res, 200, { ids: next, saved: next.includes(productId) });
    }
  }

  /* orders — confirmed over WhatsApp, no payment taken here */
  if (resource === 'orders' && method === 'POST') {
    const body = await readBody(req);
    const missing = ['name', 'phone', 'address', 'city', 'pincode'].filter(f => !String(body[f] || '').trim());
    if (missing.length) return send(res, 400, { error: 'Fill in every field before placing the order', fields: missing });
    if (!/^[6-9]\d{9}$/.test(String(body.phone).replace(/\D/g, ''))) return send(res, 400, { error: 'Enter a 10-digit Indian mobile number', fields: ['phone'] });
    if (!/^\d{6}$/.test(String(body.pincode))) return send(res, 400, { error: 'Enter a 6-digit pincode', fields: ['pincode'] });
    if (body.email && !/^\S+@\S+\.\S+$/.test(body.email)) return send(res, 400, { error: 'Enter a valid email address', fields: ['email'] });

    const cart = cartView(sid);
    if (!cart.items.length) return send(res, 400, { error: 'Your bag is empty' });

    cart.items.forEach(i => {
      const p = findProduct(i.productId);
      p.stock[i.size] = Math.max(0, stockFor(p, i.size) - i.qty);
    });
    store.write('products.json', products);

    const order = {
      id: 'NK' + Date.now().toString().slice(-8),
      placedAt: new Date().toISOString(),
      status: 'Awaiting confirmation on WhatsApp',
      customer: { name: body.name, email: body.email || '', phone: body.phone },
      shipTo: { address: body.address, city: body.city, pincode: body.pincode },
      notes: String(body.notes || '').trim(),
      items: cart.items, subtotal: cart.subtotal, discount: cart.discount, codeApplied: cart.codeApplied,
      giftWrap: cart.giftWrap, giftMessage: cart.giftMessage, shipping: cart.shipping, total: cart.total
    };
    order.whatsappUrl = whatsappLink(order);
    const orders = store.read('orders.json', []);
    orders.push(order);
    store.write('orders.json', orders);
    carts.delete(sid); extras.delete(sid);
    return send(res, 201, { order });
  }

  if (resource === 'orders' && method === 'GET' && a) {
    const order = store.read('orders.json', []).find(o => o.id === a.toUpperCase());
    if (!order) return send(res, 404, { error: 'No order found with that number' });
    return send(res, 200, { order });
  }

  if (resource === 'newsletter' && method === 'POST') {
    const { email } = await readBody(req);
    if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) return send(res, 400, { error: 'Enter a valid email address' });
    const subs = store.read('subscribers.json', []);
    if (!subs.includes(email)) { subs.push(email); store.write('subscribers.json', subs); }
    return send(res, 200, { message: 'You are on the list. Look out for the next drop.' });
  }

  if (resource === 'admin') {
    if (a === 'login' && method === 'POST') {
      const { passcode } = await readBody(req);
      if (passcode !== ADMIN_PASSCODE) return send(res, 401, { error: 'That passcode is not right' });
      const token = crypto.randomBytes(24).toString('hex');
      adminTokens.add(token);
      return send(res, 200, { token });
    }
    if (!isAdmin(req)) return send(res, 401, { error: 'Sign in to the studio panel first' });

    if (a === 'products' && method === 'GET') return send(res, 200, { products });

    if (a === 'products' && method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const price = Number(body.price);
      if (!name) return send(res, 400, { error: 'Give the piece a name', fields: ['name'] });
      if (!price || price <= 0) return send(res, 400, { error: 'Enter a price', fields: ['price'] });
      if (!body.photo) return send(res, 400, { error: 'Choose a photo', fields: ['photo'] });

      const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(body.photo);
      if (!match) return send(res, 400, { error: 'That file is not a JPG, PNG or WEBP image', fields: ['photo'] });
      const buf = Buffer.from(match[2], 'base64');
      if (buf.length > 8 * 1024 * 1024) return send(res, 400, { error: 'That photo is too large — keep it under 8MB', fields: ['photo'] });

      const nextNum = products.reduce((max, p) => Math.max(max, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0) + 1;
      const id = 'HA-' + String(nextNum).padStart(2, '0');
      const ext = match[1] === 'jpg' ? 'jpg' : match[1];
      const filename = `n${String(nextNum).padStart(2, '0')}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      fs.mkdirSync(path.join(PUBLIC, 'images'), { recursive: true });
      fs.writeFileSync(path.join(PUBLIC, 'images', filename), buf);

      let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'piece';
      while (products.some(p => p.slug === slug)) slug += '-' + nextNum;

      const sizes = Array.isArray(body.sizes) && body.sizes.length ? body.sizes : ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
      const perSize = Math.max(0, Number(body.stockPerSize) || 3);
      const stock = {};
      sizes.forEach(s => { stock[s] = perSize; });

      const product = {
        id, slug, name,
        category: String(body.category || 'kurta-sets').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        categoryLabel: String(body.categoryLabel || 'Kurta sets').trim(),
        price,
        mrp: Number(body.mrp) > price ? Number(body.mrp) : null,
        image: '/images/' + filename,
        badge: String(body.badge || '').trim() || null,
        published: body.published !== false,
        stock,
        fabric: String(body.fabric || '').trim() || 'Cotton',
        care: String(body.care || '').trim() || 'Dry clean recommended',
        colours: String(body.colours || '').trim(),
        description: String(body.description || '').trim() || name,
        details: String(body.details || '').split('\n').map(s => s.trim()).filter(Boolean)
      };
      products.push(product);
      store.write('products.json', products);
      return send(res, 201, { product });
    }

    if (a === 'products' && b && method === 'PATCH') {
      const p = findProduct(b);
      if (!p) return send(res, 404, { error: 'Product not found' });
      const body = await readBody(req);
      if ('published' in body) p.published = !!body.published;
      if ('price' in body) p.price = Number(body.price);
      if ('stock' in body) p.stock = body.stock;
      store.write('products.json', products);
      return send(res, 200, { product: p });
    }

    if (a === 'products' && b && method === 'DELETE') {
      const i = products.findIndex(p => p.id === b || p.slug === b);
      if (i === -1) return send(res, 404, { error: 'Product not found' });
      const [removed] = products.splice(i, 1);
      store.write('products.json', products);
      const img = path.join(PUBLIC, removed.image.replace(/^\//, ''));
      if (img.startsWith(path.join(PUBLIC, 'images'))) { try { fs.unlinkSync(img); } catch {} }
      return send(res, 200, { removed: removed.id });
    }

    if (a === 'orders' && method === 'GET') return send(res, 200, { orders: store.read('orders.json', []).reverse() });
  }

  return send(res, 404, { error: 'Unknown endpoint' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) =>
        e2 ? send(res, 404, { error: 'Not found' })
           : send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' }));
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const cache = /\.(jpg|jpeg|png|webp|svg)$/i.test(file) ? 'public, max-age=86400' : 'no-store';
    send(res, 200, buf, { 'Content-Type': type, 'Cache-Control': cache });
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (err) {
    send(res, 400, { error: err.message || 'Something went wrong' });
  }
}).listen(PORT, () => {
  console.log(`\n  Haute Attire by NK running at http://localhost:${PORT}`);
  console.log(`  Studio panel at http://localhost:${PORT}/#/studio  (passcode: ${ADMIN_PASSCODE})`);
  console.log(`  Orders go to WhatsApp +${WHATSAPP}\n`);
});
