import { events } from '@dropins/tools/event-bus.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';

const DEFAULT_THRESHOLD = 100;

const DEFAULT_LABELS = {
  remaining: 'You are {amount} away from free shipping.',
  unlocked: 'You have unlocked free shipping!',
};

/**
 * Reads the free-shipping threshold from the Configuration Service
 * (`free-shipping-threshold`), falling back to a default.
 * @returns {number}
 */
export function getFreeShippingThreshold() {
  const value = Number.parseFloat(getConfigValue('free-shipping-threshold'));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_THRESHOLD;
}

function formatPrice(value, currency) {
  try {
    return new Intl.NumberFormat(document.documentElement.lang || 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || ''}`.trim();
  }
}

/**
 * Computes the banner state for a given cart.
 * @param {object|null} cart Cart data as emitted on `cart/data`
 * @param {number} threshold Free-shipping threshold
 */
export function getFreeShippingState(cart, threshold) {
  const subtotal = cart?.subtotal?.excludingTax ?? cart?.subtotal?.includingTax;
  const value = subtotal?.value ?? 0;
  const remaining = Math.max(threshold - value, 0);
  return {
    hidden: !cart || cart.totalQuantity < 1,
    unlocked: remaining === 0,
    remaining,
    currency: subtotal?.currency || 'USD',
    progress: Math.min(Math.round((value / threshold) * 100), 100),
  };
}

/**
 * Creates the free-shipping progress element and keeps it in sync with the
 * cart through the drop-in event bus.
 * @param {object} [options]
 * @param {object} [options.labels] Placeholder labels (`Cart.FreeShipping.*`)
 * @param {number} [options.threshold] Free-shipping threshold
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createFreeShippingProgress({
  labels = {},
  threshold = getFreeShippingThreshold(),
} = {}) {
  const text = { ...DEFAULT_LABELS, ...labels };

  const element = document.createElement('div');
  element.className = 'cart-free-shipping';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.innerHTML = `
    <p class="cart-free-shipping__message"></p>
    <div class="cart-free-shipping__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">
      <span class="cart-free-shipping__fill"></span>
    </div>
  `;

  const $message = element.querySelector('.cart-free-shipping__message');
  const $bar = element.querySelector('.cart-free-shipping__bar');
  const $fill = element.querySelector('.cart-free-shipping__fill');

  const update = (cart) => {
    const state = getFreeShippingState(cart, threshold);
    element.hidden = state.hidden;
    element.classList.toggle('cart-free-shipping--unlocked', state.unlocked);
    $message.textContent = state.unlocked
      ? text.unlocked
      : text.remaining.replace('{amount}', formatPrice(state.remaining, state.currency));
    $bar.setAttribute('aria-valuenow', String(state.progress));
    $fill.style.width = `${state.progress}%`;
  };

  // eager: replay the last cart/data payload so the banner is correct on first paint
  const subscription = events.on('cart/data', update, { eager: true });

  return {
    element,
    destroy: () => subscription?.off(),
  };
}
