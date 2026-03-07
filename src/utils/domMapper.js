/**
 * Onyx Intelligence — Spatial DOM Mapper (Vimium-style)
 *
 * Injected into a webview via executeJavaScript. Scans the viewport for
 * all visible interactive elements, tags each with a `data-onyx-id`, and
 * returns a compact JSON map the LLM can reason over.
 *
 * This is the raw script TEXT — the exported constant is already an IIFE string.
 * Returns: JSON array of { id, tag, text, href? }
 */

export const DOM_MAPPER_SCRIPT = `
(function onyxSpatialMap() {
  try {
    /* Remove any previous Onyx IDs */
    document.querySelectorAll('[data-onyx-id]').forEach(function(el) {
      el.removeAttribute('data-onyx-id');
    });

    var SELECTORS = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="searchbox"], [role="textbox"], [onclick], summary, label[for]';
    var all = document.querySelectorAll(SELECTORS);
    var map = [];
    var id = 1;
    var vh = window.innerHeight;
    var vw = window.innerWidth;

    for (var i = 0; i < all.length; i++) {
      var el = all[i];

      /* Skip invisible / off-screen elements */
      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.bottom < -50 || rect.top > vh + 50) continue;
      if (rect.right < -50 || rect.left > vw + 50) continue;

      /* Skip hidden inputs */
      if (el.tagName === 'INPUT' && el.type === 'hidden') continue;

      /* CSS visibility check */
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

      /* Compute best human-readable label (priority order) */
      var text = (
        (el.getAttribute('aria-label') || '').trim() ||
        (el.placeholder || '').trim() ||
        (el.title || '').trim() ||
        (el.alt || '').trim() ||
        (el.value && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el.value : '').trim() ||
        (el.innerText || '').trim().substring(0, 80) ||
        ''
      );

      /* Determine element type for the LLM */
      var tag = el.tagName.toLowerCase();
      var elType = tag;
      if (tag === 'input') elType = 'input[' + (el.type || 'text') + ']';
      var role = el.getAttribute('role');
      if (role) elType = role;

      /* Tag the DOM node */
      el.setAttribute('data-onyx-id', String(id));

      var entry = {
        id: id,
        tag: elType,
        text: text.substring(0, 80) || '[no label]'
      };

      /* Include href for links */
      if (el.tagName === 'A' && el.getAttribute('href')) {
        entry.href = el.getAttribute('href').substring(0, 120);
      }

      map.push(entry);
      id++;

      /* Cap at 100 elements to keep context manageable */
      if (id > 100) break;
    }

    return JSON.stringify(map);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
})()
`;
