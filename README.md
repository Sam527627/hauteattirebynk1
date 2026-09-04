# Haute Attire by NK — storefront

Node API on the back, plain HTML/CSS/JS on the front. No npm install, no build step, no database.

## Run it

```
cd haute-attire
node server.js
```

Open **http://localhost:3000**

Needs Node 18 or newer (`node -v` to check).

## How ordering works

No payment is taken on the site. A customer builds their bag, fills in name, WhatsApp number and address, and the order opens as a ready-written WhatsApp message to **+91 93101 40206** listing every item, size, quantity and the total. You confirm sizing and share UPI details from there.

Stock is decremented the moment the order is placed, so a size is held for that customer while you talk. Every order is also saved to `data/orders.json` and listed in the studio panel with a button to reopen the WhatsApp message.

To change the number: `WHATSAPP_NUMBER=91XXXXXXXXXX node server.js`

## Studio panel

http://localhost:3000/#/studio — passcode `hauteattire2026`

- **Add a piece** — choose a photo, type name and price, click add. Live immediately, no restart.
- **Unpublish** — hides a piece from the shop, keeps it in the panel.
- **Delete** — removes the piece and its photo for good.
- **Orders** — every order with a WhatsApp button to reopen the message.

Change the passcode with `ADMIN_PASSCODE=yourcode node server.js`

## What's on the site

Home page: rolling announcement bar, split hero with a slow zoom, three category tiles, New in, two brand panels, an Under ₹3,000 row, and the service strip.

Also: category and search pages with sorting, product pages with click-to-zoom and per-size stock warnings, a slide-out bag, wishlist, checkout, order confirmation, order tracking, size guide, shipping, returns, and a page explaining how ordering works.

Animations: sticky masthead that shrinks on scroll, sections that rise as you scroll to them, the product photo flying into the bag icon when added, bag counter pop, skeleton loaders while products fetch, free-shipping progress bar, and hover states throughout. All of it turns off automatically for anyone with reduced-motion enabled.

## Catalogue

15 pieces, ₹2,190 to ₹3,990.

- **Kurta sets (8)** — gajji silk bandhani, lilac and mauve tissue chanderi, rust and indigo bandhani, mustard and maroon botanical prints, ivory gold panel
- **Western (6)** — three charm bodysuits, three lace ribbon sheer shirts
- **Co-ord sets (1)** — blush floral shirt and trousers

## Photos

Five of the twenty you sent were left out — the mannequin shots carried another seller's "minaz" watermark across the garment, which can't be cropped away. If you get clean versions, add them through the studio panel.

The rest were cropped to remove the "Gajji silk suit" caption, the SK product code, and the STO studio logo.

## Files

```
server.js              API + static server
data/products.json     the catalogue
data/orders.json       orders (created on first order)
public/index.html      page shell
public/app.js          routing, cart, checkout, studio
public/styles.css      all styling and animation
public/images/         the 15 product photos
```

## Next

1. Second and third photo per product — the card and product page are ready for it.
2. Instagram feed on the home page.
3. Move `data/*.json` to Supabase when orders need to survive a redeploy.
