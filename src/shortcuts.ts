export const searchShortcuts = ['F', 'K', 'Shift+F'] as const;
export type SearchShortcut = typeof searchShortcuts[number];
export const searchPreference = 'devpad-search-shortcut';

export function readSearchShortcut(): SearchShortcut {
 const value = localStorage.getItem(searchPreference);
 return searchShortcuts.find(shortcut => shortcut === value) ?? 'F';
}

export function shortcutLabel(shortcut: SearchShortcut, modifier: string) {
 return modifier === '⌘' ? (shortcut === 'Shift+F' ? '⇧⌘F' : '⌘' + shortcut) : modifier + '+' + shortcut;
}

export function matchesSearch(event: KeyboardEvent, shortcut: SearchShortcut) {
 return event.metaKey !== event.ctrlKey
  && !event.altKey && event.shiftKey === (shortcut === 'Shift+F')
  && event.key.toUpperCase() === (shortcut === 'K' ? 'K' : 'F');
}
