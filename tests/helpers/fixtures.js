'use strict';

/* Minimal stand-ins for the markup the sections render. They carry only the
   hooks the section JavaScript reads, so a fixture stays readable and a
   markup change that drops a hook shows up as a failing test. */

/* Two options (S/M) across two media items. Variant 11 (S) is featured on
   media 1, variant 12 (M) on media 2; the S/L combination does not exist,
   which is the invalid-option case. */
/* `embed` appends an external-video item; `embedFirst` makes it the media the
   page opens on. Its iframe carries data-src and no src, the way the section
   renders one: an iframe fetches its src whether or not anything is showing it,
   so the URL is withheld until the gallery shows that item. */
function productSection({
  id = 'a',
  selected = 'S',
  videoFallback = false,
  embed = false,
  embedFirst = false
} = {}) {
  const variants = [
    { id: 11, options: ['S'], available: true },
    { id: 12, options: ['M'], available: true }
  ];
  const variantMedia = { 11: 1, 12: 2 };

  const option = (value) => `
        <input type="radio" name="Option-${id}" value="${value}"
               id="opt-${id}-${value}" data-option-input
               ${value === selected ? 'checked' : ''}>`;

  const embedItem = `
    <div data-stage-item data-media-id="4">
      <iframe class="product__image" title="external clip"
              data-src="https://www.youtube.com/embed/keepsake"></iframe>
    </div>`;

  const stageItems = [
    `
    <div data-stage-item data-media-id="1"${embedFirst ? '' : ' class="is-active"'}>
      <button type="button" data-zoom-open="${embedFirst ? 1 : 0}"
              data-preview="one-preview.jpg" data-full="one-full.jpg">
        <img src="one.jpg" srcset="one-400.jpg 400w, one-800.jpg 800w" sizes="50vw" alt="one">
      </button>
    </div>`,
    `
    <div data-stage-item data-media-id="2">
      <button type="button" data-zoom-open="${embedFirst ? 2 : 1}"
              data-preview="two-preview.jpg" data-full="two-full.jpg">
        <img src="two.jpg" srcset="two-400.jpg 400w, two-800.jpg 800w" sizes="50vw" alt="two">
      </button>
    </div>`
  ];

  if (videoFallback) {
    stageItems.push(`
    <div data-stage-item data-media-id="3">
      <video><img src="video-fallback.jpg"
                  srcset="video-fallback-400.jpg 400w, video-fallback-800.jpg 800w"
                  sizes="50vw" alt="video fallback"></video>
    </div>`);
  }

  if (embedFirst) stageItems.unshift(embedItem.replace('<div data-stage-item', '<div class="is-active" data-stage-item'));
  else if (embed) stageItems.push(embedItem);

  const thumbLabels = ['one-thumb.jpg', 'two-thumb.jpg'];
  if (videoFallback) thumbLabels.push('video-thumb.jpg');
  if (embedFirst) thumbLabels.unshift('embed-thumb.jpg');
  else if (embed) thumbLabels.push('embed-thumb.jpg');

  const thumbs = thumbLabels
    .map(
      (src, i) =>
        `<button type="button" data-thumb="${i}"><img src="${src}" alt="">t${i + 1}</button>`
    )
    .join('\n      ');

  return `
<div class="product" data-product data-pid="${id}"
     data-cart-add-url="/cart/add.js"
     data-status-adding="Adding" data-status-add-error="Add error"
     data-media-loading-template="Loading image __INDEX__ of __COUNT__…"
     data-media-position-template="Image __INDEX__ of __COUNT__"
     data-media-loaded-template="Image __INDEX__ of __COUNT__ loaded."
     data-media-error="Image error">
  <div data-gallery>
    ${stageItems.join('')}
    <button type="button" data-gallery-prev>previous media</button>
    <button type="button" data-gallery-next>next media</button>
    <div data-gallery-status hidden>
      <span data-gallery-spinner></span>
      <span data-gallery-status-text></span>
      <button type="button" data-gallery-retry hidden>Retry</button>
    </div>
    <p data-gallery-live></p>
    <div data-thumbs>
      ${thumbs}
    </div>
  </div>

  <dialog data-lightbox>
    <button type="button" data-lightbox-close>close</button>
    <button type="button" data-lightbox-prev>previous</button>
    <img data-lightbox-image alt="">
    <div data-lightbox-loader hidden>
      <span data-lightbox-loader-text></span>
    </div>
    <div>
      <span data-lightbox-counter></span>
      <span data-lightbox-error hidden></span>
      <button type="button" data-lightbox-retry hidden>Retry</button>
    </div>
    <p data-lightbox-live></p>
    <button type="button" data-lightbox-next>next</button>
  </dialog>

  <script type="application/json" data-variants>${JSON.stringify(variants)}</script>
  <script type="application/json" data-variant-media>${JSON.stringify(variantMedia)}</script>

  <form class="product__form">
    <div data-option-position="1">${option('S')}${option('M')}${option('L')}</div>
    <div data-variant-select-wrapper>
      <select data-variant-select>
        <option value="11" data-price="$10" data-available="true">S</option>
        <option value="12" data-price="$12" data-available="true">M</option>
      </select>
    </div>
    <p data-price>$10</p>
    <input type="hidden" name="id" value="11">
    <input type="text" name="properties[Note]" data-property-optional value="">
    <button type="submit" data-add-button
            data-label-add="Add to cart"
            data-label-soldout="Sold out"
            data-label-unavailable="Unavailable">Add to cart</button>
    <p data-add-status></p>
  </form>
</div>`;
}

