"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type MutableRefObject } from "react";

// ============================================================================
// The tabletop camera (WS-004 clarification, DEC-023).
//
// One world, one camera. Every component of the game — schedule board,
// pegboard, contract boards, cards, tokens — is laid out inside a single
// coordinate space, and this file is the only thing that decides which part of
// that space the screen is looking at.
//
// World units are CSS pixels at scale 1. Screen = world * scale + translate,
// applied once on the world element, so a child never needs to know where the
// camera is: its own `getBoundingClientRect()` already carries the transform.
//
// The camera is client-local view state. It is never derived from room state,
// so a 1 Hz poll cannot move it (Addendum A, SA-9).
// ============================================================================

export type TableZone =
  | "table"
  | "opponent"
  | "schedule"
  | "board"
  | "lines"
  | "hand"
  | "office"
  | "log"
  | "results";

export type CameraApi = {
  /** Multiply the zoom about the middle of the screen. */
  zoomBy: (factor: number) => void;
  /** Frame a zone by its `data-zone` marker. `table` fits the whole surface. */
  focus: (zone: TableZone, opts?: { animate?: boolean }) => boolean;
  /** Back to the default framing: the pegboard, with the table around it. */
  reset: (opts?: { animate?: boolean }) => boolean;
  /** Pan the smallest amount that brings a focused element on screen. */
  ensureVisible: (el: HTMLElement) => void;
  /** The same, for a rectangle in client coordinates (a peg hole, say). */
  ensureRect: (r: { left: number; top: number; right: number; bottom: number }) => void;
};

type Cam = { scale: number; x: number; y: number };

const MAX_SCALE = 2.4;
/** Default framing never magnifies past this, however wide the screen is. */
const DEFAULT_MAX_SCALE = 1.1;
/** World-px of breathing room left around a focused zone. */
const ZONE_PAD = 28;
/** When a zone cannot be contained, this is a comfortable working zoom. */
const WORK_SCALE = 0.6;
const PAN_STEP = 140;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Text fields keep their own arrow/typing behaviour. */
const isTextEntry = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable;
};

