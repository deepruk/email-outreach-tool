import { useEffect } from 'react';

let lenisInstance = null;

export function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let raf;
    let cancelled = false;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenisInstance = new Lenis({ duration: 1.15, smoothWheel: true });
      const loop = (time) => {
        lenisInstance.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (lenisInstance) {
        lenisInstance.destroy();
        lenisInstance = null;
      }
    };
  }, [enabled]);
}

export function scrollToTopInstant() {
  window.scrollTo({ top: 0, behavior: 'instant' });
}
