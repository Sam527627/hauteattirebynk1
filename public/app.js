/* Haute Attire by NK — front end */

const app = document.getElementById('app');
const state = { cart: null, wishlist: [], adminToken: null, config: { whatsapp: '919310140206' } };

/* ---------- helpers ---------- */
const rupees = n => '₹' + Number(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const go = hash => { location.hash = hash; };
const waLink = text => `https://wa.me/${state.config.whatsapp}?text=${encodeURIComponent(text)}`;

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(state.adminToken ? { Authorization: 'Bearer ' + state.adminToken } : {}),
      ...(options.headers || {})
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { data, status: res.status });
  return data;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function setCount(id, n, bump) {
  const el = document.getElementById(id);
  el.textContent = n;
  el.hidden = !n;
  if (bump && n) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

/* scroll-triggered reveals */
let observer;
function observeReveals() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -60px 0px', threshold: .04 });
  document.querySelectorAll('.reveal, .stagger').forEach(el => observer.observe(el));
}

/* image flies to the bag icon when added */
function flyToBag(imgEl) {
  if (!imgEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const from = imgEl.getBoundingClientRect();
  const to = document.getElementById('bagBtn').getBoundingClientRect();
  const flyer = document.createElement('div');
  flyer.id = 'flyer';
  flyer.style.left = from.left + from.width / 2 - 35 + 'px';
  flyer.style.top = from.top + from.height / 2 - 46 + 'px';
  flyer.style.setProperty('--fx', (to.left + to.width / 2 - from.left - from.width / 2) + 'px');
  flyer.style.setProperty('--fy', (to.top + to.height / 2 - from.top - from.height / 2) + 'px');
  flyer.innerHTML = `<img src="${imgEl.src}" alt="">`;
  document.body.appendChild(flyer);
  setTimeout(() => flyer.remove(), 780);
}

/* ---------- shared markup ---------- */
const heartIcon = `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 20S3.5 14.5 3.5 8.9A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 1.9C20.5 14.5 12 20 12 20z"/></svg>`;

const priceHtml = p => p.mrp && p.mrp > p.price
  ? `<em>${rupees(p.price)}</em> <s>${rupees(p.mrp)}</s>`
  : rupees(p.price);

function cardHtml(p) {
  const saved = state.wishlist.includes(p.id);
  const off = p.mrp && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  return `<a class="card" href="#/product/${p.slug}">
    <div class="shot">
      <img src="${p.image}" alt="${esc(p.name)}" loading="lazy">
      ${off ? `<span class="tag off">−${off}%</span>` : p.badge ? `<span class="tag">${esc(p.badge)}</span>` : ''}
      <button class="wish ${saved ? 'on' : ''}" data-wish="${p.id}" aria-label="Save ${esc(p.name)}">${heartIcon}</button>
      <span class="quick">View product</span>
    </div>
    <p class="brand">Haute Attire</p>
    <span class="name">${esc(p.name)}</span>
    <p class="price">${priceHtml(p)}</p>
  </a>`;
}

const backLink = (label, target) =>
  `<div class="wrap"><button class="back" data-back="${target || ''}">← ${esc(label)}</button></div>`;

function skeletonGrid(n = 8) {
  app.innerHTML = `<div class="wrap"><section><div class="grid">
    ${Array.from({ length: n }, () => `<div class="card"><div class="skel"></div></div>`).join('')}
  </div></section></div>`;
}

/* ---------- chrome ---------- */
async function buildNav() {
  const { categories } = await api('/categories');
  document.getElementById('navList').innerHTML =
    `<li><a href="#/occasion/diwali" class="fest-link">Festive Edit</a></li><li><a href="#/shop">New in</a></li>` +
    categories.map(c => `<li><a href="#/shop/${c.slug}">${esc(c.label)}</a></li>`).join('') +
    `<li><a href="#/help/sizing">Size guide</a></li><li><a href="#/help/ordering">How to order</a></li>`;
}

function buildPromo() {
  const f = state.config.festive;
  const msgs = [
    ...(f && f.live ? [`The Festive Edit — Diwali 2026`, `Use ${f.code} for ${f.percent}% off orders over ${rupees(f.minSpend)}`] : []),
    'Free shipping on orders over ₹2,499',
    'Order over WhatsApp — we confirm within the hour',
    'Every product cut in a small run',
    'Delivered across India in 3–5 working days'
  ];
  document.getElementById('promoTrack').innerHTML = [...msgs, ...msgs].map(m => `<span>${m}</span>`).join('');
}

async function refreshCart(cart, bump) {
  state.cart = cart || await api('/cart');
  setCount('bagCount', state.cart.count, bump);
  renderDrawer();
}

async function refreshWishlist() {
  const { ids } = await api('/wishlist');
  state.wishlist = ids;
  setCount('wishCount', ids.length);
}

function shippingBar(c) {
  if (!c.amountToFreeShipping) return c.subtotal ? `<p class="ship-note">Shipping is on us.</p>` : '';
  const pct = Math.min(100, Math.round((c.subtotal / 2499) * 100));
  return `<p class="ship-note">Add ${rupees(c.amountToFreeShipping)} more for free shipping.</p>
    <div class="bar"><i style="width:${pct}%"></i></div>`;
}


/* ---------- festive: totals rows, code + gift wrap ---------- */
function totalRows(c) {
  return `<div class="row"><span>Subtotal</span><span>${rupees(c.subtotal)}</span></div>
    ${c.discount ? `<div class="row fest"><span>${esc(c.codeApplied)} · ${state.config.festive.percent}% off</span><span>−${rupees(c.discount)}</span></div>` : ''}
    ${c.giftWrap ? `<div class="row"><span>Gift wrap</span><span>${rupees(c.giftWrap)}</span></div>` : ''}
    <div class="row"><span>Shipping</span><span>${c.shipping ? rupees(c.shipping) : 'Free'}</span></div>`;
}

function extrasHtml(c) {
  const f = state.config.festive;
  if (!f) return '';
  const codeBox = f.live ? `
    <div class="code-box">
      <label for="codeInput">Festive code</label>
      <div class="code-row">
        <input id="codeInput" placeholder="${esc(f.code)}" value="${esc(c.codeApplied || '')}" autocomplete="off" autocapitalize="characters">
        <button type="button" id="applyCode">${c.codeApplied ? 'Remove' : 'Apply'}</button>
      </div>
      <p class="code-msg ${c.codeApplied ? 'good' : ''}" id="codeMsg">${c.codeApplied ? `You saved ${rupees(c.discount)}.` : esc(c.codeNote || `${f.percent}% off orders over ${rupees(f.minSpend)}.`)}</p>
    </div>` : '';
  return `<div class="extras">${codeBox}
    <label class="gift"><input type="checkbox" id="giftToggle" ${c.giftWrap ? 'checked' : ''}>
      <span>Gift wrap this order · ${rupees(f.giftWrap)}</span></label>
    ${c.giftWrap ? `<textarea id="giftMsg" rows="2" maxlength="200" placeholder="A message for the handwritten card">${esc(c.giftMessage)}</textarea>` : ''}
  </div>`;
}

async function setExtras(body) {
  const c = await api('/cart/extras', { method: 'POST', body });
  state.cart = c;
  setCount('bagCount', c.count);
  renderDrawer();
  return c;
}

document.addEventListener('click', async e => {
  if (e.target.id === 'applyCode') {
    const input = document.getElementById('codeInput');
    const removing = state.cart && state.cart.codeApplied;
    try {
      const c = await setExtras({ code: removing ? '' : input.value });
      toast(removing ? 'Code removed' : c.codeApplied ? 'Festive code applied' : 'Code saved — it applies once your bag qualifies');
      if (location.hash.startsWith('#/cart')) viewCart();
    } catch (err) {
      const m = document.getElementById('codeMsg');
      if (m) { m.textContent = err.message; m.className = 'code-msg bad'; }
    }
  }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'giftToggle') {
    await setExtras({ gift: e.target.checked });
    if (location.hash.startsWith('#/cart')) viewCart();
  }
  if (e.target.id === 'giftMsg') await setExtras({ giftMessage: e.target.value });
});

