/**
 * tabBarEmitter.ts
 *
 * Lightweight event bus shared between:
 *  - ScrollViews  → emitScroll(y)        picked up by CustomTabBar to auto-hide on scroll
 *  - BookingSheet → emitSheet(visible)   picked up by CustomTabBar to hide while sheet is open
 */

type ScrollListener = (y: number) => void;
type SheetListener  = (visible: boolean) => void;

const scrollListeners = new Set<ScrollListener>();
const sheetListeners  = new Set<SheetListener>();

// ── Scroll ─────────────────────────────────────────────────────────────────────
export function emitScroll(y: number) {
  scrollListeners.forEach((fn) => fn(y));
}

export function addScrollListener(fn: ScrollListener): () => void {
  scrollListeners.add(fn);
  return () => scrollListeners.delete(fn);
}

// ── Sheet visibility ───────────────────────────────────────────────────────────
/**
 * Call emitSheet(true)  when a BottomSheet / Modal opens  → tab bar hides
 * Call emitSheet(false) when a BottomSheet / Modal closes → tab bar shows
 */
export function emitSheet(visible: boolean) {
  sheetListeners.forEach((fn) => fn(visible));
}

export function addSheetListener(fn: SheetListener): () => void {
  sheetListeners.add(fn);
  return () => sheetListeners.delete(fn);
}