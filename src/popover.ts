export function placePopover(surface: HTMLElement, anchor: HTMLElement, alignEnd = false) {
 const rect = anchor.getBoundingClientRect();
 const gutter = 8, gap = 5;
 const width = Math.min(Math.max(180, rect.width), window.innerWidth - 2 * gutter);
 const below = window.innerHeight - rect.bottom - gutter - gap;
 const above = rect.top - gutter - gap;
 const upwards = below < Math.min(260, above);
 surface.style.width = width + 'px';
 surface.style.maxHeight = Math.max(0, Math.min(300, upwards ? above : below)) + 'px';
 surface.style.left = Math.max(gutter, Math.min(alignEnd ? rect.right - width : rect.left,
  window.innerWidth - width - gutter)) + 'px';
 surface.style.top = upwards ? 'auto' : rect.bottom + gap + 'px';
 surface.style.bottom = upwards ? window.innerHeight - rect.top + gap + 'px' : 'auto';
 surface.dataset.side = upwards ? 'above' : 'below';
}