/* ---------- festive: countdown ---------- */
let countdownTimer;
function diwaliParts() {
  const f = state.config.festive;
  const t = new Date(f.diwaliDate + 'T00:00:00+05:30').getTime() - Date.now();
  if (t <= 0) return null;
  return { d: Math.floor(t / 864e5), h: Math.floor(t / 36e5) % 24, m: Math.floor(t / 6e4) % 60, s: Math.floor(t / 1e3) % 60 };
}
function buildFestStrip() {
  const f = state.config.festive;
  const el = document.getElementById('festStrip');
  if (!f || !f.live) { el.hidden = true; return; }
  el.innerHTML = `<span>The Festive Edit · Diwali 2026</span>
    <i></i><span>Use <b>${esc(f.code)}</b> for ${f.percent}% off over ${rupees(f.minSpend)}</span>`;
  el.hidden = false;
}
function tickCountdown() {
  clearInterval(countdownTimer);
  const el = document.getElementById('heroCount');
  if (!el) return;
  const draw = () => {
    const p = diwaliParts();
    if (!document.getElementById('heroCount')) return clearInterval(countdownTimer);
    if (!p) { el.innerHTML = `<span class="hb">Happy Diwali</span>`; return; }
    const cell = (n, l) => `<div><b>${String(n).padStart(2, '0')}</b><span>${l}</span></div>`;
    el.innerHTML = cell(p.d, 'Days') + cell(p.h, 'Hours') + cell(p.m, 'Mins') + cell(p.s, 'Secs');
  };
  draw();
  countdownTimer = setInterval(draw, 1000);
}

function renderDrawer() {
  const c = state.cart;
  const body = document.getElementById('drawerBody');
  const foot = document.getElementById('drawerFoot');
  if (!c || !c.items.length) {
    body.innerHTML = `<div class="empty"><h2>Nothing here yet</h2><p>Products you add will show up here.</p></div>`;
    foot.innerHTML = `<a class="btn ghost" href="#/shop">Start shopping</a>`;
    return;
  }
  body.innerHTML = c.items.map(i => `
    <div class="line">
      <div class="thumb"><img src="${i.image}" alt="${esc(i.name)}"></div>
      <div>
        <span class="name">${esc(i.name)}</span>
        <p class="brand">Size ${esc(i.size)}</p>
        <div class="qty">
          <button data-q="dec" data-id="${i.productId}" data-size="${i.size}" aria-label="Reduce quantity">−</button>
          <span>${i.qty}</span>
          <button data-q="inc" data-id="${i.productId}" data-size="${i.size}" aria-label="Increase quantity">+</button>
        </div>
        <button class="rm" data-rm="${i.productId}" data-size="${i.size}">Remove</button>
      </div>
      <div class="end"><p class="price">${rupees(i.lineTotal)}</p></div>
    </div>`).join('');
  foot.innerHTML = `
    ${totalRows(c)}
    ${shippingBar(c)}
    <div class="row total"><span>Total</span><span>${rupees(c.total)}</span></div>
    <a class="btn" href="#/checkout" style="margin-top:18px" id="drawerCheckout">Checkout</a>`;
}

const scrim = document.getElementById('scrim');
const drawer = document.getElementById('drawer');
const openDrawer = () => { scrim.classList.add('open'); drawer.classList.add('open'); };
const closeDrawer = () => { scrim.classList.remove('open'); drawer.classList.remove('open'); };
document.getElementById('bagBtn').addEventListener('click', openDrawer);
document.getElementById('closeDrawer').addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* sticky masthead */
const mast = document.getElementById('mast');
addEventListener('scroll', () => mast.classList.toggle('stuck', scrollY > 90), { passive: true });

