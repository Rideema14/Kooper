import * as THREE from "three";

/* Procedural, photographic-style textures for the dining-table scene. Everything is generated in the browser. */

export function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function makeNoise(seed: number) {
  const r = mulberry(seed), N = 256, g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const s = (t: number) => t * t * (3 - 2 * t);
  const v = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = g[(yi & 255) * N + (xi & 255)], b = g[(yi & 255) * N + ((xi + 1) & 255)], c = g[((yi + 1) & 255) * N + (xi & 255)], d = g[((yi + 1) & 255) * N + ((xi + 1) & 255)];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x: number, y: number, o = 5) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { t += a * v(x * f, y * f); f *= 2.03; a *= 0.5; } return t; };
}
export const cvs = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
export function tex(c: HTMLCanvasElement, srgb = true, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Planked wood: walnut for the table, pale pine for the crate. */
export function wood(kind: "walnut" | "pine", S = 1024, planks = 12) {
  const c = cvs(S, S), g = c.getContext("2d")!, im = g.createImageData(S, S), n = makeNoise(kind === "walnut" ? 41 : 43), r = mulberry(kind === "walnut" ? 9 : 10);
  const bc = cvs(S, S), bg = bc.getContext("2d")!, bi = bg.createImageData(S, S);
  const dark = kind === "walnut" ? [30, 17, 9] : [150, 108, 64], light = kind === "walnut" ? [98, 62, 34] : [214, 168, 112];
  const pw = S / planks, tone: number[] = [], off: number[] = [];
  for (let i = 0; i < planks; i++) { tone.push(0.82 + r() * 0.36); off.push(r() * 400); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const pi = Math.min(planks - 1, Math.floor(x / pw)), u = x - pi * pw;
    const q = n(x / 70 + pi * 17, (y + off[pi]) / 380, 4);
    const t = n(x / 52 + pi * 9, (y + off[pi]) / 420, 3) * 7 + u / 22 + q * 4;
    let ring = Math.sin(t) * 0.5 + 0.5; ring = Math.pow(ring, 1.7);
    const fine = n(x / 3.2, (y + off[pi]) / 55, 2);
    const pore = n(x / 1.6 + 70, (y + off[pi]) / 14, 2) > 0.66 ? 0.5 : 1;
    let k = (0.2 + 0.55 * ring + 0.35 * fine) * tone[pi];
    k *= pore;
    let seam = 1; if (u < 1.6 || u > pw - 1.6) seam = 0.35; else if (u < 3.2 || u > pw - 3.2) seam = 0.75;
    const i = (y * S + x) * 4;
    im.data[i] = mix(dark[0], light[0], k) * seam; im.data[i + 1] = mix(dark[1], light[1], k) * seam; im.data[i + 2] = mix(dark[2], light[2], k) * seam; im.data[i + 3] = 255;
    const hv = (0.35 + 0.4 * fine + 0.25 * ring) * pore * (seam < 1 ? 0.2 : 1) * 255;
    bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = hv; bi.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); bg.putImageData(bi, 0, 0);
  return { map: tex(c), bump: tex(bc, false) };
}

/** Margherita, seen from above: blistered crust, sauce, torn mozzarella, basil. */
export function pizza(S = 768) {
  const c = cvs(S, S), g = c.getContext("2d")!, im = g.createImageData(S, S), n = makeNoise(51), n2 = makeNoise(52), n3 = makeNoise(53), r = mulberry(7);
  const hc = cvs(S, S), hg = hc.getContext("2d")!, hi = hg.createImageData(S, S);
  const cx = S / 2, R = S / 2 - 3;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cx, rr = Math.sqrt(dx * dx + dy * dy) / R, i = (y * S + x) * 4;
    if (rr > 1) { im.data[i + 3] = 0; hi.data[i + 3] = 255; hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = 0; continue; }
    let R_ = 0, G_ = 0, B_ = 0, h = 100;
    const rim = 0.83 + (n(x / 60, y / 60, 3) - 0.5) * 0.05;
    if (rr > rim) { // crust
      const k = n(x / 14, y / 14, 4), ch = n2(x / 22, y / 22, 4);
      const blister = sstep(0.56, 0.7, ch), edge = sstep(0.93, 1, rr);
      R_ = mix(226, 150, blister) * (0.86 + k * 0.28); G_ = mix(172, 82, blister) * (0.86 + k * 0.28); B_ = mix(98, 38, blister) * (0.86 + k * 0.28);
      R_ *= 1 - edge * 0.25; G_ *= 1 - edge * 0.3; B_ *= 1 - edge * 0.3;
      if (r() < 0.012) { R_ += 24; G_ += 24; B_ += 20; } // flour
      h = 190 + k * 40 - edge * 70;
    } else {
      const k = n(x / 18, y / 18, 4);
      R_ = 176 * (0.86 + k * 0.3); G_ = 34 * (0.8 + k * 0.5); B_ = 22 * (0.8 + k * 0.5); h = 80 + k * 20;
      const cm = n3(x / 62, y / 62, 4);
      const m = sstep(0.47, 0.53, cm) * (rr < rim - 0.02 ? 1 : 0.0);
      if (m > 0) {
        const tone = n(x / 30 + 9, y / 30, 3), brown = sstep(0.6, 0.72, n2(x / 26, y / 26, 3));
        const cr = mix(244, 238, tone), cg = mix(234, 214, tone), cb = mix(206, 164, tone);
        const fr = mix(cr, 206, brown * 0.7), fg = mix(cg, 148, brown * 0.7), fb = mix(cb, 82, brown * 0.7);
        R_ = mix(R_, fr, m); G_ = mix(G_, fg, m); B_ = mix(B_, fb, m); h = mix(h, 140 + tone * 30, m);
      }
    }
    im.data[i] = R_; im.data[i + 1] = G_; im.data[i + 2] = B_; im.data[i + 3] = 255;
    hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); hg.putImageData(hi, 0, 0);
  // basil leaves
  const leaf = (x: number, y: number, a: number, s: number) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    const gr = g.createLinearGradient(0, -60, 0, 60); gr.addColorStop(0, "#5f8f3a"); gr.addColorStop(1, "#2e5a22"); g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -62); g.bezierCurveTo(46, -34, 44, 30, 0, 58); g.bezierCurveTo(-44, 30, -46, -34, 0, -62); g.fill();
    g.strokeStyle = "rgba(200,225,150,.55)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -56); g.lineTo(0, 54); for (let k = -3; k <= 3; k++) { g.moveTo(0, k * 14); g.lineTo(k < 0 ? -26 : 26, k * 14 - 16); } g.stroke();
    g.fillStyle = "rgba(0,0,0,.18)"; g.beginPath(); g.ellipse(6, 10, 22, 40, 0.1, 0, 7); g.fill(); g.restore();
  };
  [[cx - 120, cx - 60, 0.6, 0.9], [cx + 90, cx - 110, -0.5, 0.85], [cx + 40, cx + 100, 2.4, 0.8], [cx - 70, cx + 120, -2.2, 0.75], [cx + 160, cx + 20, 1.2, 0.7]].forEach(([x, y, a, s]) => leaf(x, y, a, s));
  // cut lines
  g.strokeStyle = "rgba(60,25,12,.35)"; g.lineWidth = 2.2;
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; g.beginPath(); g.moveTo(cx - Math.cos(a) * R, cx - Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * R, cx + Math.sin(a) * R); g.stroke(); }
  // oil sheen: tiny bright specks
  for (let i = 0; i < 160; i++) { const a = r() * 7, d = Math.sqrt(r()) * R * 0.8; g.fillStyle = `rgba(255,240,200,${0.1 + r() * 0.22})`; g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, 7); g.fill(); }
  const rough = cvs(S, S), rg = rough.getContext("2d")!; rg.fillStyle = "#999"; rg.fillRect(0, 0, S, S);
  return { map: tex(c), bump: tex(hc, false) };
}

