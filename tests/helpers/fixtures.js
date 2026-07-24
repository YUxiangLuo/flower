'use strict';

/* Minimal stand-ins for the markup the sections render. They carry only the
   hooks the section JavaScript reads, so a fixture stays readable and a
   markup change that drops a hook shows up as a failing test. */

/* Two options (S/M) across two media items. Variant 11 (S) is featured on
   media 1, variant 12 (M) on media 2; the S/L combination does not exist,
   which is the invalid-option case. */
function productSection({ id = 'a', selected = 'S' } = {}) {
  const variants = [
    { id: 11, options: ['S'], available: true },
    { id: 12, options: ['M'], available: true }
  ];
  const variantMedia = { 11: 1, 12: 2 };

  const option = (value) => `
        <input type="radio" name="Option-${id}" value="${value}"
               id="opt-${id}-${value}" data-option-input
               ${value === selected ? 'checked' : ''}>`;

  return `
<div class="product" data-product data-pid="${id}">
  <div data-gallery>
    <div data-stage-item data-media-id="1" class="is-active">
      <img src="one.jpg" alt="one">
      <button type="button" data-zoom-open="0" data-full="one-full.jpg">zoom</button>
    </div>
    <div data-stage-item data-media-id="2">
      <img src="two.jpg" alt="two">
      <button type="button" data-zoom-open="1" data-full="two-full.jpg">zoom</button>
    </div>
    <button type="button" data-thumb data-media-id="1">t1</button>
    <button type="button" data-thumb data-media-id="2">t2</button>
  </div>

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
    <button type="submit" data-add-button
            data-label-add="Add to cart"
            data-label-soldout="Sold out"
            data-label-unavailable="Unavailable">Add to cart</button>
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

function collectionSection() {
  return `
<div class="collection">
  <form class="facets__form" action="/collections/all" method="get">
    <select name="sort_by" data-auto-submit>
      <option value="manual" selected>Featured</option>
      <option value="price-ascending">Price</option>
    </select>
    <div class="facet__price">
      <input type="number" name="filter.v.price.gte" data-min="0" data-max="100"
             data-invalid-message="Enter a number" data-range-message="Out of range">
    </div>
    <input type="checkbox" name="filter.p.vendor" value="acme" data-auto-submit>
    <button type="submit">Apply</button>
  </form>
</div>`;
}

module.exports = { productSection, cartSection, collectionSection };