/* ---------- views ---------- */
const OCCASIONS = {
  navratri: { label: 'Navratri', line: 'Nine nights, nine colours — bandhani and tissue that move with the dance.' },
  'karwa-chauth': { label: 'Karwa Chauth', line: 'Reds, maroons and rust, finished for a long evening of waiting for the moon.' },
  diwali: { label: 'Diwali', line: 'Sequins, brocade and organza for the night the whole house is lit.' },
  'wedding-guest': { label: 'Wedding guest', line: 'Dressed for the sangeet, never upstaging the bride.' }
};
const diya = `<svg viewBox="0 0 40 40" class="diya"><path class="flame" d="M20 4c3 5 5 8 0 14-5-6-3-9 0-14z"/><path class="bowl" d="M4 24h32c0 8-7 13-16 13S4 32 4 24z"/><path class="rim" d="M4 24h32" /></svg>`;
const sparkles = Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37 + 8) % 96}%;animation-delay:${(i * 0.7) % 6}s;animation-duration:${6 + (i % 5)}s"></i>`).join('');
const notch = `<svg class="notch" viewBox="0 0 600 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0 2 H255 Q275 2 285 12 L300 22 L315 12 Q325 2 345 2 H600" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;

async function viewOccasion(slug) {
  const o = OCCASIONS[slug];
  if (!o) return go('#/shop');
  const { products, total } = await api('/products?occasion=' + encodeURIComponent(slug));
  app.innerHTML = `
    ${backLink('Home', '#/')}
    <section style="padding-top:12px"><div class="wrap">
      <p class="eyebrow">The Festive Edit</p>
      <div class="head"><h1>${esc(o.label)}</h1><span class="meta">${total} ${total === 1 ? 'product' : 'products'}</span></div>
      <p class="occ-line">${esc(o.line)}</p>
      <div class="filters">
        <a class="chip" href="#/shop">All</a>
        ${Object.entries(OCCASIONS).map(([k, v]) => `<a class="chip ${k === slug ? 'on' : ''}" href="#/occasion/${k}">${esc(v.label)}</a>`).join('')}
      </div>
      <div class="grid stagger">${products.map(cardHtml).join('')}</div>
    </div></section>`;
  observeReveals();
}

async function viewHome() {
  const [{ products }, { categories }] = await Promise.all([api('/products'), api('/categories')]);
  const f = state.config.festive;
  const festive = products.filter(p => p.festive);
  const six = (festive.length ? festive : products.filter(p => p.price >= 5000)).slice(0, 6);
  const by = slug => products.find(p => p.slug === slug);
  const hero = by('sona-crushed-tissue-anarkali-set') || six[0] || products[0];
  const spot = by('black-gold-brocade-hem-anarkali') || six[1] || products[1] || hero;
  const newIn = products.filter(p => p.badge === 'New').slice(0, 8);
  const occTiles = Object.entries(OCCASIONS).map(([k, v]) => {
    const p = products.find(x => (x.occasions || []).includes(k));
    return p ? { k, v, p, n: products.filter(x => (x.occasions || []).includes(k)).length } : null;
  }).filter(Boolean);

  app.innerHTML = `
    <div class="hero festive-hero">
      <div class="hero-img"><img src="${hero.image}" alt="${esc(hero.name)}"><span class="glint"></span>${sparkles}</div>
      <div class="hero-txt">
        <p class="eyebrow">The Festive Edit · Diwali 2026</p>
        <h1>Dressed for<br>the light</h1>
        <p>Tissue, brocade and hand-finished organza — cut in small runs in Delhi for the season of lamps, gifting and long evenings. Every Diwali piece under ₹8,000.</p>
        <div class="cta-row"><a class="btn rani" href="#/occasion/diwali">Shop the Festive Edit</a><a class="link-u" href="#/shop">All products</a></div>
      </div>
    </div>
    <div class="diyas" aria-hidden="true">${diya.repeat(9)}</div>

    <section>
      <div class="wrap">
        <div class="head reveal"><h2>Shop by occasion</h2><span class="meta">Four ways to celebrate</span></div>
        <div class="occ stagger">
          ${occTiles.map(({ k, v, p, n }) => `<a class="occ-tile" href="#/occasion/${k}">
            <img src="${p.image}" alt="${esc(v.label)}" loading="lazy">
            <span><em>${n} ${n === 1 ? 'product' : 'products'}</em>${esc(v.label)}</span></a>`).join('')}
        </div>
      </div>
    </section>

    <section class="spot-sec">
      <div class="wrap"><div class="spot reveal">
        <a class="spot-img" href="#/product/${spot.slug}"><img src="${spot.image}" alt="${esc(spot.name)}" loading="lazy"></a>
        <div class="spot-txt">
          <p class="eyebrow">Spotlight</p>
          <h2>${esc(spot.name)}</h2>
          <p>${esc(spot.description)}</p>
          <p class="spot-price">${rupees(spot.price)}</p>
          <a class="btn rani" href="#/product/${spot.slug}" style="max-width:260px">View product</a>
        </div>
      </div></div>
    </section>

    <section style="padding-top:0">
      <div class="wrap">
        <div class="head reveal"><h2>Festive, under ₹8,000</h2><a class="meta" href="#/occasion/diwali">See all Diwali</a></div>
        <div class="grid stagger">${six.map(cardHtml).join('')}</div>
      </div>
    </section>

    <section class="offer">
      <div class="wrap"><div class="offer-in reveal">
        <div>
          <p class="eyebrow">Festive offer</p>
          <h2>${f ? f.percent : 10}% off, for the season</h2>
          <p>${f && f.live ? `Use <b>${esc(f.code)}</b> in your bag on orders over ${rupees(f.minSpend)}. Valid until ${new Date(f.expires).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}.` : 'Look out for our next offer.'}</p>
        </div>
        <div class="gift-card">
          <h3>Sending it as a gift?</h3>
          <p>Add gift wrap in your bag for ${rupees(f ? f.giftWrap : 199)}. Write a message and we’ll put it on a handwritten card.</p>
          <a class="link-u" href="#/cart">Open my bag</a>
        </div>
      </div></div>
    </section>

    <section>
      <div class="wrap">
        <div class="head reveal"><h2>Shop by category</h2><a class="meta" href="#/shop">All products</a></div>
        <div class="cats stagger">
          ${categories.map(c => `<a class="cat" href="#/shop/${c.slug}">
            <img src="${c.image}" alt="${esc(c.label)}" loading="lazy">
            <span>${esc(c.label)}<b>${c.count} ${c.count === 1 ? 'product' : 'products'}</b></span></a>`).join('')}
        </div>
      </div>
    </section>

    <section style="padding-top:0">
      <div class="wrap">
        <div class="head reveal"><h2>New arrivals</h2><a class="meta" href="#/shop">View all ${products.length}</a></div>
        <div class="grid stagger">${newIn.map(cardHtml).join('')}</div>
      </div>
    </section>

    <section style="padding-top:0">
      <div class="wrap"><div class="split stagger">
        <div class="panel">
          <h3>Never mass-produced</h3>
          <p>Each style is finished in a small batch by hand. Once it sells out, it doesn't come back the same way twice.</p>
          <a class="link-u" href="#/shop">See what's in stock</a>
        </div>
        <div class="panel b">
          <h3>A real person replies</h3>
          <p>Add what you like to your bag — the order reaches us as a WhatsApp message, and we confirm your size and payment ourselves.</p>
          <a class="link-u" href="#/help/ordering">How it works</a>
        </div>
      </div></div>
    </section>

    <div class="wrap"><div class="svcs stagger">
      <div class="svc"><h4>Free shipping over ₹2,499</h4><p>Delivered across India in 3–5 working days.</p></div>
      <div class="svc"><h4>7-day returns</h4><p>Unworn, tags on. We arrange the pickup.</p></div>
      <div class="svc"><h4>Pay however suits you</h4><p>UPI or bank transfer, arranged on WhatsApp.</p></div>
      <div class="svc"><h4>Talk to us</h4><p>Message the studio, 10am–7pm daily.</p></div>
    </div></div>

    <section class="founder">
      <div class="wrap"><div class="inner reveal">
        <div class="founder-img"><img src="/images/founder.jpg" alt="Nidhi Kapoor, founder of Haute Attire by NK" loading="lazy"></div>
        <div>
          <p class="role">Meet the founder</p>
          <h2>Nidhi Kapoor</h2>
          <p>Haute Attire began in 2023, in a home in Delhi, with one stubborn idea: that a woman should not have to choose between a product that feels special and a price she can live with.</p>
          <p>Nidhi selects every fabric herself — the bandhani, the tissue chanderi, the mul cotton — and cuts each style in a small run rather than a bulk order. It means a style sometimes sells out in a week. It also means what you wear to a wedding is unlikely to walk past you at the same wedding.</p>
          <p>What started as a handful of orders between friends now ships across India, though the work still happens the same way: a WhatsApp message, a real conversation about your size and your occasion, and a parcel packed at home in Delhi.</p>
          <div class="facts">
            <div><b>2023</b><span>Founded</span></div>
            <div><b>Pan-India</b><span>Delivery</span></div>
            <div><b>Delhi</b><span>Where it's made</span></div>
          </div>
          <p class="sig">Nidhi Kapoor</p>
        </div>
      </div></div>
    </section>`;
  observeReveals();
}

async function viewShop(category, query) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (query) params.set('q', query);
  const sort = sessionStorage.getItem('sort') || '';
  if (sort) params.set('sort', sort);

  const [{ products, total }, { categories }] = await Promise.all([
    api('/products?' + params), api('/categories')
  ]);
  const title = query ? `Results for "${query}"` : category
    ? (categories.find(c => c.slug === category) || {}).label || 'Shop' : 'All products';

  app.innerHTML = `
    ${backLink('Home', '#/')}
    <section style="padding-top:12px"><div class="wrap">
      <div class="head"><h1>${esc(title)}</h1><span class="meta">${total} ${total === 1 ? 'product' : 'products'}</span></div>
      <div class="filters">
        <a class="chip ${!category && !query ? 'on' : ''}" href="#/shop">All</a>
        ${categories.map(c => `<a class="chip ${category === c.slug ? 'on' : ''}" href="#/shop/${c.slug}">${esc(c.label)}</a>`).join('')}
        <select class="chip" id="sort" aria-label="Sort products">
          <option value="">Sort: featured</option>
          <option value="price-asc" ${sort === 'price-asc' ? 'selected' : ''}>Price: low to high</option>
          <option value="price-desc" ${sort === 'price-desc' ? 'selected' : ''}>Price: high to low</option>
        </select>
      </div>
      ${products.length
        ? `<div class="grid stagger">${products.map(cardHtml).join('')}</div>`
        : `<div class="empty"><h2>Nothing matches that</h2><p>Try another category, or clear your search.</p></div>`}
    </div></section>`;
  observeReveals();

  document.getElementById('sort').addEventListener('change', e => {
    sessionStorage.setItem('sort', e.target.value);
    viewShop(category, query);
  });
}

async function viewProduct(slug) {
  const { product: p, related } = await api('/products/' + slug);
  const sizes = Object.keys(p.stock);
  const saved = state.wishlist.includes(p.id);
  const totalStock = Object.values(p.stock).reduce((a, b) => a + b, 0);

  app.innerHTML = `
    ${backLink('Back to ' + p.categoryLabel, '#/shop/' + p.category)}
    <div class="wrap"><div class="pdp">
      <div class="pdp-img" id="pdpImg"><img src="${p.image}" alt="${esc(p.name)}" id="pdpPhoto"></div>
      <div class="pdp-info">
        <p class="brand">Haute Attire · ${esc(p.categoryLabel)}</p>
        <h1>${esc(p.name)}</h1>
        <p class="price">${priceHtml(p)}</p>
        <p class="desc">${esc(p.description)}</p>

        <span class="label">Select size</span>
        <div class="sizes" id="sizes">
          ${sizes.map(s => `<button class="size ${p.stock[s] ? '' : 'out'}" data-size="${s}" ${p.stock[s] ? '' : 'disabled'}>${s}</button>`).join('')}
        </div>
        <p class="stock-note" id="stockNote">${totalStock <= 6 ? 'Only a few of these left' : ''}</p>

        <div class="btn-row">
          <button class="btn" id="addBtn">Add to bag</button>
          <button class="btn ghost" id="wishBtn">${saved ? 'Saved' : 'Save'}</button>
        </div>
        <a class="btn wa" id="askBtn" href="#" target="_blank" rel="noopener" style="margin-bottom:30px">Ask about this product</a>

        <div class="acc">
          <details open><summary>Details</summary><div class="body"><ul>${p.details.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div></details>
          <details><summary>Fabric &amp; care</summary><div class="body">${esc(p.fabric)}.${p.colours ? ` Available in ${esc(p.colours.toLowerCase())}.` : ''} ${esc(p.care)}.</div></details>
          <details><summary>Shipping &amp; returns</summary><div class="body">Dispatched in 2 working days, delivered in 3–5. Free over ₹2,499. Return within 7 days, unworn with tags.</div></details>
          <details><summary>How ordering works</summary><div class="body">Add what you want to the bag and fill in your address. The order arrives with us as a WhatsApp message, and we confirm sizing and payment from there. No card details are taken on this site.</div></details>
        </div>
      </div>
    </div></div>

    ${related.length ? `<section style="padding-top:0"><div class="wrap">
      <div class="head reveal"><h2>You may also like</h2></div>
      <div class="grid stagger">${related.map(cardHtml).join('')}</div>
    </div></section>` : ''}`;
  observeReveals();

  document.getElementById('askBtn').href = waLink(
    `Hi Haute Attire! I'd like to know more about "${p.name}" (${p.id}) — ${rupees(p.price)}.`
  );

  const pdpImg = document.getElementById('pdpImg');
  pdpImg.addEventListener('click', () => pdpImg.classList.toggle('zoom'));

  let chosen = null;
  const note = document.getElementById('stockNote');
  document.getElementById('sizes').addEventListener('click', e => {
    const btn = e.target.closest('.size');
    if (!btn || btn.disabled) return;
    document.querySelectorAll('.size').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    chosen = btn.dataset.size;
    const left = p.stock[chosen];
    note.textContent = left <= 3 ? `Only ${left} left in size ${chosen}` : '';
  });

  document.getElementById('addBtn').addEventListener('click', async e => {
    if (!chosen) { note.textContent = 'Choose a size first'; return; }
    e.target.disabled = true;
    try {
      const cart = await api('/cart', { method: 'POST', body: { productId: p.id, size: chosen } });
      flyToBag(document.getElementById('pdpPhoto'));
      await refreshCart(cart, true);
      toast(`${p.name} (${chosen}) added to your bag`);
      setTimeout(openDrawer, 600);
    } catch (err) { note.textContent = err.message; }
    e.target.disabled = false;
  });

  document.getElementById('wishBtn').addEventListener('click', async e => {
    const { ids, saved } = await api('/wishlist', { method: 'POST', body: { productId: p.id } });
    state.wishlist = ids;
    setCount('wishCount', ids.length, true);
    e.target.textContent = saved ? 'Saved' : 'Save';
    toast(saved ? 'Saved to your wishlist' : 'Removed from your wishlist');
  });
}