function cartSection({ quantity = 1, marker = 'original' } = {}) {
  return `
<div class="cart" data-cart-section data-section-id="cart" data-marker="${marker}"
     data-cart-change-url="/cart/change.js"
     data-cart-update-url="/cart/update.js"
     data-cart-page-url="/cart"
     data-status-updating="Updating" data-status-updated="Updated"
     data-status-note-saved="Note saved" data-status-error="Error"
     data-status-invalid-quantity="Invalid">
  <h1 data-cart-title>Cart</h1>
  <p class="cart__status" data-cart-status></p>
  <form class="cart__form" action="/cart" method="post">
    <div class="cart__row" data-cart-line data-line-key="k1" data-line-index="1">
      <input type="number" name="updates[]" value="${quantity}" min="0"
             data-cart-quantity data-cart-control="quantity"
             data-line-key="k1" data-line-index="1"
             data-current-quantity="${quantity}">
    </div>
    <button type="submit">Update</button>
  </form>
</div>`;
}

/* A hero carousel wrapped in the `.shopify-section` div Shopify emits, because
   the section measures its offset from that wrapper and the theme editor
   dispatches load/unload against it. `interval` is milliseconds; tests keep it
   short so autoplay can be observed without long waits. */
function heroSection({ id = 'hero', slides = 3, autoplay = true, interval = 60, active = 0 } = {}) {
  /* Artwork is deferred by position in the markup, not by which slide happens
     to be showing: the section renders the first slide's URLs into src and
     srcset and every later slide's into data-src and data-srcset, because they
     all share one grid cell and lazy loading cannot tell them apart. Keyed to
     `i === 0` here for the same reason it is keyed to `forloop.first` there. */
  const media = (i) => {
    const attr = i === 0 ? '' : 'data-';
    const priority = i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    return `
        <div class="hero__media">
          <picture class="hero__picture">
            <source media="(max-width: 749px)" sizes="100vw"
                    ${attr}srcset="/mobile-${i}-750.jpg 750w">
            <img class="hero__image" data-image="${i}" alt="Slide ${i}" sizes="100vw" ${priority}
                 ${attr}srcset="/desktop-${i}-1200.jpg 1200w" ${attr}src="/desktop-${i}-1200.jpg">
          </picture>
        </div>`;
  };

  /* Each slide carries a link, the way a real slide carries its call to
     action — that is what a keyboard user can be focused on when the carousel
     rotates out from under them. */
  const slide = (i) => `
      <div class="hero__slide" data-hero-slide
           data-slide="${i}"
           ${i === active ? 'data-active' : 'aria-hidden="true" inert'}>
        ${media(i)}
        <p class="hero__heading">Slide ${i}</p>
        <a class="hero__button" data-slide-cta="${i}" href="/slide-${i}">Shop ${i}</a>
      </div>`;

  const dot = (i) => `
        <button type="button" data-hero-dot data-dot="${i}"
                ${i === active ? 'aria-current="true"' : ''}></button>`;

  const indexes = Array.from({ length: slides }, (unused, i) => i);

  return `
<div class="shopify-section" id="section-${id}">
  <div class="hero" data-hero data-hid="${id}"
       data-autoplay="${autoplay}" data-interval="${interval}">
    <div class="hero__slides">${indexes.map(slide).join('')}</div>
    <div class="hero__controls">
      <button type="button" data-hero-prev>prev</button>
      <div class="hero__dots">${indexes.map(dot).join('')}</div>
      <button type="button" data-hero-next>next</button>
    </div>
  </div>
</div>`;
}

