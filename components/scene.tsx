"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Page } from "./types";
import { backWall, chatScreen, fabric, flameTex, glow, invoice, label, leatherBump, ledger, mulberry, pizza, tomatoSkin, wood, cvs } from "./scene-textures";

/* ───────────────────────── geometry helpers ───────────────────────── */
const lathe = (pts: [number, number][], seg = 64) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
function rrShape(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2, P = Math.PI;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -P / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, P / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, P / 2, P); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, P, 1.5 * P); return s;
}
function cutlery(kind: "knife" | "fork") {
  const s = new THREE.Shape();
  if (kind === "knife") {
    s.moveTo(0, -0.012); s.lineTo(0.1, -0.0105); s.lineTo(0.104, -0.007); s.lineTo(0.17, -0.0075); s.bezierCurveTo(0.205, -0.0075, 0.21, 0.004, 0.185, 0.0095); s.lineTo(0.104, 0.0095); s.lineTo(0.1, 0.0125); s.lineTo(0, 0.012); s.lineTo(-0.006, 0); s.closePath();
  } else {
    s.moveTo(0, -0.0105); s.lineTo(0.1, -0.0035); s.lineTo(0.13, -0.0105);
    const tines = 4, w = 0.021 / tines;
    for (let i = 0; i < tines; i++) { const y0 = -0.0105 + i * w; s.lineTo(0.16, y0 + 0.0005); s.lineTo(0.185, y0 + 0.0008); s.lineTo(0.185, y0 + w - 0.0012); s.lineTo(0.16, y0 + w - 0.001); if (i < tines - 1) s.lineTo(0.145, y0 + w); }
    s.lineTo(0.13, 0.0105); s.lineTo(0.1, 0.0035); s.lineTo(0, 0.0105); s.lineTo(-0.006, 0); s.closePath();
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0025, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 12 });
  g.rotateX(-Math.PI / 2); return g;
}
function tomatoGeo(seed: number) {
  const R = 0.036, g = new THREE.SphereGeometry(R, 36, 26), p = g.attributes.position, r = mulberry(seed), ph = r() * 6, a1 = 0.035 + r() * 0.03, a2 = 0.02 + r() * 0.02;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const th = Math.atan2(z, x), ny = y / R, k = 1 + (a1 * Math.sin(th * 5 + ph) + a2 * Math.sin(th * 3 + ph * 2)) * (1 - Math.abs(ny) * 0.6);
    x *= k; z *= k; const top = Math.max(0, (ny - 0.72) / 0.28); y = y * 0.84 - top * top * 0.0085; const bot = Math.max(0, (-ny - 0.8) / 0.2); y += bot * bot * 0.003;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); return g;
}

/* ───────────────────────── focus presets (one object per screen) ───────────────────────── */
type Focus = { t: [number, number, number]; az: number; el: number; d: number };
export const focusFor: Record<Page, Focus> = {
  Home: { t: [0.02, 0.1, -0.02], az: 0.0, el: 0.38, d: 1.9 },
  Stock: { t: [-0.5, 0.045, -0.12], az: -0.4, el: 0.34, d: 0.9 },
  Orders: { t: [0.42, 0.01, 0.3], az: 0.35, el: 0.85, d: 0.85 },
  Invoices: { t: [0.42, 0.01, 0.3], az: 0.1, el: 1.15, d: 0.7 },
  Costing: { t: [-0.1, 0.02, 0.3], az: -0.2, el: 0.8, d: 0.85 },
  Waste: { t: [-0.56, 0.04, 0.22], az: -0.5, el: 0.7, d: 0.72 },
  Assistant: { t: [0.2, 0.01, 0.2], az: 0.15, el: 0.9, d: 0.66 },
  Reports: { t: [0.62, 0.01, 0.02], az: 0.45, el: 0.75, d: 0.85 },
  More: { t: [0.0, 0.1, 0.0], az: -0.2, el: 0.32, d: 1.6 },
};

export type SceneApi = { focus: (p: Page) => void; dive: (p: Page) => void; release: () => void; dispose: () => void };
export type ScrollState = { y: number; band: number };