export function tomatoSkin() {
  const c = cvs(256, 256), g = c.getContext("2d")!, im = g.createImageData(256, 256), n = makeNoise(61);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = y / 255, k = n(x / 22, y / 22, 3), sp = n(x / 2.5, y / 2.5, 2);
    const top = sstep(0.0, 0.22, 1 - v) ; // v=0 is the top pole in three's sphere UV (y flipped)
    const i = (y * 256 + x) * 4;
    im.data[i] = (200 + k * 30 - 18 * sp) + top * 26; im.data[i + 1] = (36 + k * 34 + sp * 10) + top * 54; im.data[i + 2] = 26 + k * 12; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); return tex(c);
}

export function fabric() {
  const S = 256, c = cvs(S, S), g = c.getContext("2d")!, im = g.createImageData(S, S), n = makeNoise(71);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const w = (x % 3 === 0 ? 8 : 0) + (y % 3 === 0 ? 8 : 0), k = n(x / 40, y / 40, 3) * 14, i = (y * S + x) * 4; im.data[i] = 238 - w - k; im.data[i + 1] = 232 - w - k; im.data[i + 2] = 218 - w - k * 1.2; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); return tex(c, true, [2, 2]);
}
export function leatherBump() {
  const S = 256, c = cvs(S, S), g = c.getContext("2d")!, im = g.createImageData(S, S), n = makeNoise(11);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = (n(x / 6, y / 6, 3) * 0.6 + n(x / 1.6, y / 1.6, 2) * 0.4) * 255; const i = (y * S + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); return tex(c, false, [3, 4]);
}
function paperGrain(g: CanvasRenderingContext2D, w: number, h: number, tint = "#f3ecda") {
  g.fillStyle = tint; g.fillRect(0, 0, w, h);
  const n = makeNoise(3), im = g.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (n(x / 3, y / 3, 3) - 0.5) * 16 + (Math.random() - 0.5) * 7; const i = (y * w + x) * 4; im.data[i] += v; im.data[i + 1] += v; im.data[i + 2] += v * 1.2; }
  g.putImageData(im, 0, 0);
}
const SERIF = "'Newsreader Variable', Georgia, serif";
export function invoice() {
  const W = 700, H = 990, c = cvs(W, H), g = c.getContext("2d")!; paperGrain(g, W, H);
  const ink = "#1c2420", mute = "#6d6b5c";
  g.fillStyle = ink; g.font = `600 52px ${SERIF}`; g.fillText("Fresh Farms", 56, 100);
  g.font = "13px ui-monospace, Menlo, monospace"; g.fillStyle = mute; g.fillText("WHOLESALE PRODUCE · INVOICE No. 2287 · 28 OCT 2026", 56, 132);
  g.fillStyle = ink; g.fillRect(56, 152, W - 112, 1.5);
  const rows = [["Tomatoes, vine", "10 kg", "41.00", "410.00"], ["Lettuce, cos", "5 kg", "75.00", "375.00"], ["Mozzarella", "5 kg", "390.00", "1,950.00"], ["Olive oil, extra virgin", "3 L", "620.00", "1,860.00"]];
  g.font = "19px ui-monospace, Menlo, monospace";
  rows.forEach((r, i) => { const y = 214 + i * 78; g.fillStyle = ink; g.fillText(r[0], 56, y); g.fillStyle = mute; g.font = "15px ui-monospace, Menlo, monospace"; g.fillText(`${r[1]}  @  ${r[2]}`, 56, y + 26); g.font = "19px ui-monospace, Menlo, monospace"; g.fillStyle = ink; g.textAlign = "right"; g.fillText(r[3], W - 56, y); g.textAlign = "left"; g.fillStyle = "rgba(28,36,32,.12)"; g.fillRect(56, y + 42, W - 112, 1); });
  g.strokeStyle = "rgba(160,48,47,.85)"; g.lineWidth = 3.5; g.beginPath(); g.ellipse(582, 208, 62, 24, -0.08, 0, 7); g.stroke();
  g.fillStyle = "rgba(160,48,47,.9)"; g.font = `italic 600 30px ${SERIF}`; g.fillText("+21%", 540, 262);
  g.fillStyle = ink; g.fillRect(56, 560, W - 112, 1.5); g.font = `600 32px ${SERIF}`; g.fillText("Total", 56, 612); g.textAlign = "right"; g.fillText("₹4,595.00", W - 56, 612); g.textAlign = "left";
  g.font = "13px ui-monospace, Menlo, monospace"; g.fillStyle = mute; g.fillText("Payment due within 14 days. Thank you.", 56, 900);
  return tex(c);
}
export function label() {
  const c = cvs(512, 256), g = c.getContext("2d")!; paperGrain(g, 512, 256);
  g.strokeStyle = "#a98445"; g.lineWidth = 3; g.strokeRect(14, 14, 484, 228); g.lineWidth = 1; g.strokeRect(24, 24, 464, 208);
  g.fillStyle = "#1c2420"; g.textAlign = "center"; g.font = `600 44px ${SERIF}`; g.fillText("Olive & Oak", 256, 104);
  g.font = `italic 26px ${SERIF}`; g.fillStyle = "#6d5426"; g.fillText("Reserva", 256, 146);
  g.fillStyle = "#1c2420"; g.font = "13px ui-monospace, Menlo, monospace"; g.fillText("MMXIX · HOUSE CELLAR", 256, 196);
  return tex(c);
}
/** The WhatsApp-style chat on the phone. */
export function chatScreen() {
  const W = 520, H = 1060, c = cvs(W, H), g = c.getContext("2d")!;
  const rr = (x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  g.fillStyle = "#0b1a15"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#12302a"; g.fillRect(0, 0, W, 170);
  g.fillStyle = "#e9e3d3"; g.font = "600 22px sans-serif"; g.fillText("9:41", 34, 50);
  g.fillStyle = "#0a0f0d"; rr(190, 18, 140, 38, 19); g.fill();
  g.fillStyle = "#dc6d44"; g.beginPath(); g.arc(66, 124, 28, 0, 7); g.fill(); g.fillStyle = "#fff"; g.font = `700 32px ${SERIF}`; g.textAlign = "center"; g.fillText("K", 66, 136); g.textAlign = "left";
  g.fillStyle = "#f4eddc"; g.font = "600 28px sans-serif"; g.fillText("Kooper", 112, 120); g.fillStyle = "#9fb4a8"; g.font = "20px sans-serif"; g.fillText("virtual assistant", 112, 148);
  const bub = (x: number, y: number, w: number, h: number, col: string, tc: string, lines: string[]) => { g.fillStyle = col; rr(x, y, w, h, 24); g.fill(); g.fillStyle = tc; g.font = "500 23px sans-serif"; lines.forEach((l, i) => g.fillText(l, x + 22, y + 40 + i * 31)); };
  bub(150, 210, 350, 130, "#f1ebdb", "#13201b", ["Fresh Farms invoice", "Tomatoes 10 kg  41.00", "Lettuce 5 kg  75.00"]);
  bub(28, 372, 410, 130, "#1d4036", "#f4eddc", ["Tomatoes are ₹41/kg, up", "from ₹34 (+21%). Lettuce", "matches your records."]);
  g.fillStyle = "#dc6d44"; rr(250, 534, 240, 62, 31); g.fill(); g.fillStyle = "#fff"; g.font = "700 22px sans-serif"; g.textAlign = "center"; g.fillText("Draft an order", 370, 573); g.textAlign = "left";
  bub(28, 632, 430, 170, "#1d4036", "#f4eddc", ["Draft ready:", "Tomatoes 10 kg · ₹410", "Lettuce 5 kg · ₹375", "Approve to continue"]);
  g.fillStyle = "#f4eddc"; rr(48, 828, 176, 58, 29); g.fill(); g.fillStyle = "#0a1411"; g.font = "700 22px sans-serif"; g.textAlign = "center"; g.fillText("Approve", 136, 865); g.textAlign = "left";
  g.fillStyle = "#12302a"; g.fillRect(0, 960, W, 100); g.fillStyle = "#0b1a15"; rr(24, 978, 400, 56, 28); g.fill();
  return tex(c);
}
/** An open ledger: notes on the left, this week's spend on the right. */
export function ledger(side: "left" | "right") {
  const W = 640, H = 880, c = cvs(W, H), g = c.getContext("2d")!; paperGrain(g, W, H, "#f1ead6");
  g.strokeStyle = "rgba(90,110,130,.22)"; g.lineWidth = 1.5; for (let y = 130; y < H - 40; y += 44) { g.beginPath(); g.moveTo(50, y); g.lineTo(W - 50, y); g.stroke(); }
  const ink = "#1e2a3a"; g.fillStyle = ink; g.strokeStyle = ink;
  if (side === "left") {
    g.font = `italic 500 44px ${SERIF}`; g.fillText("Mon 26 Oct", 60, 90);
    g.font = `italic 30px ${SERIF}`; ["Tomatoes up 21% — ask Fresh Farms", "Chase mozzarella delivery", "Olive oil: 3 L left, reorder", "Waste: lettuce again?", "Margherita cost ₹73 → hold price"].forEach((t, i) => g.fillText(t, 64, 170 + i * 88));
    g.strokeStyle = "rgba(160,48,47,.8)"; g.lineWidth = 3; g.beginPath(); g.moveTo(60, 372); g.bezierCurveTo(200, 360, 360, 384, 560, 370); g.stroke();
  } else {
    g.font = `italic 500 44px ${SERIF}`; g.fillText("This week", 60, 90);
    const vals = [.62, .8, .5, .95, .72, 1, .78], days = ["M", "T", "W", "T", "F", "S", "S"], x0 = 74, bw = 56, gap = 24, base = 640, hmax = 400;
    g.lineWidth = 2.2; g.beginPath(); g.moveTo(50, base); g.lineTo(W - 50, base); g.stroke();
    vals.forEach((v, i) => { const x = x0 + i * (bw + gap), h = v * hmax; g.fillStyle = i === 6 ? "rgba(160,48,47,.78)" : "rgba(30,42,58,.72)"; g.fillRect(x, base - h, bw, h); g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(x, base - h, bw, h); g.fillStyle = ink; g.font = `italic 28px ${SERIF}`; g.fillText(days[i], x + bw / 2 - 8, base + 40); for (let k = 0; k < 6; k++) { g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 6 + k * 9, base - 4); g.lineTo(x + 20 + k * 9, base - h + 4); g.stroke(); } });
    g.fillStyle = ink; g.font = `italic 34px ${SERIF}`; g.fillText("₹36,900 spent", 60, 740); g.font = `italic 26px ${SERIF}`; g.fillText("3 orders to approve", 60, 790);
  }
  return tex(c);
}
export function glow(col: string, soft = 0.35) {
  const c = cvs(128, 128), g = c.getContext("2d")!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, col); r.addColorStop(soft, col.replace(/[\d.]+\)$/, ".18)")); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function flameTex() {
  const c = cvs(64, 128), g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 82, 0, 32, 82, 40); r.addColorStop(0, "rgba(255,246,214,1)"); r.addColorStop(.3, "rgba(255,196,96,.95)"); r.addColorStop(.7, "rgba(255,130,40,.35)"); r.addColorStop(1, "rgba(255,100,20,0)");
  g.fillStyle = r; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(52, 46, 58, 82, 32, 120); g.bezierCurveTo(6, 82, 12, 46, 32, 4); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Dark panelled back wall with a window of soft out-of-focus lights. */