/* A header with two nested-menu dropdowns and the search disclosure. Only the
   hooks the section reads are here: the disclosures themselves, the search
   input the panel focuses, and the `.header` root the section scopes to. */
function headerSection({ search = true } = {}) {
  const dropdown = (name, label) => `
      <details class="header__dropdown" data-header-dropdown data-menu="${name}">
        <summary class="header__nav-link--parent">${label}</summary>
        <div class="header__panel">
          <a class="header__panel-link" href="/collections/${name}">${label} one</a>
          <a class="header__panel-link" href="/collections/${name}-two">${label} two</a>
        </div>
      </details>`;

  const searchDisclosure = `
      <details class="header__search" data-header-search>
        <summary class="header__search-toggle">Search</summary>
        <div class="header__search-panel">
          <form role="search" action="/search" method="get">
            <input type="search" name="q" data-search-input>
          </form>
        </div>
      </details>`;

  /* The mobile drawer. Its close button ships hidden — only the script can
     close a <details> from the inside, so it is not offered until the script
     is there to act on it. */
  const menu = `
    <details class="header__menu" scroll-lock>
      <summary class="header__menu-toggle">Menu</summary>
      <div class="header__drawer">
        <button type="button" class="header__drawer-close" data-drawer-close hidden>Close</button>
        <nav class="header__drawer-nav"><a href="/about">About</a></nav>
      </div>
    </details>`;

  return `
<div class="shopify-section" id="section-header">
  <header class="header full-width">${menu}
    <nav class="header__nav">${dropdown('shop', 'Shop')}${dropdown('gifts', 'Gifts')}
      <a class="header__nav-link" href="/about">About</a>
    </nav>
    <div class="header__actions">${search ? searchDisclosure : ''}</div>
  </header>
</div>`;
}

/* The drawer as the layout renders it. `marker` identifies which render a test
   is looking at, the way cartSection's does, so a swap can be told apart from a
   node that never changed. */