function build(canvas: HTMLCanvasElement, onReady: () => void, scrollRef: { current: ScrollState }): SceneApi {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mobile = innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  let dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x07130f, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07130f, 0.3);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 40);

  /* — environment: warm soft-boxes in a dark room, for believable reflections — */
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), new THREE.MeshBasicMaterial({ color: 0x0a1612, side: THREE.BackSide })));
  const box = (w: number, h: number, x: number, y: number, z: number, col: number, k: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
  box(8, 5, 1, 9, 2, 0xffd9a0, 6); box(5, 8, -9, 4, 3, 0xffb870, 2.4); box(6, 3, 9, 3, -4, 0x7fd2bb, 1.2); box(10, 2, 0, 1.5, -12, 0xffe2b8, 1.6); box(3, 3, 5, 2, 8, 0xffc88a, 1.0);
  const pm = new THREE.PMREMGenerator(renderer); const envRT = pm.fromScene(envScene, 0.04); scene.environment = envRT.texture; scene.environmentIntensity = 0.55; pm.dispose();

  /* — lights — */
  scene.add(new THREE.HemisphereLight(0x8fc8b4, 0x120a06, 0.16));
  const key = new THREE.SpotLight(0xffd6a0, 40, 9, 0.56, 0.85, 2); key.position.set(0.5, 2.1, 0.9); key.target.position.set(0, 0, -0.05);
  key.castShadow = true; const ms = mobile ? 1024 : 2048; key.shadow.mapSize.set(ms, ms); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.012; key.shadow.radius = 4; key.shadow.camera.near = 1; key.shadow.camera.far = 5;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x76d0b6, 0.7); rim.position.set(-2.5, 1.2, -3); scene.add(rim);
  const candle = new THREE.PointLight(0xff9d48, 0.42, 2.2, 2); candle.position.set(0, 0.35, -0.2);
  candle.castShadow = true; candle.shadow.mapSize.set(512, 512); candle.shadow.bias = -0.002; candle.shadow.normalBias = 0.01; candle.shadow.camera.near = 0.03; candle.shadow.camera.far = 2.2; scene.add(candle);

  /* — materials — */
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a45c, metalness: 1, roughness: 0.26, envMapIntensity: 1.5 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0f1c17, metalness: 0.85, roughness: 0.32 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0, transparent: true, opacity: 0.16, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 3.2, side: THREE.DoubleSide, depthWrite: false });
  const addMesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, cast = true, parent: THREE.Object3D = scene) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; parent.add(o); return o; };
  const hide: THREE.Object3D[] = []; // things the depth-of-field depth pass must skip (sprites, additive glows)
  const blobTex = glow("rgba(0,0,0,.6)", 0.5);
  const blob = (x: number, z: number, s: number, o = 0.55) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: o, depthWrite: false, fog: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.0008, z); scene.add(m); hide.push(m); };

  /* — room: floor, walnut table, pedestal — */
  const floor = addMesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0b1411, roughness: 0.75, metalness: 0.1 }), 0, -0.75, 0, false); floor.rotation.x = -Math.PI / 2;
  const wd = wood("walnut", 1024, 12); for (const t of [wd.map, wd.bump]) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  addMesh(new THREE.CylinderGeometry(0.95, 0.95, 0.045, 128), [
    new THREE.MeshStandardMaterial({ color: 0x2a170b, roughness: 0.5 }),
    new THREE.MeshPhysicalMaterial({ map: wd.map, bumpMap: wd.bump, bumpScale: 1.4, roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.38, envMapIntensity: 1.0 }),
    new THREE.MeshStandardMaterial({ color: 0x120a05 }),
  ], 0, -0.0225, 0).receiveShadow = true;
  addMesh(lathe([[0, -0.045], [0.1, -0.045], [0.05, -0.08], [0.04, -0.4], [0.07, -0.68], [0.34, -0.735], [0.36, -0.75], [0, -0.75]], 64), darkMetal, 0, 0, 0, false);

  /* — candlestick (Home · Ask Kooper) — */
  const candleG = new THREE.Group(); candleG.position.set(0, 0, -0.2); scene.add(candleG);
  const stick = new THREE.Mesh(lathe([[0, 0], [0.052, 0], [0.054, 0.006], [0.044, 0.016], [0.02, 0.03], [0.013, 0.05], [0.02, 0.07], [0.013, 0.09], [0.012, 0.12], [0.022, 0.135], [0.032, 0.15], [0.03, 0.157], [0.02, 0.152], [0.012, 0.15], [0, 0.15]], 56), brass); stick.castShadow = stick.receiveShadow = true; candleG.add(stick);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0115, 0.17, 32), new THREE.MeshPhysicalMaterial({ color: 0xf1e7cf, roughness: 0.5, sheen: 1, sheenColor: new THREE.Color(0xffc98a), emissive: 0x3a1c06, emissiveIntensity: 0.55 })); wax.position.y = 0.23; wax.castShadow = true; candleG.add(wax);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.012, 6), new THREE.MeshBasicMaterial({ color: 0x120c08 })); wick.position.y = 0.325; candleG.add(wick);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); flame.scale.set(0.02, 0.04, 1); flame.position.y = 0.347; candleG.add(flame); hide.push(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow("rgba(255,170,80,1)", 0.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false })); halo.scale.set(0.24, 0.24, 1); halo.position.copy(flame.position); candleG.add(halo); hide.push(halo);
  blob(0, -0.2, 0.16);

  /* — wine bottle + glasses — */
  const bx = -0.14, bz = -0.42;
  const bottle = new THREE.Mesh(lathe([[0, 0], [0.034, 0], [0.038, 0.004], [0.038, 0.19], [0.036, 0.205], [0.029, 0.228], [0.0185, 0.246], [0.0155, 0.262], [0.0155, 0.305], [0.0185, 0.309], [0.0185, 0.318], [0.0155, 0.318], [0.0145, 0.3], [0.0145, 0.262], [0.017, 0.246], [0.027, 0.228], [0.034, 0.205], [0.036, 0.19], [0.036, 0.006], [0, 0.006]], 64), new THREE.MeshPhysicalMaterial({ color: 0x0a1f14, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.6, transparent: true, opacity: 0.96, ior: 1.5 }));
  bottle.position.set(bx, 0, bz); bottle.castShadow = bottle.receiveShadow = true; scene.add(bottle);
  addMesh(new THREE.CylinderGeometry(0.033, 0.033, 0.17, 32), new THREE.MeshStandardMaterial({ color: 0x1a0509, roughness: 0.2 }), bx, 0.095, bz, false);
  const lab = addMesh(new THREE.CylinderGeometry(0.0385, 0.0385, 0.1, 48, 1, true, -Math.PI * 0.55, Math.PI * 1.1), new THREE.MeshStandardMaterial({ map: label(), roughness: 0.85, side: THREE.DoubleSide }), bx, 0.105, bz, false); lab.rotation.y = 0.35;
  addMesh(lathe([[0.0192, 0.268], [0.0192, 0.321], [0.0155, 0.321], [0.0155, 0.268]], 40), new THREE.MeshStandardMaterial({ color: 0x5b1822, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }), bx, 0, bz, false);
  blob(bx, bz, 0.15);
  const gp: [number, number][] = [[0, 0], [0.034, 0], [0.0345, 0.0035], [0.012, 0.008], [0.0042, 0.014], [0.0042, 0.088], [0.012, 0.098], [0.029, 0.108], [0.04, 0.13], [0.0425, 0.152], [0.039, 0.176], [0.031, 0.196], [0.029, 0.2]];
  const inner: [number, number][] = [...gp].reverse().slice(0, 7).map(([r, y]) => [Math.max(0, r - 0.0012), y - 0.0012] as [number, number]);
  const glassGeo = lathe([...gp, ...inner, [0, 0.1]], 72);
  const wineGeo = lathe([[0, 0.112], [0.0275, 0.114], [0.0385, 0.132], [0.0398, 0.146], [0.0375, 0.158], [0, 0.158]], 56);
  const wineMat = new THREE.MeshPhysicalMaterial({ color: 0x3a0612, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, transparent: true, opacity: 0.94 });
  const gA = addMesh(glassGeo, glass, 0.3, 0, -0.1, false); gA.renderOrder = 2; addMesh(wineGeo, wineMat, 0.3, 0, -0.1, false);
  const gB = addMesh(glassGeo, glass, 0.46, 0, -0.26, false); gB.renderOrder = 2; addMesh(wineGeo, wineMat, 0.46, 0, -0.26, false).scale.set(0.9, 0.4, 0.9);
  blob(0.3, -0.1, 0.14); blob(0.46, -0.26, 0.14);

  /* — olive sprig in a glass bud vase — */
  {
    const vg = new THREE.Group(); vg.position.set(0.12, 0, -0.4); scene.add(vg);
    const vase = new THREE.Mesh(lathe([[0, 0], [0.02, 0], [0.026, 0.012], [0.024, 0.07], [0.012, 0.105], [0.0095, 0.14], [0.0125, 0.146], [0.0105, 0.146], [0.0085, 0.14], [0.0105, 0.105], [0.022, 0.07], [0.0235, 0.014], [0, 0.006]], 48), glass); vase.renderOrder = 2; vg.add(vase);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.0185, 0.055, 32), new THREE.MeshPhysicalMaterial({ color: 0xcfe6df, transparent: true, opacity: 0.3, roughness: 0, clearcoat: 1 })); water.position.y = 0.035; vg.add(water);
    const lc = cvs(64, 256), lg = lc.getContext("2d")!; const lgr = lg.createLinearGradient(0, 0, 64, 0); lgr.addColorStop(0, "#6d7c58"); lgr.addColorStop(.5, "#9fae86"); lgr.addColorStop(1, "#6d7c58"); lg.fillStyle = lgr; lg.beginPath(); lg.moveTo(32, 2); lg.bezierCurveTo(70, 70, 66, 190, 32, 254); lg.bezierCurveTo(-2, 190, -6, 70, 32, 2); lg.fill(); lg.strokeStyle = "rgba(240,245,225,.45)"; lg.lineWidth = 2; lg.beginPath(); lg.moveTo(32, 8); lg.lineTo(32, 250); lg.stroke();
    const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
    const leafGeo = new THREE.PlaneGeometry(0.014, 0.058); leafGeo.translate(0, 0.029, 0);
    const lm = new THREE.MeshStandardMaterial({ map: lt, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05 });
    const stem = new THREE.MeshStandardMaterial({ color: 0x4d4a35, roughness: 0.7 }), sr = mulberry(5);
    const branch = (ang: number, len: number, x0: number) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0019, len, 6), stem); s.position.set(x0 + Math.sin(ang) * len / 2, 0.06 + Math.cos(ang) * len / 2, 0); s.rotation.z = -ang; s.castShadow = true; vg.add(s);
      for (let i = 3; i < 11; i++) { const u = i / 10; for (const side of [-1, 1]) { const l = new THREE.Mesh(leafGeo, lm); l.position.set(x0 + Math.sin(ang) * len * u, 0.06 + Math.cos(ang) * len * u, 0); l.rotation.set((sr() - .5) * .8, (sr() - .5) * 1.6, -ang + side * (0.9 + sr() * .5)); l.scale.setScalar(.8 + (1 - u) * .15 + sr() * .2); l.castShadow = true; vg.add(l); } }
      const tip = new THREE.Mesh(leafGeo, lm); tip.position.set(x0 + Math.sin(ang) * len, 0.06 + Math.cos(ang) * len, 0); tip.rotation.z = -ang; vg.add(tip);
    };
    branch(0.1, 0.27, 0); branch(-0.42, 0.2, 0); branch(0.52, 0.17, 0.002);
    blob(0.12, -0.4, 0.1);
  }

  /* — STOCK: a slatted crate of tomatoes — */
  {
    const cg = new THREE.Group(); cg.position.set(-0.5, 0, -0.12); cg.rotation.y = 0.35; scene.add(cg);
    const pn = wood("pine", 512, 6), pineMat = new THREE.MeshStandardMaterial({ map: pn.map, bumpMap: pn.bump, bumpScale: 1, roughness: 0.78 });
    const W = 0.3, D = 0.2, H = 0.088, slat = (w: number, h: number, d: number, x: number, y: number, z: number) => addMesh(new RoundedBoxGeometry(w, h, d, 2, 0.0015), pineMat, x, y, z, true, cg);
    slat(W - 0.012, 0.007, D - 0.012, 0, 0.0035, 0);
    for (const y of [0.016, 0.044, 0.072]) { slat(W, 0.024, 0.008, 0, y + 0.007, D / 2 - 0.004); slat(W, 0.024, 0.008, 0, y + 0.007, -D / 2 + 0.004); slat(0.008, 0.024, D - 0.016, W / 2 - 0.004, y + 0.007, 0); slat(0.008, 0.024, D - 0.016, -W / 2 + 0.004, y + 0.007, 0); }
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) slat(0.016, H, 0.016, x * (W / 2 - 0.008), H / 2, z * (D / 2 - 0.008));
    const skin = tomatoSkin(), tm = new THREE.MeshPhysicalMaterial({ map: skin, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.28, sheen: 0.4, sheenColor: new THREE.Color(0xff9a7a), envMapIntensity: 1.2 });
    const calyx = new THREE.MeshStandardMaterial({ color: 0x4a7d34, roughness: 0.65, side: THREE.DoubleSide }), sr = mulberry(3);
    const place = (x: number, y: number, z: number, i: number) => {
      const t = new THREE.Group(); t.position.set(x, y, z); t.rotation.set((sr() - .5) * .5, sr() * 6, (sr() - .5) * .5); cg.add(t);
      addMesh(tomatoGeo(i + 11), tm, 0, 0, 0, true, t);
      for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.026, 4), calyx); const a = (k / 5) * Math.PI * 2; l.position.set(Math.cos(a) * 0.009, 0.026, Math.sin(a) * 0.009); l.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15); l.scale.set(1, 1, 0.35); l.castShadow = true; t.add(l); }
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.002, 0.014, 6), new THREE.MeshStandardMaterial({ color: 0x3d5e2a, roughness: 0.7 })); st.position.y = 0.032; t.add(st);
    };
    let n = 0; for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) place(-0.088 + c * 0.088 + (sr() - .5) * 0.01, 0.04, -0.045 + r * 0.09 + (sr() - .5) * 0.01, n++);
    [[-0.045, 0.0], [0.04, 0.012], [0.0, -0.04]].forEach(([x, z]) => place(x, 0.088, z, n++));
    blob(-0.5, -0.12, 0.42, 0.45);
  }

  /* — COSTING: a Margherita on a pale board, napkin and knife — */
  {
    const pg = new THREE.Group(); pg.position.set(-0.1, 0, 0.3); pg.rotation.y = 0.25; scene.add(pg);
    const pn = wood("pine", 512, 1); pn.map.wrapS = pn.map.wrapT = THREE.RepeatWrapping;
    addMesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 72), new THREE.MeshStandardMaterial({ map: pn.map, bumpMap: pn.bump, bumpScale: 0.8, roughness: 0.62, color: 0xd9b384 }), 0, 0.01, 0, true, pg);
    const pz = pizza(768);
    const dough = new THREE.MeshStandardMaterial({ color: 0xcf9a55, roughness: 0.85 });
    addMesh(new THREE.CylinderGeometry(0.15, 0.148, 0.016, 96), [dough, new THREE.MeshPhysicalMaterial({ map: pz.map, bumpMap: pz.bump, bumpScale: 3.2, roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0xffd9a0), clearcoat: 0.18, clearcoatRoughness: 0.45 }), dough], 0, 0.028, 0, true, pg);
    const nap = new THREE.MeshStandardMaterial({ map: fabric(), roughness: 0.95 });
    const n1 = addMesh(new RoundedBoxGeometry(0.13, 0.012, 0.19, 3, 0.004), nap, -0.35, 0.006, 0.3); n1.rotation.y = 0.16;
    const n2 = addMesh(new RoundedBoxGeometry(0.11, 0.008, 0.17, 3, 0.003), nap, -0.352, 0.016, 0.302); n2.rotation.y = -0.05;
    const knife = addMesh(cutlery("knife"), brass, -0.285, 0.0215, 0.37); knife.rotation.y = -Math.PI / 2 + 0.2; knife.position.set(-0.34, 0.0215, 0.39);
    blob(-0.1, 0.3, 0.46, 0.4); blob(-0.35, 0.3, 0.2, 0.3);
  }

  /* — ASK KOOPER: the phone with the conversation — */
  {
    const ph = new THREE.Group(); ph.position.set(0.2, 0, 0.2); ph.rotation.y = 0.5; scene.add(ph);
    addMesh(new RoundedBoxGeometry(0.072, 0.0085, 0.152, 4, 0.011), new THREE.MeshStandardMaterial({ color: 0x8e8f94, metalness: 0.95, roughness: 0.28, envMapIntensity: 1.6 }), 0, 0.00425, 0, true, ph);
    const sg = new THREE.ShapeGeometry(rrShape(0.066, 0.146, 0.009), 16), su = sg.attributes.uv, sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) su.setXY(i, (sp.getX(i) + 0.033) / 0.066, (sp.getY(i) + 0.073) / 0.146);
    const scr = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: chatScreen(), toneMapped: false, color: 0xc4c4c4 })); scr.rotation.x = -Math.PI / 2; scr.position.y = 0.00865; ph.add(scr);
    const gl2 = new THREE.PointLight(0x9fe8c4, 0.02, 0.5, 2); gl2.position.set(0, 0.04, 0); ph.add(gl2);
    blob(0.2, 0.2, 0.2, 0.45);
  }

  /* — ORDERS · INVOICES: the supplier invoice and a pen — */
  const makePen = () => {
    const pen = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0058, 0.14, 24), new THREE.MeshPhysicalMaterial({ color: 0x0d1210, roughness: 0.2, clearcoat: 1 })); body.castShadow = true; pen.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.02, 24), brass); tip.position.y = -0.08; pen.add(tip);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.05, 0.002), brass); clip.position.set(0.006, 0.045, 0); pen.add(clip);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0059, 0.0059, 0.004, 24), brass); ring.position.y = 0.02; pen.add(ring);
    return pen;
  };
  {
    const pg = new THREE.PlaneGeometry(0.21, 0.297, 16, 20), pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i); pp.setZ(i, Math.sin(x * 14 + 1) * 0.0012 + Math.max(0, y) * 0.018 * Math.max(0, y) * 6); }
    pg.computeVertexNormals();
    const paper = addMesh(pg, new THREE.MeshStandardMaterial({ map: invoice(), roughness: 0.92, side: THREE.DoubleSide }), 0.42, 0.0035, 0.3); paper.rotation.set(-Math.PI / 2, 0, 0.3);
    const paper2 = addMesh(new THREE.PlaneGeometry(0.21, 0.297), new THREE.MeshStandardMaterial({ color: 0xe8e0cb, roughness: 0.95, side: THREE.DoubleSide }), 0.4, 0.0012, 0.32); paper2.rotation.set(-Math.PI / 2, 0, 0.05);
    const pen = makePen(); pen.rotation.set(0, 0.5, Math.PI / 2); pen.position.set(0.37, 0.0095, 0.34); scene.add(pen);
    blob(0.4, 0.31, 0.34, 0.3);
  }

  /* — REPORTS: an open ledger with this week's spend — */
  {
    const nb = new THREE.Group(); nb.position.set(0.64, 0, 0.0); nb.rotation.y = -0.55; scene.add(nb);
    const lb = leatherBump();
    addMesh(new RoundedBoxGeometry(0.42, 0.012, 0.27, 4, 0.005), new THREE.MeshPhysicalMaterial({ color: 0x2b1c14, roughness: 0.5, bumpMap: lb, bumpScale: 1.6, sheen: 0.6, sheenColor: new THREE.Color(0x6a4a32) }), 0, 0.006, 0, true, nb);
    const paperEdge = new THREE.MeshStandardMaterial({ color: 0xe9dfc6, roughness: 0.9 });
    addMesh(new THREE.BoxGeometry(0.192, 0.014, 0.252), paperEdge, -0.098, 0.019, 0, true, nb); addMesh(new THREE.BoxGeometry(0.192, 0.014, 0.252), paperEdge, 0.098, 0.019, 0, true, nb);
    for (const side of ["left", "right"] as const) {
      const g = new THREE.PlaneGeometry(0.19, 0.25, 28, 1), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), u = side === "right" ? (x + 0.095) / 0.19 : 1 - (x + 0.095) / 0.19; pos.setZ(i, 0.006 * Math.sin(Math.min(1, u * 1.5) * Math.PI / 2) - 0.002); }
      g.computeVertexNormals();
      const pgm = addMesh(g, new THREE.MeshStandardMaterial({ map: ledger(side), roughness: 0.9, side: THREE.DoubleSide }), side === "right" ? 0.099 : -0.099, 0.0262, 0, false, nb); pgm.rotation.x = -Math.PI / 2;
    }
    addMesh(new THREE.BoxGeometry(0.004, 0.0012, 0.2), new THREE.MeshStandardMaterial({ color: 0x8a2536, roughness: 0.5 }), 0.03, 0.0345, 0.04, false, nb);
    const pen = makePen(); pen.rotation.set(0, 0.35, Math.PI / 2); pen.position.set(-0.07, 0.0345, 0.03); nb.add(pen);
    blob(0.64, 0, 0.5, 0.4);
  }

  /* — WASTE: a steel bowl of kitchen scraps — */
  {
    const wg = new THREE.Group(); wg.position.set(-0.56, 0, 0.22); scene.add(wg);
    addMesh(lathe([[0, 0], [0.045, 0], [0.068, 0.006], [0.092, 0.04], [0.1, 0.07], [0.1015, 0.074], [0.0985, 0.0745], [0.0965, 0.07], [0.088, 0.04], [0.066, 0.011], [0, 0.009]], 72), new THREE.MeshStandardMaterial({ color: 0xcfd2d4, metalness: 1, roughness: 0.22, envMapIntensity: 1.6, side: THREE.DoubleSide }), 0, 0, 0, true, wg);
    const r = mulberry(17);
    const carrot = new THREE.MeshStandardMaterial({ color: 0xd9621c, roughness: 0.5, side: THREE.DoubleSide }), onion = new THREE.MeshStandardMaterial({ color: 0xa8683a, roughness: 0.6, side: THREE.DoubleSide }), leaf = new THREE.MeshStandardMaterial({ color: 0x6f9a3c, roughness: 0.55, side: THREE.DoubleSide }), stem = new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.6 }), tom = new THREE.MeshStandardMaterial({ color: 0xc23122, roughness: 0.4 }), shell = new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.55, side: THREE.DoubleSide });
    const rp = (rad: number) => { const a = r() * 6.28, d = Math.sqrt(r()) * rad; return [Math.cos(a) * d, Math.sin(a) * d] as const; };
    for (let i = 0; i < 6; i++) { const [x, z] = rp(0.06), pts: THREE.Vector3[] = []; for (let k = 0; k < 7; k++) pts.push(new THREE.Vector3(Math.cos(k * 1.1) * 0.012, k * 0.0045, Math.sin(k * 1.1) * 0.012)); const m = addMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0028, 5, false), carrot, x, 0.022 + r() * 0.02, z, true, wg); m.scale.set(1, 1, 0.45); m.rotation.set(r() * 3, r() * 6, r() * 3); }
    for (let i = 0; i < 4; i++) { const [x, z] = rp(0.06), g = new THREE.PlaneGeometry(0.036, 0.05, 6, 6), p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, Math.cos(p.getX(k) * 90) * 0.005); g.computeVertexNormals(); const m = addMesh(g, onion, x, 0.03 + r() * 0.03, z, true, wg); m.rotation.set(r() * 3, r() * 6, r() * 3); }
    for (let i = 0; i < 2; i++) { const [x, z] = rp(0.05), g = new THREE.PlaneGeometry(0.07, 0.09, 16, 16), p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 140 + p.getY(k) * 60) * 0.004 + (p.getX(k) ** 2) * 1.6); g.computeVertexNormals(); const m = addMesh(g, leaf, x, 0.04 + i * 0.012, z, true, wg); m.rotation.set(-1.2 + r() * 0.5, r() * 6, 0); }
    for (let i = 0; i < 8; i++) { const [x, z] = rp(0.065), m = addMesh(new THREE.CylinderGeometry(0.0016, 0.0018, 0.055, 6), stem, x, 0.04 + r() * 0.03, z, true, wg); m.rotation.set(r() * 3, r() * 6, r() * 3); }
    for (let i = 0; i < 2; i++) { const [x, z] = rp(0.045), m = addMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.005, 24), tom, x, 0.045 + i * 0.01, z, true, wg); m.rotation.set(r() * .6, r() * 6, r() * .6); }
    for (let i = 0; i < 3; i++) { const [x, z] = rp(0.05), m = addMesh(new THREE.SphereGeometry(0.018, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.46), shell, x, 0.05 + r() * 0.012, z, true, wg); m.rotation.set(r() * 3, r() * 6, r() * 3); }
    blob(-0.56, 0.22, 0.32, 0.45);
  }

  /* — back wall, a soft shaft of light, bokeh and dust — */
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.8), new THREE.MeshBasicMaterial({ map: backWall(), fog: false })); wall.position.set(0, 1.5, -5.6); scene.add(wall);
  {
    const a = cvs(8, 128), g = a.getContext("2d")!, gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#fff"); gr.addColorStop(.55, "#555"); gr.addColorStop(1, "#000"); g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.62, 2.3, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.026, alphaMap: new THREE.CanvasTexture(a), side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    shaft.position.set(0.28, 1.12, 0.45); shaft.lookAt(0, 0, -0.05); shaft.rotateX(Math.PI / 2); scene.add(shaft); hide.push(shaft);
  }
  const bt = glow("rgba(255,255,255,1)", 0.55), bokeh: THREE.Sprite[] = [];
  const palette = [0xffc56b, 0xffa24a, 0xffd9a0, 0x57c2a4, 0xc4586a];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, color: palette[i % 5 === 3 ? 3 : i % 11 === 0 ? 4 : i % 3], transparent: true, opacity: 0.1 + Math.random() * 0.24, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const a = -Math.PI * (0.15 + Math.random() * 0.7), r = 3.4 + Math.random() * 3; s.position.set(Math.cos(a) * r * 1.5, 0.1 + Math.random() * 2.0, Math.sin(a) * r - 0.8);
    const sc = 0.3 + Math.random() * 0.8; s.scale.set(sc, sc, 1); s.userData = { o: (s.material as THREE.SpriteMaterial).opacity, p: Math.random() * 6, v: 0.2 + Math.random() * 0.5 }; scene.add(s); bokeh.push(s); hide.push(s);
  }
  const DN = 140, dp = new Float32Array(DN * 3); for (let i = 0; i < DN; i++) { dp[i * 3] = (Math.random() - 0.5) * 1.8; dp[i * 3 + 1] = Math.random() * 1.1; dp[i * 3 + 2] = (Math.random() - 0.5) * 1.6; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.0045, map: bt, color: 0xffe0b0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false })); scene.add(dust); hide.push(dust);

  /* — depth of field: the focused object is crisp, the room melts away behind it — */
  let composer: EffectComposer | null = null, bokehPass: BokehPass | null = null, useDof = !mobile && !/nodof/.test(location.search);
  const initComposer = () => {
    try {
      const w = innerWidth * dpr, h = innerHeight * dpr;
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt); composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight);
      composer.addPass(new RenderPass(scene, cam));
      bokehPass = new BokehPass(scene, cam, { focus: 1.8, aperture: 0.004, maxblur: 0.013 });
      const orig = bokehPass.render.bind(bokehPass) as (...a: unknown[]) => void;
      (bokehPass as unknown as { render: (...a: unknown[]) => void }).render = (...a: unknown[]) => { hide.forEach((o) => (o.visible = false)); orig(...a); hide.forEach((o) => (o.visible = true)); };
      composer.addPass(bokehPass); composer.addPass(new OutputPass());
    } catch (e) { console.warn("Depth of field unavailable", e); composer = null; bokehPass = null; useDof = false; }
  };
  if (useDof) initComposer();

  /* — camera rig (critically damped, so every move glides) — */
  // opening shot: high above the table, looking almost straight down
  const cur = { tx: 0, ty: 0.05, tz: 0, az: -0.7, el: 1.3, d: 3.1, ox: 0, oy: 0 };
  let goal: Focus = focusFor.Home, mx = 0, my = 0, smx = 0, smy = 0, focusDist = 1.9;
  let held = true, diving = false, since = 0;
  let curPage: Page = "Home";
  const layout = (sc: number) => {
    const w = innerWidth, h = innerHeight, S = scrollRef.current, home = curPage === "Home";
    const bandFrac = Math.min(1, Math.max(0.2, S.band / h));
    const ox = home && w >= 900 ? -0.17 * (1 - Math.min(1, sc * 1.8)) : 0;
    const oy = 0.5 - bandFrac * 0.5 - (home ? 0.0 : 0.02) + sc * 0.28;
    return { ox, oy, zoom: home ? 1 : 1.5 };
  };
  const resize = () => {
    mobile = innerWidth < 760; const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.fov = w / h < 0.8 ? 44 : 30; cam.updateProjectionMatrix();
    composer?.setPixelRatio(dpr); composer?.setSize(w, h);
  };
  resize(); addEventListener("resize", resize);
  const onMove = (e: PointerEvent) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; };
  addEventListener("pointermove", onMove, { passive: true });

  const place = (dt: number, t: number) => {
    const rate = held ? 0 : diving ? 4.6 : since < 3.2 ? 1.35 + since * 0.35 : 2.4;
    if (!held) since += dt;
    const k = 1 - Math.exp(-dt * rate), S = scrollRef.current, sc = Math.min(1.4, Math.max(0, S.y / innerHeight)), L = layout(sc);
    cur.tx += (goal.t[0] - cur.tx) * k; cur.ty += (goal.t[1] - cur.ty) * k; cur.tz += (goal.t[2] - cur.tz) * k;
    cur.az += (goal.az - cur.az) * k; cur.el += (goal.el - cur.el) * k; cur.d += (goal.d * L.zoom * (mobile ? 1.3 : 1) - cur.d) * k;
    cur.ox += (L.ox - cur.ox) * k; cur.oy += (L.oy - cur.oy) * (1 - Math.exp(-dt * (held ? 0 : 6)));
    smx += (mx - smx) * (1 - Math.exp(-dt * 3)); smy += (my - smy) * (1 - Math.exp(-dt * 3));
    const drift = reduce ? 0 : 1;
    const az = cur.az + Math.sin(t * 0.13) * 0.05 * drift - smx * 0.12 + sc * 0.34, el = Math.max(0.08, cur.el + Math.sin(t * 0.17 + 1) * 0.015 * drift + smy * 0.07 + sc * 0.07), dd = cur.d * (1 + sc * 0.1);
    cam.position.set(cur.tx + Math.sin(az) * Math.cos(el) * dd, cur.ty + Math.sin(el) * dd, cur.tz + Math.cos(az) * Math.cos(el) * dd);
    cam.lookAt(cur.tx, cur.ty, cur.tz); focusDist = dd;
    const w = innerWidth, h = innerHeight; cam.setViewOffset(w, h, cur.ox * w, cur.oy * h, w, h);
  };

  /* — loop — */
  let raf = 0, last = performance.now(), t = 0, acc = 0, frames = 0, slow = 0, alive = true, first = true;
  const frame = (now: number) => {
    if (!alive) return; raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; t += dt;
    const fl = 1 + 0.07 * Math.sin(t * 13) + 0.05 * Math.sin(t * 23.7 + 1) + 0.04 * Math.sin(t * 5.3 + 2);
    if (!reduce) { candle.intensity = 0.42 * fl; flame.scale.set(0.02 * (1 + (fl - 1) * 0.5), 0.04 * fl, 1); flame.position.x = Math.sin(t * 3.1) * 0.0006; (halo.material as THREE.SpriteMaterial).opacity = 0.5 + (fl - 1) * 1.2; }
    bokeh.forEach((s) => { (s.material as THREE.SpriteMaterial).opacity = s.userData.o * (0.75 + 0.25 * Math.sin(t * s.userData.v + s.userData.p)); });
    if (!reduce) { dust.rotation.y = t * 0.012; dust.position.y = Math.sin(t * 0.2) * 0.02; }
    place(dt, t);
    if (useDof && composer && bokehPass) {
      const u = (bokehPass as unknown as { uniforms: Record<string, { value: number }> }).uniforms;
      u["focus"].value = focusDist; u["aperture"].value = 0.0072 / Math.max(0.55, focusDist); u["maxblur"].value = 0.013;
      composer.render(dt);
    } else renderer.render(scene, cam);
    if (first) { first = false; onReady(); }
    // adaptive quality: if we're dropping frames, drop depth of field first, then resolution
    acc += dt; frames++;
    if (acc >= 1.5) {
      const fps = frames / acc; acc = 0; frames = 0;
      if (fps < 40) { slow++; if (slow >= 2) { if (useDof) { useDof = false; renderer.setRenderTarget(null); } else if (dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); } slow = 0; } } else slow = 0;
    }
  };
  renderer.shadowMap.needsUpdate = true;
  raf = requestAnimationFrame(frame);
  const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); } else { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", vis);

  return {
    focus: (p) => { goal = focusFor[p] ?? focusFor.Home; curPage = p; diving = false; },
    // fly straight down onto the object that belongs to a screen; the page then opens from it
    dive: (p) => { const f = focusFor[p] ?? focusFor.Home; goal = { t: f.t, az: f.az * 0.4, el: 1.34, d: Math.max(0.55, f.d * 0.5) }; curPage = p; diving = true; },
    release: () => { held = false; },
    dispose: () => {
      alive = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("pointermove", onMove); document.removeEventListener("visibilitychange", vis);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach((x) => x.dispose()); });
      composer?.dispose(); envRT.dispose(); renderer.dispose();
    },
  };
}

export default function Scene({ focus, scroll, apiRef, intro, onReady, onFail }: { focus: Page; scroll: { current: ScrollState }; apiRef: { current: SceneApi | null }; intro: boolean; onReady: () => void; onFail: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = apiRef;
  const introRef = useRef(intro); introRef.current = intro;
  const f = useRef(focus); f.current = focus;
  useEffect(() => {
    const c = ref.current; if (!c) return;
    let dead = false;
    // wait for the display font so the invoice/label textures are drawn with it
    const go = () => { if (dead) return; try { api.current = build(c, onReady, scroll); api.current.focus(f.current); if (introRef.current) api.current.release(); c.classList.add("on"); } catch (e) { console.warn("WebGL unavailable", e); onFail(); } };
    (document.fonts?.load ? Promise.race([document.fonts.load("600 40px 'Newsreader Variable'"), new Promise((r) => setTimeout(r, 900))]) : Promise.resolve()).then(go, go);
    return () => { dead = true; api.current?.dispose(); api.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.focus(focus); }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (intro) api.current?.release(); }, [intro]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas id="gl" ref={ref} aria-hidden="true" />;
}