async function viewCart() {
  await refreshCart();
  const c = state.cart;
  if (!c.items.length) {
    app.innerHTML = `${backLink('Home', '#/')}<div class="wrap"><div class="empty"><h2>Your bag is empty</h2><p>Have a look at what's new this week.</p><p style="margin-top:20px"><a class="link-u" href="#/shop">Shop new in</a></p></div></div>`;
    return;
  }
  app.innerHTML = `
    ${backLink('Continue shopping', '#/shop')}
    <div class="wrap">
      <div class="head"><h1>Your bag</h1><span class="meta">${c.count} ${c.count === 1 ? 'item' : 'items'}</span></div>
      <div class="two">
        <div>${c.items.map(i => `
          <div class="line">
            <a class="thumb" href="#/product/${i.slug}"><img src="${i.image}" alt="${esc(i.name)}"></a>
            <div>
              <a class="name" href="#/product/${i.slug}">${esc(i.name)}</a>
              <p class="brand">Size ${esc(i.size)} · ${rupees(i.price)} each</p>
              <div class="qty">
                <button data-q="dec" data-id="${i.productId}" data-size="${i.size}" aria-label="Reduce quantity">−</button>
                <span>${i.qty}</span>
                <button data-q="inc" data-id="${i.productId}" data-size="${i.size}" aria-label="Increase quantity">+</button>
              </div>
              <button class="rm" data-rm="${i.productId}" data-size="${i.size}">Remove</button>
            </div>
            <div class="end"><p class="price">${rupees(i.lineTotal)}</p></div>
          </div>`).join('')}
        </div>
        <div class="summary">
          <h3>Order summary</h3>
          ${totalRows(c)}
          ${shippingBar(c)}
          ${extrasHtml(c)}
          <div class="row total"><span>Total</span><span>${rupees(c.total)}</span></div>
          <a class="btn" href="#/checkout" style="margin-top:22px">Checkout</a>
        </div>
      </div>
    </div>`;
}

