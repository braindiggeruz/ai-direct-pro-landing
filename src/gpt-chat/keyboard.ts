// Whether a phone's on-screen keyboard is open over the chat (REV-13): the
// composer is focused on a touch screen and the visible height has shrunk by
// a sixth or more from the tallest seen at this width. Chrome and iOS shrink
// the visual viewport; Telegram's Android WebView shrinks the window itself,
// so both are read through visualViewport when there is one. A keyboard
// closed with Android's back key leaves the field focused, and the height
// says it is gone. The console root carries the answer as
// data-keyboard="open", which premium.css reads: the header, the first screen
// and the limit card turn compact (chat design §4.3).
//
// iOS Safari does not resize the page under its keyboard: while it is open
// the app (#main) takes the visible height and the page stays at its top, so
// the composer sits on the keyboard as it does on Android.
//
// The height is read unscaled (the visual viewport's height times its scale):
// a pinch-zoom shrinks the visual viewport too, and is no keyboard. While the
// page is zoomed the app's height and scroll are left alone (WCAG 1.4.4).
import { useEffect, useState, type RefObject } from 'react';

export function useKeyboardOpen(inputRef: RefObject<HTMLTextAreaElement | null>): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const view = window.visualViewport;
    const main = document.getElementById('main');
    const height = main?.style.height ?? '';
    let tallest = 0;
    let width = 0;
    const check = () => {
      const scale = view?.scale ?? 1;
      const zoomed = scale > 1.01;
      const visible = view ? view.height * scale : window.innerHeight;
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        tallest = 0;
      }
      if (!zoomed) tallest = Math.max(tallest, visible);
      const now = document.activeElement === inputRef.current
        && window.matchMedia('(pointer: coarse)').matches && visible < tallest * 0.84;
      setOpen(now);
      if (!main || zoomed) return;
      if (now) {
        main.style.height = `${visible}px`;
        window.scrollTo(0, 0);
      } else if (main.style.height !== height) main.style.height = height;
    };
    check();
    const target = view ?? window;
    target.addEventListener('resize', check);
    // The keyboard opens a moment after the focus: resize follows, focusout is at once.
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      target.removeEventListener('resize', check);
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
      if (main) main.style.height = height;
    };
  }, [inputRef]);
  return open;
}
