// ---------- helpers ----------
const Util = {
  clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  lerp(a, b, t) { return a + (b - a) * t; },
  rand(lo, hi) { return lo + Math.random() * (hi - lo); },
  randInt(lo, hi) { return Math.floor(Util.rand(lo, hi + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); },
  easeInOut(a, b, p) { return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); },
  percentRemaining(n, total) { return (n % total) / total; },
  increase(start, inc, max) { let r = start + inc; while (r >= max) r -= max; while (r < 0) r += max; return r; },
  formatTime(sec) {
    if (!isFinite(sec)) return "--:--.---";
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
    return m + ":" + String(s).padStart(2, "0") + "." + String(ms).padStart(3, "0");
  },
  overlap(x1, w1, x2, w2, pct) {
    const half = (pct || 1) / 2;
    return !((x1 + w1 * half) < (x2 - w2 * half) || (x1 - w1 * half) > (x2 + w2 * half));
  },
  // deterministic-ish noise
  noise1(t) { return Math.sin(t * 1.7) * 0.6 + Math.sin(t * 3.1 + 1.3) * 0.4; }
};
function rr(ctx, x, y, w, h, r) { // rounded rect path
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