async function viewCheckout() {
  await refreshCart();
  const c = state.cart;
  if (!c.items.length) return go('#/cart');
  app.innerHTML = `
    ${backLink('Back to bag', '#/cart')}
    <div class="wrap">
      <div class="head"><h1>Checkout</h1><span class="meta">${c.count} ${c.count === 1 ? 'item' : 'items'}</span></div>
      <div class="two">
        <form id="checkout" novalidate>
          <div class="note">No payment is taken on this site. Fill this in and your order opens as a WhatsApp message to the studio — we confirm sizing and share payment details there.</div>
          <div id="formError"></div>
          <span class="label">Your details</span>
          <div class="two-col">
            <div class="field" data-f="name"><label for="name">Full name</label><input id="name" name="name" autocomplete="name"></div>
            <div class="field" data-f="phone"><label for="phone">WhatsApp number</label><input id="phone" name="phone" inputmode="numeric" autocomplete="tel" placeholder="10 digits"></div>
          </div>
          <div class="field" data-f="email"><label for="email">Email — optional</label><input id="email" name="email" type="email" autocomplete="email"></div>

          <span class="label" style="margin-top:14px">Delivery address</span>
          <div class="field" data-f="address"><label for="address">Address</label><textarea id="address" name="address" rows="3" autocomplete="street-address"></textarea></div>
          <div class="two-col">
            <div class="field" data-f="city"><label for="city">City</label><input id="city" name="city" autocomplete="address-level2"></div>
            <div class="field" data-f="pincode"><label for="pincode">Pincode</label><input id="pincode" name="pincode" inputmode="numeric" autocomplete="postal-code"></div>
          </div>
          <div class="field"><label for="notes">Anything we should know? — optional</label><textarea id="notes" name="notes" rows="2" placeholder="Colour preference, delivery date, sizing question"></textarea></div>

          <button class="btn wa" type="submit" id="placeBtn">Place order on WhatsApp · ${rupees(c.total)}</button>
        </form>
        <div class="summary">
          <h3>Order summary</h3>
          ${c.items.map(i => `<div class="row"><span>${esc(i.name)} · ${esc(i.size)} × ${i.qty}</span><span>${rupees(i.lineTotal)}</span></div>`).join('')}
          <div class="row" style="border-top:1px solid var(--line);margin-top:10px;padding-top:14px"><span>Subtotal</span><span>${rupees(c.subtotal)}</span></div>
          ${c.discount ? `<div class="row fest"><span>${esc(c.codeApplied)}</span><span>−${rupees(c.discount)}</span></div>` : ''}
          ${c.giftWrap ? `<div class="row"><span>Gift wrap${c.giftMessage ? ' (with card)' : ''}</span><span>${rupees(c.giftWrap)}</span></div>` : ''}
          <div class="row"><span>Shipping</span><span>${c.shipping ? rupees(c.shipping) : 'Free'}</span></div>
          <div class="row total"><span>Total</span><span>${rupees(c.total)}</span></div>
        </div>
      </div>
    </div>`;

  document.getElementById('checkout').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('placeBtn');
    const errBox = document.getElementById('formError');
    document.querySelectorAll('.field').forEach(f => f.classList.remove('bad'));
    const body = Object.fromEntries(new FormData(e.target).entries());
    btn.disabled = true; btn.textContent = 'Placing order…';
    try {
      const { order } = await api('/orders', { method: 'POST', body });
      sessionStorage.setItem('lastOrder', order.id);
      window.open(order.whatsappUrl, '_blank', 'noopener');
      await refreshCart();
      go('#/order/' + order.id);
    } catch (err) {
      errBox.innerHTML = `<div class="error">${esc(err.message)}</div>`;
      (err.data?.fields || []).forEach(f => document.querySelector(`[data-f="${f}"]`)?.classList.add('bad'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      btn.disabled = false; btn.textContent = `Place order on WhatsApp · ${rupees(c.total)}`;
    }
  });
}