export function backWall() {
  const W = 1536, H = 640, cv = cvs(W, H), g = cv.getContext("2d")!, rr = mulberry(21);
  g.fillStyle = "#0b1511"; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 96) { const gr = g.createLinearGradient(x, 0, x + 96, 0); gr.addColorStop(0, "rgba(255,255,255,.035)"); gr.addColorStop(.06, "rgba(0,0,0,.35)"); gr.addColorStop(.12, "rgba(255,255,255,.02)"); gr.addColorStop(1, "rgba(0,0,0,.12)"); g.fillStyle = gr; g.fillRect(x, 0, 96, H); }
  const win = g.createLinearGradient(0, 120, 0, 520); win.addColorStop(0, "#0d2420"); win.addColorStop(1, "#14201a"); g.fillStyle = win; g.fillRect(430, 110, 680, 410);
  for (let i = 0; i < 120; i++) { const x = 440 + rr() * 660, y = 130 + rr() * 380, r = 8 + rr() * 30, hue = rr(); const col = hue < .55 ? "255,196,120" : hue < .8 ? "255,150,70" : hue < .92 ? "120,210,185" : "220,110,120"; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${col},${.25 + rr() * .4})`); rg.addColorStop(.7, `rgba(${col},${.12 + rr() * .15})`); rg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.fillStyle = "#070d0a"; g.fillRect(426, 106, 688, 8); g.fillRect(426, 518, 688, 10); g.fillRect(426, 106, 8, 420); g.fillRect(1106, 106, 8, 420); g.fillRect(764, 106, 10, 420);
  for (const sx of [250, 1290]) { const rg = g.createRadialGradient(sx, 200, 0, sx, 200, 220); rg.addColorStop(0, "rgba(255,185,105,.55)"); rg.addColorStop(.25, "rgba(255,160,80,.18)"); rg.addColorStop(1, "rgba(255,150,60,0)"); g.fillStyle = rg; g.fillRect(sx - 220, 0, 440, 420); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
