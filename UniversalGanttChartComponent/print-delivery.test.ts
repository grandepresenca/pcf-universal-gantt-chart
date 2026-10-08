// print-delivery.test.ts — route choice with a fake browser host (no DOM).

import { IFRAME_CLEANUP_MS, PrintHost, printHtml } from "./print-delivery";

/** A fake window that records what was written and printed. */
function fakeWindow(opts: { printThrows?: boolean } = {}) {
  const calls: string[] = [];
  const listeners: Record<string, () => void> = {};
  const win = {
    calls,
    listeners,
    document: {
      open: () => calls.push("open"),
      write: (html: string) => calls.push(`write:${html}`),
      close: () => calls.push("close"),
    },
    focus: () => calls.push("focus"),
    print: () => {
      if (opts.printThrows) {
        throw new Error("print failed");
      }
      calls.push("print");
    },
    addEventListener: (event: string, fn: () => void) => {
      listeners[event] = fn;
    },
  };
  return win;
}

function fakeHost(opts: { frameWindow?: ReturnType<typeof fakeWindow> | null; popup?: ReturnType<typeof fakeWindow> | null } = {}) {
  const body: { children: unknown[] } = { children: [] };
  const timers: { fn: () => void; ms: number }[] = [];
  const frame = {
    attrs: {} as Record<string, string>,
    style: { cssText: "" },
    parentNode: null as null | { removeChild: (n: unknown) => void },
    contentWindow: opts.frameWindow === undefined ? fakeWindow() : opts.frameWindow,
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    },
  };
  const parent = { removeChild: (n: unknown) => { body.children = body.children.filter((c) => c !== n); frame.parentNode = null; } };
  const host = {
    document: {
      createElement: () => frame,
      body: { appendChild: (n: unknown) => { body.children.push(n); frame.parentNode = parent; } },
    },
    open: jest.fn(() => (opts.popup === undefined ? fakeWindow() : opts.popup)),
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
  };
  return { host: host as unknown as PrintHost, frame, body, timers, open: host.open };
}

describe("printHtml — iframe route (preferred)", () => {
  test("writes the HTML into a hidden iframe and prints it there; no window is opened", () => {
    const { host, frame, body, open } = fakeHost();
    expect(printHtml("<p>x</p>", host)).toBe("iframe");
    expect((frame.contentWindow as ReturnType<typeof fakeWindow>).calls).toEqual(["open", "write:<p>x</p>", "close", "focus", "print"]);
    expect(body.children).toEqual([frame]);
    expect(frame.style.cssText).toContain("visibility:hidden");
    expect(frame.attrs["aria-hidden"]).toBe("true");
    expect(open).not.toHaveBeenCalled();
  });

  test("the iframe is removed after printing, or by the safety timer", () => {
    const a = fakeHost();
    printHtml("x", a.host);
    (a.frame.contentWindow as ReturnType<typeof fakeWindow>).listeners.afterprint();
    expect(a.body.children).toEqual([]);
    const b = fakeHost();
    printHtml("x", b.host);
    expect(b.timers[0].ms).toBe(IFRAME_CLEANUP_MS);
    b.timers[0].fn();
    b.timers[0].fn(); // removing twice is harmless
    expect(b.body.children).toEqual([]);
  });
});

describe("printHtml — fallbacks", () => {
  test("an iframe without a window falls back to a new window, and the iframe is cleaned up", () => {
    const popup = fakeWindow();
    const { host, body, open } = fakeHost({ frameWindow: null, popup });
    expect(printHtml("<p>y</p>", host)).toBe("window");
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(popup.calls).toEqual(["open", "write:<p>y</p>", "close", "focus", "print"]);
    expect(body.children).toEqual([]);
  });

  test("printing failing in the iframe also falls back", () => {
    const { host } = fakeHost({ frameWindow: fakeWindow({ printThrows: true }) });
    expect(printHtml("z", host)).toBe("window");
  });

  test("both routes blocked -> a PrintBlockedError naming both causes", () => {
    const { host } = fakeHost({ frameWindow: null, popup: null });
    expect(() => printHtml("z", host)).toThrow("Printing was blocked (iframe: iframe has no window; window: pop-up blocked).");
    try {
      printHtml("z", host);
    } catch (e) {
      expect((e as Error).name).toBe("PrintBlockedError");
    }
  });

  test("a non-Error failure is still reported", () => {
    const popup = fakeWindow();
    popup.print = () => {
      // Some hosts reject with a bare string, not an Error.
      throw "denied";
    };
    const { host } = fakeHost({ frameWindow: null, popup });
    expect(() => printHtml("z", host)).toThrow("window: denied");
  });
});