async function viewOrder(id) {
  try {
    const { order } = await api('/orders/' + id);
    app.innerHTML = `
      <div class="wrap"><section>
        <div class="ok" style="max-width:660px">Order ${esc(order.id)} is with us. If the WhatsApp window did not open, use the button below to send it — the order is not confirmed until we have your message.</div>
        <div class="head"><h1>Thank you, ${esc(order.customer.name.split(' ')[0])}</h1><span class="meta">${new Date(order.placedAt).toLocaleString('en-IN')}</span></div>
        <div class="two">
          <div>${order.items.map(i => `
            <div class="line">
              <div class="thumb"><img src="${i.image}" alt="${esc(i.name)}"></div>
              <div><span class="name">${esc(i.name)}</span><p class="brand">Size ${esc(i.size)} × ${i.qty}</p></div>
              <div class="end"><p class="price">${rupees(i.lineTotal)}</p></div>
            </div>`).join('')}
          </div>
          <div class="summary">
            <h3>Details</h3>
            <div class="row"><span>Status</span><span>${esc(order.status)}</span></div>
            <div class="row"><span>Ships to</span><span style="text-align:right;max-width:60%">${esc(order.shipTo.address)}, ${esc(order.shipTo.city)} ${esc(order.shipTo.pincode)}</span></div>
            ${order.discount ? `<div class="row fest"><span>${esc(order.codeApplied)}</span><span>−${rupees(order.discount)}</span></div>` : ''}
            ${order.giftWrap ? `<div class="row"><span>Gift wrap</span><span>${rupees(order.giftWrap)}</span></div>` : ''}
            <div class="row total"><span>Total</span><span>${rupees(order.total)}</span></div>
            <a class="btn wa" href="${esc(order.whatsappUrl)}" target="_blank" rel="noopener" style="margin-top:20px">Send on WhatsApp</a>
            <a class="btn ghost" href="#/shop" style="margin-top:10px">Keep shopping</a>
          </div>
        </div>
      </section></div>`;
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><h2>${esc(err.message)}</h2><p><a class="link-u" href="#/track">Try another order number</a></p></div></div>`;
  }
}

function viewTrack() {
  const last = sessionStorage.getItem('lastOrder') || '';
  app.innerHTML = `
    ${backLink('Home', '#/')}
    <div class="wrap"><section style="max-width:480px">
      <div class="head"><h1>Track your order</h1></div>
      <p style="color:var(--muted);margin-bottom:24px">Enter the order number from your confirmation, e.g. NK12345678.</p>
      <div id="trackError"></div>
      <div class="field"><label for="orderId">Order number</label><input id="orderId" value="${esc(last)}" placeholder="NK12345678"></div>
      <button class="btn" id="trackBtn">Find my order</button>
    </section></div>`;
  const find = () => {
    const id = document.getElementById('orderId').value.trim();
    if (!id) { document.getElementById('trackError').innerHTML = `<div class="error">Enter your order number first</div>`; return; }
    go('#/order/' + id);
  };
  document.getElementById('trackBtn').addEventListener('click', find);
  document.getElementById('orderId').addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
}

async function viewWishlist() {
  const { items } = await api('/wishlist');
  app.innerHTML = `
    ${backLink('Home', '#/')}
    <div class="wrap"><section style="padding-top:12px">
      <div class="head"><h1>Wishlist</h1><span class="meta">${items.length} saved</span></div>
      ${items.length
        ? `<div class="grid stagger">${items.map(cardHtml).join('')}</div>`
        : `<div class="empty"><h2>Nothing saved yet</h2><p>Tap the heart on any product to keep it here.</p><p style="margin-top:20px"><a class="link-u" href="#/shop">Browse new in</a></p></div>`}
    </section></div>`;
  observeReveals();
}

const HELP = {
  sizing: {
    title: 'Size guide',
    body: () => `<p>All measurements are body measurements in inches. If you are between sizes, take the larger one — our kurtas are cut close through the shoulder.</p>
    <table class="admin-table" style="margin-top:24px">
      <tr><th>Size</th><th>Bust</th><th>Waist</th><th>Hip</th></tr>
      <tr><td>XS</td><td>32</td><td>26</td><td>35</td></tr>
      <tr><td>S</td><td>34</td><td>28</td><td>37</td></tr>
      <tr><td>M</td><td>36</td><td>30</td><td>39</td></tr>
      <tr><td>L</td><td>38</td><td>32</td><td>41</td></tr>
      <tr><td>XL</td><td>40</td><td>34</td><td>43</td></tr>
      <tr><td>XXL</td><td>42</td><td>36</td><td>45</td></tr>
    </table>
    <p style="margin-top:20px">Unstitched sets can be tailored to any size — message us with your measurements and we will tell you what the fabric allows.</p>
    <p style="margin-top:16px"><a class="btn wa" style="max-width:280px" href="${waLink("Hi Haute Attire! I need help with sizing.")}" target="_blank" rel="noopener">Ask about sizing</a></p>`
  },
  shipping: {
    title: 'Shipping',
    body: () => `<p>Orders are dispatched within two working days and delivered across India in three to five. Shipping is free over ₹2,499; below that it is ₹149.</p>
    <p style="margin-top:14px">You will get a tracking link on WhatsApp as soon as your parcel leaves the studio.</p>`
  },
  returns: {
    title: 'Returns',
    body: () => `<p>Return anything within seven days of delivery, unworn and with the tags on. We arrange the pickup at no cost to you.</p>
    <p style="margin-top:14px">Refunds are sent back within five working days of the parcel reaching us. Unstitched sets that have been cut or tailored cannot be returned.</p>`
  },
  ordering: {
    title: 'How ordering works',
    body: () => `<p>We keep this simple, and we do not take card details on this website.</p>
    <ol style="padding-left:18px;display:grid;gap:12px;margin:22px 0">
      <li>Add the products you want to your bag and pick your size.</li>
      <li>Fill in your name, WhatsApp number and delivery address at checkout.</li>
      <li>Your order opens as a ready-written WhatsApp message. Send it.</li>
      <li>We reply to confirm stock and sizing, then share UPI or bank details.</li>
      <li>Once payment is in, your parcel is dispatched within two working days.</li>
    </ol>
    <p>Your size is held for you from the moment the order is placed, so nothing gets sold from under you while we talk.</p>
    <p style="margin-top:16px"><a class="btn wa" style="max-width:280px" href="${waLink("Hi Haute Attire! I have a question about ordering.")}" target="_blank" rel="noopener">Message the studio</a></p>`
  }
};

function viewHelp(topic) {
  const h = HELP[topic] || HELP.sizing;
  app.innerHTML = `${backLink('Home', '#/')}<div class="wrap"><section style="max-width:660px">
    <div class="head"><h1>${esc(h.title)}</h1></div>${h.body()}</section></div>`;
}

/* ---------- studio ---------- */
async function viewStudio() {
  if (!state.adminToken) {
    app.innerHTML = `${backLink('Home', '#/')}<div class="wrap"><section style="max-width:400px">
      <div class="head"><h1>Studio panel</h1></div>
      <div id="loginError"></div>
      <div class="field"><label for="pass">Passcode</label><input id="pass" type="password" autocomplete="current-password"></div>
      <button class="btn" id="loginBtn">Sign in</button>
    </section></div>`;
    const submit = async () => {
      try {
        const { token } = await api('/admin/login', { method: 'POST', body: { passcode: document.getElementById('pass').value } });
        state.adminToken = token;
        sessionStorage.setItem('adminToken', token);
        viewStudio();
      } catch (err) { document.getElementById('loginError').innerHTML = `<div class="error">${esc(err.message)}</div>`; }
    };
    document.getElementById('loginBtn').addEventListener('click', submit);
    document.getElementById('pass').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    return;
  }

  const [{ products }, { orders }] = await Promise.all([api('/admin/products'), api('/admin/orders')]);
  const cats = [
    { slug: 'kurta-sets', label: 'Kurta sets' },
    { slug: 'co-ords', label: 'Co-ord sets' },
    { slug: 'western', label: 'Western' },
    { slug: 'indo-western', label: 'Indo-Western' },
    { slug: 'occasion-wear', label: 'Occasion Wear' },
    { slug: 'jackets', label: 'Jackets' },
    { slug: 'party-sets', label: 'Party Sets' },
    { slug: 'sarees', label: 'Sarees' },
    { slug: 'lehengas', label: 'Lehengas' },
    { slug: 'jewellery', label: 'Jewellery' }
  ];

  app.innerHTML = `
    ${backLink('Home', '#/')}
    <div class="wrap"><section style="padding-top:12px">
      <div class="head"><h1>Studio panel</h1><button class="meta" id="signOut">Sign out</button></div>

      <div class="add-box">
        <div class="add-head">
          <h2>Add a product</h2>
          <button class="mini" id="toggleAdd">Open form</button>
        </div>
        <form id="addForm" hidden>
          <div id="addMsg"></div>
          <div class="add-grid">
            <div>
              <span class="label">Photo</span>
              <label class="drop" id="drop">
                <input type="file" id="photo" accept="image/jpeg,image/png,image/webp" hidden>
                <img id="preview" alt="" hidden>
                <span id="dropText">Click to choose a photo<br><small>JPG or PNG, under 8MB</small></span>
              </label>
            </div>
            <div>
              <div class="field" data-f="name"><label for="pName">Name of the product</label>
                <input id="pName" placeholder="e.g. Sage green cotton kurta set"></div>
              <div class="two-col">
                <div class="field" data-f="price"><label for="pPrice">Price (₹)</label>
                  <input id="pPrice" inputmode="numeric" placeholder="3490"></div>
                <div class="field"><label for="pMrp">Was (₹) — optional</label>
                  <input id="pMrp" inputmode="numeric" placeholder="Leave blank if no discount"></div>
              </div>
              <div class="two-col">
                <div class="field"><label for="pCat">Category</label>
                  <select id="pCat">${cats.map(c => `<option value="${c.slug}|${c.label}">${c.label}</option>`).join('')}</select></div>
                <div class="field"><label for="pStock">Stock per size</label>
                  <input id="pStock" inputmode="numeric" value="3"></div>
              </div>
              <div class="two-col">
                <div class="field"><label for="pFabric">Fabric</label>
                  <input id="pFabric" placeholder="e.g. Cotton chanderi"></div>
                <div class="field"><label for="pBadge">Badge — optional</label>
                  <input id="pBadge" placeholder="e.g. New, Last few"></div>
              </div>
              <div class="field"><label for="pColours">Colours — optional</label>
                <input id="pColours" placeholder="e.g. Fuchsia, red, mocha"></div>
              <div class="field"><label for="pDesc">Description</label>
                <textarea id="pDesc" rows="3" placeholder="Two or three lines about the product."></textarea></div>
              <div class="field"><label for="pDetails">Details — one per line</label>
                <textarea id="pDetails" rows="3" placeholder="Hand-done chikankari yoke&#10;Matching dupatta included&#10;Three-piece set"></textarea></div>
              <button class="btn" type="submit" id="addBtn">Add to the shop</button>
            </div>
          </div>
        </form>
      </div>

      <h2 style="font-family:var(--serif);font-size:18px;letter-spacing:.12em;text-transform:uppercase;margin:44px 0 16px">Catalogue (${products.length})</h2>
      <table class="admin-table"><tbody>
        <tr><th></th><th>Piece</th><th>Price</th><th>In stock</th><th>Status</th><th></th></tr>
        ${products.map(p => {
          const total = Object.values(p.stock).reduce((a, b) => a + b, 0);
          return `<tr>
            <td><div class="th"><img src="${p.image}" alt=""></div></td>
            <td>${esc(p.name)}<br><span class="brand">${esc(p.id)} · ${esc(p.categoryLabel)}</span></td>
            <td>${rupees(p.price)}</td>
            <td>${total}</td>
            <td><span class="pill ${p.published ? 'live' : 'draft'}">${p.published ? 'Live' : 'Draft'}</span></td>
            <td style="white-space:nowrap">
              <button class="mini" data-pub="${p.id}" data-to="${p.published ? 'false' : 'true'}">${p.published ? 'Unpublish' : 'Publish'}</button>
              <button class="mini danger" data-del="${p.id}" data-name="${esc(p.name)}">Delete</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table>

      <h2 style="font-family:var(--serif);font-size:18px;letter-spacing:.12em;text-transform:uppercase;margin:48px 0 16px">Orders (${orders.length})</h2>
      ${orders.length ? `<table class="admin-table"><tbody>
        <tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th>Total</th><th></th></tr>
        ${orders.map(o => `<tr>
          <td><a href="#/order/${o.id}">${esc(o.id)}</a></td>
          <td>${new Date(o.placedAt).toLocaleDateString('en-IN')}</td>
          <td>${esc(o.customer.name)}<br><span class="brand">${esc(o.customer.phone)}</span>${o.giftWrap ? `<br><span class="brand">🎁 Gift wrap${o.giftMessage ? ` — “${esc(o.giftMessage)}”` : ''}</span>` : ''}${o.discount ? `<br><span class="brand">${esc(o.codeApplied)} −${rupees(o.discount)}</span>` : ''}</td>
          <td>${o.items.reduce((s, i) => s + i.qty, 0)}</td>
          <td>${rupees(o.total)}</td>
          <td><a class="mini" href="${esc(o.whatsappUrl || '#')}" target="_blank" rel="noopener">WhatsApp</a></td>
        </tr>`).join('')}
      </tbody></table>` : `<p style="color:var(--muted)">No orders yet. Place a test order from the shop and it will appear here.</p>`}
    </section></div>`;

  document.getElementById('signOut').addEventListener('click', () => {
    state.adminToken = null; sessionStorage.removeItem('adminToken'); viewStudio();
  });

  const form = document.getElementById('addForm');
  document.getElementById('toggleAdd').addEventListener('click', e => {
    form.hidden = !form.hidden;
    e.target.textContent = form.hidden ? 'Open form' : 'Close form';
    if (!form.hidden) document.getElementById('pName').focus();
  });

  let photoData = null;
  const fileInput = document.getElementById('photo');
  document.getElementById('drop').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('That photo is over 8MB — pick a smaller one'); fileInput.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      photoData = reader.result;
      const img = document.getElementById('preview');
      img.src = photoData; img.hidden = false;
      document.getElementById('dropText').hidden = true;
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('addMsg');
    const btn = document.getElementById('addBtn');
    document.querySelectorAll('.add-box .field').forEach(f => f.classList.remove('bad'));
    const [catSlug, catLabel] = document.getElementById('pCat').value.split('|');
    btn.disabled = true; btn.textContent = 'Adding…';
    try {
      const { product } = await api('/admin/products', {
        method: 'POST',
        body: {
          name: document.getElementById('pName').value,
          price: document.getElementById('pPrice').value,
          mrp: document.getElementById('pMrp').value,
          category: catSlug, categoryLabel: catLabel,
          stockPerSize: document.getElementById('pStock').value,
          fabric: document.getElementById('pFabric').value,
          badge: document.getElementById('pBadge').value,
          colours: document.getElementById('pColours').value,
          description: document.getElementById('pDesc').value,
          details: document.getElementById('pDetails').value,
          photo: photoData
        }
      });
      toast(`${product.name} is live on the shop`);
      await buildNav();
      viewStudio();
    } catch (err) {
      msg.innerHTML = `<div class="error">${esc(err.message)}</div>`;
      (err.data?.fields || []).forEach(f => document.querySelector(`.add-box [data-f="${f}"]`)?.classList.add('bad'));
      btn.disabled = false; btn.textContent = 'Add to the shop';
    }
  });

  app.addEventListener('click', async e => {
    const pub = e.target.closest('[data-pub]');
    if (pub) {
      await api('/admin/products/' + pub.dataset.pub, { method: 'PATCH', body: { published: pub.dataset.to === 'true' } });
      toast('Catalogue updated');
      await buildNav();
      return viewStudio();
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!confirm(`Delete "${del.dataset.name}"? This removes it and its photo for good.`)) return;
      await api('/admin/products/' + del.dataset.del, { method: 'DELETE' });
      toast('Piece deleted');
      await buildNav();
      return viewStudio();
    }
  }, { once: true });
}

/* ---------- router ---------- */
async function router() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (['shop', 'search', 'occasion', undefined].includes(parts[0])) skeletonGrid();
  try {
    switch (parts[0]) {
      case undefined: await viewHome(); break;
      case 'shop': await viewShop(parts[1] || null, null); break;
      case 'search': await viewShop(null, decodeURIComponent(parts[1] || '')); break;
      case 'occasion': await viewOccasion(parts[1]); break;
      case 'product': await viewProduct(parts[1]); break;
      case 'cart': await viewCart(); break;
      case 'checkout': await viewCheckout(); break;
      case 'order': await viewOrder(parts[1]); break;
      case 'wishlist': await viewWishlist(); break;
      case 'track': viewTrack(); break;
      case 'help': viewHelp(parts[1]); break;
      case 'studio': await viewStudio(); break;
      default:
        app.innerHTML = `<div class="wrap"><div class="empty"><h2>Page not found</h2><p><a class="link-u" href="#/">Go back home</a></p></div></div>`;
    }
  } catch (err) {
    app.innerHTML = `<div class="wrap"><div class="empty"><h2>${esc(err.message)}</h2><p><a class="link-u" href="#/">Go back home</a></p></div></div>`;
  }
}

