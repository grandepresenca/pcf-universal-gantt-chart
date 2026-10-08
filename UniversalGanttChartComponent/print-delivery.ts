// print-delivery.ts — puts the report HTML in front of the browser's print
// dialog (where the user picks "Save as PDF"). Glue, but host-injected so the
// route choice is testable without a DOM.
//
// Route 1 (preferred): a hidden IFRAME in the current document, printed in
// place. No new window, so popup blockers don't apply, and a same-origin
// about:blank frame is not restricted by CSP frame-src.
// Route 2 (fallback, only if route 1 throws): window.open + print.
// Both failing throws an Error named "PrintBlockedError" (a plain Error: with
// the repo's ES5 target, subclassing Error doesn't produce a real subclass).
// Which route ran is returned, for the deploy check (logged by the caller).

export type PrintRoute = "iframe" | "window";

/** The error thrown when neither route could open the print dialog. */
function printBlocked(causes: readonly string[]): Error {
  const error = new Error(`Printing was blocked (${causes.join("; ")}).`);
  error.name = "PrintBlockedError";
  return error;
}

/** The parts of the browser this needs (real document/window in production). */
export interface PrintHost {
  readonly document: Pick<Document, "createElement" | "body">;
  readonly open: (url: string, target: string) => Window | null;
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
}

/** How long an unprinted iframe may linger if afterprint never fires. */
export const IFRAME_CLEANUP_MS = 60000;

function writeAndPrint(target: Window, html: string): void {
  target.document.open();
  target.document.write(html);
  target.document.close();
  target.focus();
  target.print();
}

function printInIframe(html: string, host: PrintHost): void {
  const frame = host.document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  host.document.body.appendChild(frame);
  const remove = (): void => {
    if (frame.parentNode !== null) {
      frame.parentNode.removeChild(frame);
    }
  };
  try {
    const target = frame.contentWindow;
    if (target === null) {
      throw new Error("iframe has no window");
    }
    target.addEventListener("afterprint", remove);
    host.setTimeout(remove, IFRAME_CLEANUP_MS);
    writeAndPrint(target, html);
  } catch (e) {
    remove();
    throw e;
  }
}

function printInWindow(html: string, host: PrintHost): void {
  const target = host.open("", "_blank");
  if (target === null) {
    throw new Error("pop-up blocked");
  }
  writeAndPrint(target, html);
}

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Opens the print dialog for `html`; returns the route used. */
export function printHtml(html: string, host: PrintHost): PrintRoute {
  try {
    printInIframe(html, host);
    return "iframe";
  } catch (iframeError) {
    try {
      printInWindow(html, host);
      return "window";
    } catch (windowError) {
      throw printBlocked([`iframe: ${reason(iframeError)}`, `window: ${reason(windowError)}`]);
    }
  }
}