export function TabletopCanvas({
  worldWidth,
  apiRef,
  onCamera,
  overlay,
  children,
  /** Which zone the opening shot and `Reset view` frame. */
  openZone = "board",
  /** Extra px kept clear under the viewport (a screen-level strip, say). */
  bottomInset = 0,
  /** Screen-level HUD bands the camera should frame content clear of. */
  hudTop = 0,
  hudBottom = 0,
  label = "Game tabletop",
}: {
  worldWidth: number;
  apiRef: MutableRefObject<CameraApi | null>;
  onCamera?: (scale: number) => void;
  overlay?: ReactNode;
  children: ReactNode;
  openZone?: TableZone;
  bottomInset?: number;
  hudTop?: number;
  hudBottom?: number;
  label?: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const camRef = useRef<Cam>({ scale: 0.5, x: 0, y: 0 });
  const [, forceRender] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const worldHeight = useRef(1000);
  const framed = useRef(false);
  const raf = useRef<number | null>(null);
  // The opening shot keeps re-framing while the table is still laying itself
  // out (fonts, card art, the pegboard). It stops the moment the player moves
  // the camera, and in any case once the table has settled — after that only
  // explicit input and phase changes move it (SA-9).
  const settlingUntil = useRef(0);
  const userMoved = useRef(false);
  useEffect(() => {
    settlingUntil.current = performance.now() + 2500;
  }, []);
  const settling = () => !userMoved.current && performance.now() < settlingUntil.current;

  // ---- camera plumbing ------------------------------------------------------

  const viewportSize = () => {
    const r = viewportRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  };

  const minScale = useCallback(() => {
    const { w, h } = viewportSize();
    if (!w || !h) return 0.1;
    // Zooming out always reaches the whole table, with a little slack.
    return Math.min(w / worldWidth, h / worldHeight.current) * 0.92;
  }, [worldWidth]);

  const clamp = useCallback(
    (cam: Cam): Cam => {
      const { w, h } = viewportSize();
      const scale = Math.min(MAX_SCALE, Math.max(minScale(), cam.scale));
      const cw = worldWidth * scale;
      const ch = worldHeight.current * scale;
      // Content narrower than the screen is centred rather than free-floating;
      // otherwise the table may overshoot by a little, never by a screenful.
      const slackX = w * 0.12;
      const slackY = h * 0.12;
      const x = cw <= w ? (w - cw) / 2 : Math.min(slackX, Math.max(w - cw - slackX, cam.x));
      const y = ch <= h ? (h - ch) / 2 : Math.min(slackY, Math.max(h - ch - slackY, cam.y));
      return { scale, x, y };
    },
    [minScale, worldWidth]
  );

  const apply = useCallback(
    (cam: Cam) => {
      camRef.current = cam;
      const world = worldRef.current;
      if (world) {
        world.style.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.scale})`;
      }
      onCamera?.(cam.scale);
    },
    [onCamera]
  );

  const setCam = useCallback((next: Cam) => apply(clamp(next)), [apply, clamp]);

  const stopAnimation = () => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  };

  const animateTo = useCallback(
    (target: Cam, animate = true) => {
      stopAnimation();
      const to = clamp(target);
      if (!animate || prefersReducedMotion()) {
        apply(to);
        return;
      }
      const from = { ...camRef.current };
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 300);
        const k = easeOutCubic(t);
        apply({
          scale: from.scale + (to.scale - from.scale) * k,
          x: from.x + (to.x - from.x) * k,
          y: from.y + (to.y - from.y) * k,
        });
        if (t < 1) raf.current = requestAnimationFrame(step);
        else raf.current = null;
      };
      raf.current = requestAnimationFrame(step);
    },
    [apply, clamp]
  );

  /** A zone's rectangle in world units, measured from the live DOM. */
  const zoneRect = useCallback((zone: TableZone) => {
    const world = worldRef.current;
    if (!world) return null;
    if (zone === "table") {
      return { x: 0, y: 0, w: worldWidth, h: worldHeight.current };
    }
    const el = world.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
    if (!el) return null;
    const wr = world.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    // The applied scale, read back from the DOM: state and transform can be one
    // frame apart, and a stale scale would mis-measure every zone.
    const s = wr.width / worldWidth || camRef.current.scale || 1;
    return {
      x: (er.left - wr.left) / s,
      y: (er.top - wr.top) / s,
      w: er.width / s,
      h: er.height / s,
    };
  }, [worldWidth]);

  const frameRect = useCallback(
    (
      rect: { x: number; y: number; w: number; h: number },
      opts: {
        animate?: boolean;
        maxScale?: number;
        align?: "center" | "top";
        /** Below this scale, containing the zone is useless: work-zoom instead. */
        fillBelow?: number;
      } = {}
    ) => {
      const { w, h } = viewportSize();
      if (!w || !h) return;
      const pad = ZONE_PAD;
      // The usable band is what the HUD does not cover, so a framed zone is
      // never left under the status plate or the action strip.
      const top = hudTop;
      const usableH = Math.max(120, h - hudTop - hudBottom);
      const wFit = w / (rect.w + pad * 2);
      const hFit = usableH / (rect.h + pad * 2);
      let fit = Math.min(wFit, hFit);
      if (opts.fillBelow && fit < opts.fillBelow) {
        // A phone cannot show the whole pegboard and still see the pegs. Open
        // at a zoom where the holes are actually tappable and let the player
        // pan around the board, which is what a table does anyway.
        fit = Math.max(wFit, hFit, WORK_SCALE);
      }
      const scale = Math.min(opts.maxScale ?? MAX_SCALE, Math.max(minScale(), fit));
      const cx = rect.x + rect.w / 2;
      const cy =
        opts.align === "top" ? rect.y + usableH / (2 * scale) - pad : rect.y + rect.h / 2;
      animateTo(
        { scale, x: w / 2 - cx * scale, y: top + usableH / 2 - cy * scale },
        opts.animate ?? true
      );
    },
    [animateTo, hudBottom, hudTop, minScale]
  );

  const focus = useCallback(
    (zone: TableZone, opts?: { animate?: boolean }) => {
      const rect = zoneRect(zone);
      if (!rect || !rect.w) return false;
      frameRect(rect, {
        animate: opts?.animate ?? true,
        // The pegboard keeps its physical size: framing it never blows it up.
        maxScale: zone === "board" ? DEFAULT_MAX_SCALE : MAX_SCALE,
        align: rect.h > rect.w * 0.9 ? "top" : "center",
        ...(zone === "board" ? { fillBelow: 0.45 } : {}),
      });
      return true;
    },
    [frameRect, zoneRect]
  );

  const reset = useCallback(
    (opts?: { animate?: boolean }) => {
      const { w, h } = viewportSize();
      const rect = zoneRect(openZone) ?? zoneRect("board");
      if (!rect || !rect.w || !w || !h) return false;
      frameRect(rect, {
        animate: opts?.animate ?? true,
        maxScale: DEFAULT_MAX_SCALE,
        // Only the pegboard is worth working at when it cannot be contained.
        ...(openZone === "board" ? { fillBelow: 0.45 } : {}),
        align: rect.h > rect.w * 0.9 ? "top" : "center",
      });
      return true;
    },
    [frameRect, openZone, zoneRect]
  );

  const ensureRect = useCallback(
    (r: { left: number; top: number; right: number; bottom: number }) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const v = vp.getBoundingClientRect();
      const m = 24;
      let dx = 0;
      let dy = 0;
      if (r.left < v.left + m) dx = v.left + m - r.left;
      else if (r.right > v.right - m) dx = Math.max(v.right - m - r.right, v.left + m - r.left);
      if (r.top < v.top + m) dy = v.top + m - r.top;
      else if (r.bottom > v.bottom - m) dy = Math.max(v.bottom - m - r.bottom, v.top + m - r.top);
      if (!dx && !dy) return;
      const c = camRef.current;
      animateTo({ ...c, x: c.x + dx, y: c.y + dy });
    },
    [animateTo]
  );

  const ensureVisible = useCallback(
    (el: HTMLElement) => ensureRect(el.getBoundingClientRect()),
    [ensureRect]
  );

  apiRef.current = {
    zoomBy: (factor: number) => {
      userMoved.current = true;
      const { w, h } = viewportSize();
      const c = camRef.current;
      const scale = Math.min(MAX_SCALE, Math.max(minScale(), c.scale * factor));
      const ax = (w / 2 - c.x) / c.scale;
      const ay = (h / 2 - c.y) / c.scale;
      animateTo({ scale, x: w / 2 - ax * scale, y: h / 2 - ay * scale });
    },
    focus: (zone, opts) => {
      userMoved.current = true;
      return focus(zone, opts);
    },
    reset: (opts) => {
      userMoved.current = true;
      return reset(opts);
    },
    ensureVisible,
    ensureRect,
  };

  // The world carries a transform from its very first paint, so every later
  // measurement can divide by a scale that is really applied.
  useEffect(() => {
    apply(camRef.current);
  }, [apply]);

  // ---- sizing ---------------------------------------------------------------

  // The table fills what is left of the screen, so the page itself never
  // scrolls and the camera is the only thing that moves (SA-4).
  useEffect(() => {
    const measure = () => {
      const el = viewportRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available =
        (window.visualViewport?.height ?? window.innerHeight) - top - bottomInset - 10;
      setHeight(Math.max(320, Math.round(available)));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    const t = setTimeout(measure, 120);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, [bottomInset]);

  // Track the world's own height: zones grow with the game (more lines, more
  // cards), and clamping/fitting has to follow.
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const ro = new ResizeObserver(() => {
      worldHeight.current = world.offsetHeight || 1000;
      if (!framed.current || settling()) {
        // The opening shot waits until the pegboard is really on the table,
        // and follows it while the rest of the table is still settling.
        const ok = reset({ animate: false });
        if (ok && !framed.current) {
          framed.current = true;
          forceRender((n) => n + 1);
        }
        if (!ok) setCam(camRef.current);
      } else {
        setCam(camRef.current);
      }
    });
    ro.observe(world);
    return () => ro.disconnect();
  }, [reset, setCam]);

  // Re-clamp (and re-frame if the first frame never happened) on viewport size
  // changes — a rotation, or the address bar collapsing.
  useEffect(() => {
    if (height === null) return;
    if (!framed.current || settling()) {
      const ok = reset({ animate: false });
      if (ok) framed.current = true;
      else setCam(camRef.current);
    } else {
      setCam(camRef.current);
    }
  }, [height, reset, setCam]);

  useEffect(() => () => stopAnimation(), []);

  // ---- pointer input --------------------------------------------------------

  const drag = useRef<{
    id: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    pinch: { dist: number; cam: Cam; midX: number; midY: number } | null;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const suppressClick = useRef(false);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userMoved.current = true;
      stopAnimation();
      const r = vp.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const c = camRef.current;
      const factor = e.ctrlKey ? (e.deltaY < 0 ? 1.08 : 1 / 1.08) : e.deltaY < 0 ? 1.14 : 1 / 1.14;
      const scale = Math.min(MAX_SCALE, Math.max(minScale(), c.scale * factor));
      const ax = (px - c.x) / c.scale;
      const ay = (py - c.y) / c.scale;
      setCam({ scale, x: px - ax * scale, y: py - ay * scale });
    };

    // A drag that started on a card must not also click it: the click is
    // swallowed in the capture phase, so panning can never select or confirm.
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    };

    vp.addEventListener("wheel", onWheel, { passive: false });
    vp.addEventListener("click", onClickCapture, true);
    return () => {
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("click", onClickCapture, true);
    };
  }, [minScale, setCam]);

  const endDrag = useCallback((id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size === 0) {
      drag.current = null;
    } else if (drag.current) {
      const [first] = Array.from(pointers.current.entries());
      drag.current = {
        id: first[0],
        lastX: first[1].x,
        lastY: first[1].y,
        moved: drag.current.moved,
        pinch: null,
      };
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    suppressClick.current = false;
    stopAnimation();
    if (pointers.current.size === 1) {
      drag.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: false, pinch: null };
    } else if (pointers.current.size === 2 && drag.current) {
      const [a, b] = Array.from(pointers.current.values());
      const vp = viewportRef.current!.getBoundingClientRect();
      drag.current.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cam: { ...camRef.current },
        midX: (a.x + b.x) / 2 - vp.left,
        midY: (a.y + b.y) / 2 - vp.top,
      };
      drag.current.moved = true;
      suppressClick.current = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;

    if (pointers.current.size >= 2 && d.pinch) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0 && d.pinch.dist > 0) {
        const start = d.pinch.cam;
        const scale = Math.min(
          MAX_SCALE,
          Math.max(minScale(), start.scale * (dist / d.pinch.dist))
        );
        const ax = (d.pinch.midX - start.x) / start.scale;
        const ay = (d.pinch.midY - start.y) / start.scale;
        setCam({ scale, x: d.pinch.midX - ax * scale, y: d.pinch.midY - ay * scale });
      }
      return;
    }

    if (e.pointerId !== d.id) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    d.moved = true;
    userMoved.current = true;
    suppressClick.current = true;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    const c = camRef.current;
    setCam({ ...c, x: c.x + dx, y: c.y + dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => endDrag(e.pointerId);

  // ---- keyboard -------------------------------------------------------------

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEntry(e.target)) return;
    userMoved.current = true;
    const c = camRef.current;
    switch (e.key) {
      case "ArrowLeft":
        setCam({ ...c, x: c.x + PAN_STEP });
        break;
      case "ArrowRight":
        setCam({ ...c, x: c.x - PAN_STEP });
        break;
      case "ArrowUp":
        setCam({ ...c, y: c.y + PAN_STEP });
        break;
      case "ArrowDown":
        setCam({ ...c, y: c.y - PAN_STEP });
        break;
      case "+":
      case "=":
        apiRef.current?.zoomBy(1.25);
        break;
      case "-":
      case "_":
        apiRef.current?.zoomBy(1 / 1.25);
        break;
      case "0":
        reset();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // Tabbing to a piece brings the camera to it instead of letting the browser
  // scroll a surface that is not supposed to scroll.
  const onFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.scrollTop = 0;
    vp.scrollLeft = 0;
    const target = e.target as HTMLElement;
    if (target && target !== vp && worldRef.current?.contains(target)) ensureVisible(target);
  };

  return (
    <div
      ref={viewportRef}
      role="application"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onFocusCapture={onFocusCapture}
      className="relative w-full touch-none select-none overflow-hidden rounded-2xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-amber-500"
      style={{
        height: height ?? 520,
        cursor: "grab",
        background:
          "radial-gradient(circle at 50% 12%, #4b6650 0%, #33452f 55%, #26331f 100%)",
      }}
    >
      <div
        ref={worldRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: worldWidth, willChange: "transform" }}
      >
        {children}
      </div>
      {overlay}
    </div>
  );
}