/* ---------- global handlers ---------- */
document.addEventListener('click', async e => {
  const back = e.target.closest('[data-back]');
  if (back) { back.dataset.back ? go(back.dataset.back) : history.back(); return; }

  const wish = e.target.closest('[data-wish]');
  if (wish) {
    e.preventDefault();
    const { ids, saved } = await api('/wishlist', { method: 'POST', body: { productId: wish.dataset.wish } });
    state.wishlist = ids;
    setCount('wishCount', ids.length, true);
    wish.classList.toggle('on', saved);
    toast(saved ? 'Saved to your wishlist' : 'Removed from your wishlist');
    return;
  }

  const q = e.target.closest('[data-q]');
  if (q) {
    const line = state.cart.items.find(i => i.productId === q.dataset.id && i.size === q.dataset.size);
    const next = line.qty + (q.dataset.q === 'inc' ? 1 : -1);
    try {
      const cart = await api('/cart', { method: 'PATCH', body: { productId: q.dataset.id, size: q.dataset.size, qty: next } });
      await refreshCart(cart, true);
      if (location.hash.startsWith('#/cart')) viewCart();
      if (location.hash.startsWith('#/checkout')) viewCheckout();
    } catch (err) { toast(err.message); }
    return;
  }

  const rm = e.target.closest('[data-rm]');
  if (rm) {
    const cart = await api('/cart', { method: 'DELETE', body: { productId: rm.dataset.rm, size: rm.dataset.size } });
    await refreshCart(cart);
    toast('Removed from your bag');
    if (location.hash.startsWith('#/cart')) viewCart();
    if (location.hash.startsWith('#/checkout')) location.hash = cart.items.length ? '#/checkout' : '#/cart';
    return;
  }

  if (e.target.closest('#drawerCheckout')) closeDrawer();
});