function cartDrawerSection({ itemCount = 1, quantity = 1, marker = 'original' } = {}) {
  const line = `
      <li data-cart-line data-line-key="k1" data-line-index="1">
        <span data-line-quantity>${quantity}</span>
        <button type="button" data-drawer-qty-step="-1" data-line-index="1" data-line-key="k1">-</button>
        <button type="button" data-drawer-qty-step="1" data-line-index="1" data-line-key="k1">+</button>
        <a href="/cart/change?id=k1&amp;quantity=0" data-cart-drawer-remove
           data-line-index="1" data-line-key="k1">Remove</a>
      </li>`;

  return `
<dialog class="cart-drawer" data-cart-drawer
        data-section-id="cart-drawer"
        data-cart-change-url="/cart/change.js"
        data-cart-page-url="/cart"
        data-status-error="Error">
  <div class="cart-drawer__contents" data-cart-drawer-contents
       data-item-count="${itemCount}" data-marker="${marker}">
    <h2 data-cart-drawer-title tabindex="-1">Cart</h2>
    <button type="button" data-cart-drawer-close>Close</button>
    <p data-cart-drawer-status></p>
    <ul>${itemCount === 0 ? '' : line}</ul>
  </div>
</dialog>`;
}

/* The collection bar carries a count and a sort select. There is no submit
   button: it lives inside <noscript>, so with scripting on it is not in the
   document at all. */
function collectionSection() {
  return `
<div class="collection">
  <form class="collection__bar collection__form" action="/collections/all" method="get">
    <span class="collection__count">94 products</span>
    <div class="collection__sort">
      <select name="sort_by" data-auto-submit>
        <option value="manual" selected>Featured</option>
        <option value="price-ascending">Price</option>
      </select>
    </div>
  </form>
</div>`;
}

/* A rail of vertical clips plus the viewer dialog. The <video> elements carry
   `muted` the way video_tag emits it, because whether the section unmutes the
   copy it puts in the viewer is exactly what one of the tests is about. */
function customerVideosSection({ id = 'clips', clips = 2, empty = false } = {}) {
  const clip = (i) => `
      <li class="clip" data-clip data-clip-index="${i}">
        <button type="button" class="clip__trigger" data-clip-open>
          <video class="clip__video" data-video="${i}" muted loop playsinline></video>
        </button>
      </li>`;

  const items = empty ? '' : Array.from({ length: clips }, (unused, i) => clip(i)).join('');

  return `
<div class="shopify-section" id="section-${id}">
  <div class="clips" data-clips data-cid="${id}">
    <div class="clips__inner">
      <ul class="clips__rail" role="list">${items}</ul>
    </div>
    <dialog class="clips__viewer" data-clips-viewer scroll-lock>
      <button type="button" data-clips-close>close</button>
      <div class="clips__viewer-stage" data-clips-stage></div>
    </dialog>
  </div>
</div>`;
}

function giftStepsSection({ id = 'steps', steps = 4 } = {}) {
  const items = Array.from(
    { length: steps },
    (unused, i) => `<li class="giftsteps__step" style="--giftsteps-step-index: ${i}">
      <span>${i + 1}</span>
    </li>`
  ).join('');

  return `
<div class="shopify-section" id="section-${id}">
  <div class="giftsteps" data-giftsteps-motion>
    <ol class="giftsteps__list">${items}</ol>
  </div>
</div>`;
}

function productRecommendationsSection({
  id = 'related',
  source = 'collection',
  marker = 'fallback',
  hidden = false
} = {}) {
  const card =
    source === 'none'
      ? ''
      : `<a class="product-card" data-recommendation-marker="${marker}" href="/products/${marker}">
           <h3>${marker}</h3>
         </a>`;

  return `
<div class="shopify-section" id="section-${id}">
  <div class="recommend full-width"
       data-product-recommendations
       data-recommendations-url="/recommendations/products?section_id=${id}&amp;product_id=42&amp;limit=4&amp;intent=related"
       data-recommendation-source="${source}"
       ${hidden ? 'hidden' : ''}>
    <div class="recommend__inner">
      <h2>You may also like</h2>
      <div class="recommend__grid" data-recommendations-content>${card}</div>
    </div>
  </div>
</div>`;
}

module.exports = {
  productSection,
  cartSection,
  cartDrawerSection,
  collectionSection,
  customerVideosSection,
  giftStepsSection,
  headerSection,
  heroSection,
  productRecommendationsSection
};
