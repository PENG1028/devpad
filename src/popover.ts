export function placePopover(surface: HTMLElement, anchor: HTMLElement, alignEnd = false) {
 const rect = anchor.getBoundingClientRect();
 const gutter = 8, gap = 5;
 const availableWidth = Math.max(1, innerWidth - 2 * gutter);
 surface.style.maxHeight = 'none';
 surface.style.width = 'max-content';
 surface.style.maxWidth = Math.min(availableWidth, Math.max(360, rect.width)) + 'px';
 const width = Math.min(availableWidth, Math.max(188, rect.width, surface.offsetWidth));
 surface.style.width = width + 'px';
 const height = surface.offsetHeight;
 const below = innerHeight - rect.bottom - gutter - gap;
 const above = rect.top - gutter - gap;
 const upwards = height > below && above > below;
 const space = Math.max(0, upwards ? above : below);
 const overlap = space < Math.min(120, height);
 surface.style.maxHeight = (overlap ? innerHeight - gutter * 2 : space) + 'px';
 const rightAligned = (getComputedStyle(anchor).direction === 'rtl') !== alignEnd;
 const left = rightAligned ? rect.right - width : rect.left;
 surface.style.left = Math.max(gutter, Math.min(left, innerWidth - width - gutter)) + 'px';
 surface.style.top = overlap ? gutter + 'px' : upwards ? 'auto' : rect.bottom + gap + 'px';
 surface.style.bottom = !overlap && upwards ? innerHeight - rect.top + gap + 'px' : 'auto';
 surface.dataset.side = upwards ? 'above' : 'below';
}

export function focusPopoverItem(item: HTMLElement | undefined, list: HTMLElement) {
 if (!item) return;
 item.focus({ preventScroll: true });
 const row = item.getBoundingClientRect(), box = list.getBoundingClientRect();
 if (row.top < box.top + 4) list.scrollTop -= box.top - row.top + 4;
 else if (row.bottom > box.bottom - 4) list.scrollTop += row.bottom - box.bottom + 4;
}