document.getElementById('search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (q) { closeDrawer(); go('#/search/' + encodeURIComponent(q)); }
});
document.getElementById('menuBtn').addEventListener('click', () => {
  const q = prompt('Search for a product');
  if (q && q.trim()) go('#/search/' + encodeURIComponent(q.trim()));
});

document.getElementById('subBtn').addEventListener('click', async () => {
  const msg = document.getElementById('subMsg');
  try {
    const { message } = await api('/newsletter', { method: 'POST', body: { email: document.getElementById('subEmail').value.trim() } });
    msg.style.color = 'var(--jade-deep)'; msg.textContent = message;
    document.getElementById('subEmail').value = '';
  } catch (err) { msg.style.color = 'var(--sale)'; msg.textContent = err.message; }
});

/* ---------- first-visit 3D intro ---------- */
function runIntro() {
  const el = document.getElementById('intro');
  if (!el) return;
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const seen = isLocal ? false : localStorage.getItem('ha_intro_seen');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (seen || reduced) { el.classList.add('gone'); return; }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    localStorage.setItem('ha_intro_seen', '1');
    el.classList.add('leaving');
    setTimeout(() => el.classList.add('gone'), 780);
  };
  document.getElementById('introSkip').addEventListener('click', finish);
  el.addEventListener('click', finish);
  setTimeout(finish, 2600);
}

/* ---------- 3D card tilt (desktop hover only) ---------- */
function initCardTilt() {
  if (!window.matchMedia('(hover: hover)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener('mousemove', e => {
    const shot = e.target.closest('.shot');
    if (!shot) return;
    const r = shot.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    shot.style.setProperty('--rx', (px * 6).toFixed(2) + 'deg');
    shot.style.setProperty('--ry', (-py * 6).toFixed(2) + 'deg');
  }, { passive: true });
}

window.addEventListener('hashchange', router);

(async function init() {
  runIntro();
  initCardTilt();
  state.adminToken = sessionStorage.getItem('adminToken');
  try { state.config = await api('/config'); } catch {}
  buildPromo();
  buildFestStrip();
  const hello = waLink('Hi Haute Attire! I saw your site and had a question.');
  document.getElementById('waFloat').href = hello;
  document.getElementById('waFooter').href = hello;
  await Promise.all([buildNav(), refreshCart(), refreshWishlist()]);
  router();
})();
