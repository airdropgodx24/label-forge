#!/usr/bin/env node
/**
 * Generates the Image Preference sample job for LabelForge.
 *
 *   node apps/image-preference/tools/generate-sample-data.mjs
 *
 * Writes:
 *   public/images/ip-NN-a.svg, ip-NN-b.svg   25 pairs of 640x400 illustrations
 *   data/sample-tasks.json                   the 25 tasks, in the core's task file format
 *
 * Every image is drawn by this script from the scene parameters below, with a
 * seeded random generator, so the output is identical on every run. No
 * outside images, fonts, or assets are used. See ../README.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 640;
const H = 400;
const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- helpers

/** Small seeded random generator (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const n1 = (n) => Math.round(n * 10) / 10;
const pts = (list) => list.map(([x, y]) => `${n1(x)},${n1(y)}`).join(" ");

// ----------------------------------------------------------- scene engine

function renderScene(spec, seed, title) {
  const rand = mulberry32(seed);
  const R = (a, b) => a + (b - a) * rand();
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const defs = [];
  const body = [];

  // Sky
  defs.push(
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${spec.sky[0]}"/><stop offset="1" stop-color="${spec.sky[1]}"/></linearGradient>`,
  );
  body.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);

  for (let i = 0; i < (spec.stars ?? 0); i++) {
    body.push(
      `<circle cx="${n1(R(0, W))}" cy="${n1(R(0, H * 0.6))}" r="${n1(R(0.6, 1.7))}" fill="#fff" opacity="${n1(R(0.45, 1))}"/>`,
    );
  }

  if (spec.sun) {
    const { x, y, r, color = "#fff3c4" } = spec.sun;
    defs.push(
      `<radialGradient id="sunglow"><stop offset="0" stop-color="${color}" stop-opacity="0.75"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
    );
    body.push(`<circle cx="${x}" cy="${y}" r="${n1(r * 3.4)}" fill="url(#sunglow)"/>`);
    body.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`);
  }

  if (spec.moon) {
    const { x, y, r } = spec.moon;
    defs.push(
      `<radialGradient id="moonglow"><stop offset="0" stop-color="#e9efff" stop-opacity="0.55"/><stop offset="1" stop-color="#e9efff" stop-opacity="0"/></radialGradient>`,
    );
    body.push(`<circle cx="${x}" cy="${y}" r="${n1(r * 3)}" fill="url(#moonglow)"/>`);
    body.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#f6f3e4"/>`);
    body.push(`<circle cx="${n1(x - r * 0.3)}" cy="${n1(y - r * 0.2)}" r="${n1(r * 0.2)}" fill="#000" opacity="0.07"/>`);
    body.push(`<circle cx="${n1(x + r * 0.35)}" cy="${n1(y + r * 0.3)}" r="${n1(r * 0.28)}" fill="#000" opacity="0.06"/>`);
  }

  if (spec.clouds) {
    const { n, color, opacity = 0.9, y: [y0, y1], scale: [s0, s1] = [0.8, 1.2] } = spec.clouds;
    for (let i = 0; i < n; i++) {
      const cx = R(0, W);
      const cy = R(y0, y1);
      const s = R(s0, s1);
      const e = (dx, dy, rx, ry) =>
        `<ellipse cx="${n1(cx + dx * s)}" cy="${n1(cy + dy * s)}" rx="${n1(rx * s)}" ry="${n1(ry * s)}"/>`;
      body.push(
        `<g fill="${color}" opacity="${opacity}">${e(0, 0, 62, 20)}${e(-38, 6, 40, 16)}${e(40, 5, 44, 17)}${e(4, -12, 36, 17)}</g>`,
      );
    }
  }

  if (spec.mountains) {
    const { color, base, h, count, snow = false } = spec.mountains;
    const peaks = [];
    const poly = [[-10, base]];
    const step = (W + 40) / count;
    for (let i = 0; i < count; i++) {
      const px = -20 + step * (i + 0.5) + R(-step * 0.15, step * 0.15);
      const py = base - R(h * 0.55, h);
      peaks.push([px, py]);
      poly.push([px, py]);
      poly.push([px + step * 0.5 + R(-8, 8), base - R(0, h * 0.25)]);
    }
    poly.push([W + 10, base], [W + 10, H], [-10, H]);
    body.push(`<polygon points="${pts(poly)}" fill="${color}"/>`);
    if (snow) {
      for (const [px, py] of peaks) {
        if (base - py < h * 0.7) continue;
        body.push(
          `<polygon points="${pts([[px, py], [px - 20, py + 26], [px - 8, py + 19], [px, py + 31], [px + 9, py + 19], [px + 21, py + 27]])}" fill="#fff" opacity="0.95"/>`,
        );
      }
    }
  }

  for (const hill of spec.hills ?? []) {
    const { color, y, amp } = hill;
    const p1 = R(0, 6);
    const p2 = R(0, 6);
    const period = hill.period ?? 95;
    const poly = [[0, H]];
    for (let x = 0; x <= W + 12; x += 12) {
      poly.push([x, y + amp * Math.sin(x / period + p1) + amp * 0.4 * Math.sin(x / 37 + p2)]);
    }
    poly.push([W, H]);
    body.push(`<polygon points="${pts(poly)}" fill="${color}"/>`);
  }

  for (const layer of [].concat(spec.city ?? [])) {
    const { y, color, minH, maxH, litColor = "#ffd77a", litProb = 0.5, skip = 0, dim = "#00000033" } = layer;
    let x = R(-20, 0);
    while (x < W) {
      const w = R(32, 64);
      if (rand() >= skip) {
        const h = R(minH, maxH);
        body.push(`<rect x="${n1(x)}" y="${n1(y - h)}" width="${n1(w)}" height="${n1(h + (H - y))}" fill="${color}"/>`);
        if (litProb > 0 || layer.windows) {
          for (let wy = y - h + 12; wy < y - 10; wy += 15) {
            for (let wx = x + 7; wx < x + w - 9; wx += 12) {
              const lit = rand() < litProb;
              body.push(
                `<rect x="${n1(wx)}" y="${n1(wy)}" width="6" height="9" fill="${lit ? litColor : dim}"${lit ? "" : ' opacity="0.5"'}/>`,
              );
            }
          }
        }
      }
      x += w + R(0, 6);
    }
  }

  if (spec.water) {
    const { y, top, bottom, reflect, waves = 0 } = spec.water;
    defs.push(
      `<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`,
    );
    body.push(`<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="url(#water)"/>`);
    if (reflect) {
      const rows = 10;
      for (let i = 0; i < rows; i++) {
        const w = R(40, 90) * (1 - i * 0.06);
        const ry = y + 6 + (i * (H - y - 10)) / rows;
        body.push(
          `<rect x="${n1(reflect.x - w / 2 + R(-6, 6))}" y="${n1(ry)}" width="${n1(w)}" height="3" rx="1.5" fill="${reflect.color}" opacity="${n1(0.55 - i * 0.045)}"/>`,
        );
      }
    }
    for (let i = 0; i < waves; i++) {
      const wx = R(0, W - 80);
      const wy = R(y + 8, H - 6);
      body.push(
        `<line x1="${n1(wx)}" y1="${n1(wy)}" x2="${n1(wx + R(30, 90))}" y2="${n1(wy)}" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.16"/>`,
      );
    }
  }

  if (spec.ground) {
    const { y, color } = spec.ground;
    body.push(`<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="${color}"/>`);
  }

  if (spec.houses) {
    const { n, y: [y0, y1], wall, roof, lit = false } = spec.houses;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * W) / n + R(-18, 18);
      const y = R(y0, y1);
      const w = R(44, 64);
      const h = R(30, 44);
      const roofH = R(20, 30);
      body.push(`<rect x="${n1(x - w / 2)}" y="${n1(y - h)}" width="${n1(w)}" height="${n1(h)}" fill="${pick(wall)}"/>`);
      body.push(
        `<polygon points="${pts([[x - w / 2 - 5, y - h], [x + w / 2 + 5, y - h], [x, y - h - roofH]])}" fill="${pick(roof)}"/>`,
      );
      body.push(`<rect x="${n1(x - 5)}" y="${n1(y - 19)}" width="10" height="19" fill="#3b2d26"/>`);
      body.push(`<rect x="${n1(x + w / 4)}" y="${n1(y - h + 8)}" width="9" height="9" fill="${lit ? "#ffd77a" : "#a9c4d8"}"/>`);
      body.push(`<rect x="${n1(x - w / 2 + 6)}" y="${n1(y - h + 8)}" width="9" height="9" fill="${lit ? "#ffd77a" : "#a9c4d8"}"/>`);
    }
  }

  if (spec.trees) {
    const { kind, colors, size = [0.8, 1.2], snow = false } = spec.trees;
    let list;
    if (spec.trees.at) {
      list = spec.trees.at.map(([x, y, s]) => ({ x, y, s }));
    } else {
      const [y0, y1] = spec.trees.y;
      list = Array.from({ length: spec.trees.n }, () => {
        const y = R(y0, y1);
        const depth = y1 === y0 ? 1 : 0.6 + (0.4 * (y - y0)) / (y1 - y0);
        return { x: R(-10, W + 10), y, s: R(size[0], size[1]) * depth };
      });
    }
    list.sort((a, b) => a.y - b.y);
    for (const { x, y, s } of list) {
      const c = pick(colors);
      if (kind === "pine") {
        body.push(`<rect x="${n1(x - 2.5 * s)}" y="${n1(y - 12 * s)}" width="${n1(5 * s)}" height="${n1(12 * s)}" fill="#4a3426"/>`);
        for (let t = 0; t < 3; t++) {
          const bw = (36 - t * 7) * s;
          const by = y - (10 + t * 20) * s;
          body.push(`<polygon points="${pts([[x - bw / 2, by], [x + bw / 2, by], [x, by - 30 * s]])}" fill="${c}"/>`);
          if (snow) {
            body.push(
              `<polygon points="${pts([[x - bw * 0.27, by - 14 * s], [x + bw * 0.27, by - 14 * s], [x, by - 30 * s]])}" fill="#fff" opacity="0.92"/>`,
            );
          }
        }
      } else {
        body.push(`<rect x="${n1(x - 3 * s)}" y="${n1(y - 18 * s)}" width="${n1(6 * s)}" height="${n1(18 * s)}" fill="#5a3f2b"/>`);
        body.push(
          `<g fill="${c}"><circle cx="${n1(x)}" cy="${n1(y - 32 * s)}" r="${n1(17 * s)}"/><circle cx="${n1(x - 11 * s)}" cy="${n1(y - 24 * s)}" r="${n1(13 * s)}"/><circle cx="${n1(x + 11 * s)}" cy="${n1(y - 24 * s)}" r="${n1(13 * s)}"/></g>`,
        );
        body.push(`<circle cx="${n1(x - 4 * s)}" cy="${n1(y - 36 * s)}" r="${n1(8 * s)}" fill="#fff" opacity="0.08"/>`);
      }
    }
  }

  if (spec.lighthouse) {
    const { x, y, beam = false } = spec.lighthouse;
    body.push(`<ellipse cx="${x}" cy="${y + 2}" rx="44" ry="11" fill="#4d525a"/>`);
    const half = (t) => 12 - 4 * t;
    body.push(`<polygon points="${pts([[x - 12, y], [x + 12, y], [x + 8, y - 90], [x - 8, y - 90]])}" fill="#f4f4f1"/>`);
    for (const [a, b] of [[0.15, 0.32], [0.5, 0.67]]) {
      body.push(
        `<polygon points="${pts([[x - half(a), y - 90 * a], [x + half(a), y - 90 * a], [x + half(b), y - 90 * b], [x - half(b), y - 90 * b]])}" fill="#c8392f"/>`,
      );
    }
    body.push(`<rect x="${x - 11}" y="${y - 96}" width="22" height="6" fill="#33363d"/>`);
    body.push(`<rect x="${x - 7}" y="${y - 111}" width="14" height="15" fill="#ffe27a"/>`);
    body.push(`<polygon points="${pts([[x - 10, y - 111], [x + 10, y - 111], [x, y - 124]])}" fill="#c8392f"/>`);
    if (beam) {
      defs.push(
        `<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6c0" stop-opacity="0.55"/><stop offset="1" stop-color="#fff6c0" stop-opacity="0"/></linearGradient>`,
      );
      body.push(`<polygon points="${pts([[x + 7, y - 106], [x + 330, y - 150], [x + 330, y - 60]])}" fill="url(#beam)"/>`);
    }
  }

  if (spec.windmill) {
    const { x, y } = spec.windmill;
    body.push(`<polygon points="${pts([[x - 15, y], [x + 15, y], [x + 8, y - 72], [x - 8, y - 72]])}" fill="#eadfc8"/>`);
    body.push(`<polygon points="${pts([[x - 11, y - 72], [x + 11, y - 72], [x, y - 90]])}" fill="#8b5e3c"/>`);
    body.push(`<rect x="${x - 5}" y="${y - 20}" width="10" height="20" fill="#6d4a30"/>`);
    const cx = x;
    const cy = y - 74;
    for (const a of [20, 110, 200, 290]) {
      body.push(
        `<g transform="rotate(${a} ${cx} ${cy})"><rect x="${cx - 2.5}" y="${cy - 58}" width="5" height="58" fill="#8b5e3c"/><rect x="${cx + 2.5}" y="${cy - 56}" width="13" height="34" fill="#f6efe0" opacity="0.95"/></g>`,
      );
    }
    body.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="#6d4a30"/>`);
  }

  if (spec.tent) {
    const { x, y, color } = spec.tent;
    body.push(`<polygon points="${pts([[x - 40, y], [x + 40, y], [x, y - 48]])}" fill="${color}"/>`);
    body.push(`<polygon points="${pts([[x - 10, y], [x + 10, y], [x, y - 28]])}" fill="#1c2233"/>`);
    if (spec.tent.fire) {
      defs.push(
        `<radialGradient id="fire"><stop offset="0" stop-color="#ffb347" stop-opacity="0.7"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`,
      );
      body.push(`<circle cx="${x + 70}" cy="${y - 4}" r="34" fill="url(#fire)"/>`);
      body.push(`<polygon points="${pts([[x + 64, y], [x + 76, y], [x + 70, y - 16]])}" fill="#ff8a1f"/>`);
      body.push(`<polygon points="${pts([[x + 67, y], [x + 73, y], [x + 70, y - 9]])}" fill="#ffe27a"/>`);
    }
  }

  if (spec.boats) {
    const { n, y: [y0, y1] } = spec.boats;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * W) / n + R(-30, 30);
      const y = R(y0, y1);
      const s = 0.7 + (0.5 * (y - y0)) / (y1 - y0 || 1);
      const hull = pick(["#6b4f3a", "#2f4b6b", "#8a3b3b", "#3b6b57"]);
      body.push(`<polygon points="${pts([[x - 20 * s, y], [x + 20 * s, y], [x + 13 * s, y + 9 * s], [x - 13 * s, y + 9 * s]])}" fill="${hull}"/>`);
      body.push(`<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x)}" y2="${n1(y - 40 * s)}" stroke="#4a3b30" stroke-width="2"/>`);
      body.push(`<polygon points="${pts([[x + 2 * s, y - 38 * s], [x + 2 * s, y - 3 * s], [x + 20 * s, y - 3 * s]])}" fill="#fff"/>`);
      body.push(`<polygon points="${pts([[x - 2 * s, y - 32 * s], [x - 2 * s, y - 3 * s], [x - 14 * s, y - 3 * s]])}" fill="#f2ede0"/>`);
    }
  }

  if (spec.flowers) {
    const { n, y: [y0, y1], colors } = spec.flowers;
    for (let i = 0; i < n; i++) {
      const x = R(0, W);
      const y = R(y0, y1);
      const s = 0.7 + (0.6 * (y - y0)) / (y1 - y0 || 1);
      body.push(`<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x)}" y2="${n1(y - 12 * s)}" stroke="#3f8f3a" stroke-width="1.6"/>`);
      body.push(`<circle cx="${n1(x)}" cy="${n1(y - 14 * s)}" r="${n1(4.2 * s)}" fill="${pick(colors)}"/>`);
      body.push(`<circle cx="${n1(x)}" cy="${n1(y - 14 * s)}" r="${n1(1.6 * s)}" fill="#ffe27a"/>`);
    }
  }

  if (spec.grass) {
    const { n, y: [y0, y1], colors, h: [h0, h1] } = spec.grass;
    const blades = [];
    for (let i = 0; i < n; i++) {
      blades.push({ x: R(0, W), y: R(y0, y1) });
    }
    blades.sort((a, b) => a.y - b.y);
    for (const { x, y } of blades) {
      const hh = R(h0, h1) * (0.7 + (0.5 * (y - y0)) / (y1 - y0 || 1));
      body.push(
        `<path d="M${n1(x)},${n1(y)} Q${n1(x + R(-3, 3))},${n1(y - hh * 0.6)} ${n1(x + R(-8, 8))},${n1(y - hh)}" stroke="${pick(colors)}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
      );
    }
  }

  if (spec.tint) {
    body.push(`<rect width="${W}" height="${H}" fill="${spec.tint.color}" opacity="${spec.tint.opacity}"/>`);
  }

  if (spec.fog) {
    defs.push(
      `<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${spec.fogColor ?? "#e6ebf0"}" stop-opacity="0"/><stop offset="0.45" stop-color="${spec.fogColor ?? "#e6ebf0"}" stop-opacity="${spec.fog}"/><stop offset="1" stop-color="${spec.fogColor ?? "#e6ebf0"}" stop-opacity="${n1(spec.fog * 0.85)}"/></linearGradient>`,
    );
    body.push(`<rect y="${H * 0.25}" width="${W}" height="${H * 0.75}" fill="url(#fog)"/>`);
  }

  for (let i = 0; i < (spec.rain ?? 0); i++) {
    const x = R(0, W + 20);
    const y = R(-10, H);
    body.push(
      `<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x - 5)}" y2="${n1(y + 15)}" stroke="#d6e2ee" stroke-width="1.2" opacity="0.55"/>`,
    );
  }

  for (let i = 0; i < (spec.snowfall ?? 0); i++) {
    body.push(`<circle cx="${n1(R(0, W))}" cy="${n1(R(0, H))}" r="${n1(R(1, 2.7))}" fill="#fff" opacity="0.85"/>`);
  }

  if (spec.lightning) {
    const x = spec.lightning.x;
    const bolt = [[0, 0], [-14, 70], [-2, 70], [-18, 150], [16, 52], [3, 52], [14, 0]].map(([dx, dy]) => [x + dx, 30 + dy]);
    body.push(`<polygon points="${pts(bolt)}" fill="#fff9c9" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n` +
    `<!-- Generated for LabelForge by tools/generate-sample-data.mjs. Original artwork, no outside assets. -->\n` +
    `<title>${title}</title>\n<defs>${defs.join("")}<clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath></defs>\n` +
    `<g clip-path="url(#frame)">\n${body.join("\n")}\n</g>\n</svg>\n`
  );
}

// -------------------------------------------------------------- palettes

const SKY = {
  dawn: ["#9fc5e8", "#fde2c8"],
  day: ["#4d9de0", "#cfe9fb"],
  noon: ["#2f86d6", "#bfe3f8"],
  storm: ["#262a3a", "#5d6177"],
  night: ["#050816", "#1a2250"],
  sunset: ["#4b3b7a", "#ff9a5b"],
  dusk: ["#2f3566", "#d98c7b"],
  twilight: ["#3b2a6b", "#e07fb5"],
  snow: ["#c5d3e0", "#f1f4f7"],
  fogGrey: ["#b4bcc4", "#e2e6e9"],
  overcast: ["#8d96a3", "#c3c9d1"],
  golden: ["#f6a54a", "#ffe2a1"],
  desertDay: ["#4fa3e0", "#fbe7b8"],
  sunrise: ["#6b8fd1", "#ffc78f"],
};
const whiteClouds = (n, y = [30, 120]) => ({ n, color: "#fff", opacity: 0.85, y, scale: [0.7, 1.2] });
const darkClouds = (n, y = [10, 130]) => ({ n, color: "#2d3142", opacity: 0.85, y, scale: [1, 1.6] });

// ------------------------------------------------------------ the 25 pairs
//
// `better` says which side matches the description more closely: "A", "B", or
// "tie" (both match about equally). For "A" and "B", `good` is the better
// image and `other` the worse. For "tie", `good` and `other` are two
// variants that match equally well. The text of the job never says which is
// which; `better` is only for whoever prepares or checks the data.

const pairs = [
  {
    description: "a calm morning scene",
    better: "A",
    good: {
      sky: SKY.dawn,
      sun: { x: 470, y: 215, r: 26, color: "#fff0c4" },
      clouds: { n: 3, color: "#fff", opacity: 0.7, y: [40, 110], scale: [0.7, 1.1] },
      hills: [{ color: "#a9c9b0", y: 205, amp: 10 }, { color: "#8fb99a", y: 232, amp: 12 }],
      water: { y: 262, top: "#cfe3f1", bottom: "#a8c8de", reflect: { x: 470, color: "#fff0c4" }, waves: 6 },
      trees: { kind: "round", n: 7, y: [240, 256], colors: ["#6f9f7a", "#7fae88"], size: [0.5, 0.8] },
      fog: 0.25,
    },
    other: {
      sky: SKY.storm,
      clouds: darkClouds(7),
      hills: [{ color: "#2f3b3a", y: 205, amp: 10 }, { color: "#263230", y: 232, amp: 12 }],
      water: { y: 262, top: "#3d4a5c", bottom: "#222b38", waves: 14 },
      rain: 130,
      lightning: { x: 380 },
    },
  },
  {
    description: "a stormy night at sea",
    better: "B",
    good: {
      sky: SKY.storm,
      clouds: darkClouds(8),
      water: { y: 230, top: "#2a3a52", bottom: "#101a2a", waves: 24 },
      boats: { n: 1, y: [262, 280] },
      rain: 150,
      lightning: { x: 300 },
      tint: { color: "#050816", opacity: 0.3 },
    },
    other: {
      sky: SKY.day,
      sun: { x: 330, y: 90, r: 30 },
      clouds: whiteClouds(3),
      water: { y: 230, top: "#3aa0d8", bottom: "#1f78b4", reflect: { x: 330, color: "#fffbe0" }, waves: 8 },
      boats: { n: 2, y: [255, 300] },
    },
  },
  {
    description: "a quiet snowy village",
    better: "A",
    good: {
      sky: SKY.snow,
      clouds: { n: 3, color: "#dfe5ec", opacity: 0.9, y: [30, 100], scale: [1, 1.5] },
      hills: [{ color: "#e8eef3", y: 215, amp: 12 }],
      ground: { y: 255, color: "#f7f9fb" },
      houses: { n: 4, y: [292, 335], wall: ["#8c6a50", "#a07c5d", "#7a5d49"], roof: ["#f2f6f9"], lit: true },
      trees: { kind: "pine", n: 9, y: [262, 345], colors: ["#2f5d50", "#386b5a"], size: [0.7, 1.1], snow: true },
      snowfall: 70,
    },
    other: {
      sky: SKY.day,
      sun: { x: 120, y: 80, r: 28 },
      clouds: whiteClouds(2),
      hills: [{ color: "#7cc46a", y: 215, amp: 12 }],
      ground: { y: 255, color: "#6bbf59" },
      houses: { n: 4, y: [292, 335], wall: ["#e8d3a9", "#f0e0bd", "#d9c39a"], roof: ["#b5483b", "#a33d32"] },
      trees: { kind: "round", n: 9, y: [262, 345], colors: ["#3f8f4a", "#58a85a"], size: [0.8, 1.2] },
    },
  },
  {
    description: "a sunset over the sea",
    better: "B",
    good: {
      sky: SKY.sunset,
      sun: { x: 320, y: 240, r: 40, color: "#ffd27a" },
      clouds: { n: 4, color: "#ffb38a", opacity: 0.75, y: [60, 160], scale: [0.9, 1.4] },
      water: { y: 252, top: "#f08a5d", bottom: "#3b3a73", reflect: { x: 320, color: "#ffd27a" }, waves: 10 },
    },
    other: {
      sky: SKY.noon,
      sun: { x: 320, y: 70, r: 26, color: "#fffbe0" },
      clouds: whiteClouds(2),
      water: { y: 252, top: "#4fb0e8", bottom: "#1f78b4", reflect: { x: 320, color: "#fffbe0" }, waves: 10 },
    },
  },
  {
    description: "a busy city skyline at night",
    better: "A",
    good: {
      sky: SKY.night,
      stars: 60,
      moon: { x: 530, y: 70, r: 22 },
      city: [
        { y: 330, color: "#1d2450", minH: 60, maxH: 150, litProb: 0.22 },
        { y: 360, color: "#121733", minH: 70, maxH: 230, litProb: 0.55 },
      ],
    },
    other: {
      sky: SKY.night,
      stars: 60,
      moon: { x: 530, y: 70, r: 22 },
      city: [{ y: 360, color: "#161a35", minH: 30, maxH: 90, litProb: 0.03, skip: 0.6 }],
    },
  },
  {
    description: "a lone tree on a hill",
    better: "B",
    good: {
      sky: SKY.day,
      sun: { x: 540, y: 70, r: 24 },
      clouds: whiteClouds(3),
      hills: [{ color: "#8cc47a", y: 245, amp: 14 }, { color: "#6fb061", y: 300, amp: 12 }],
      trees: { kind: "round", at: [[330, 262, 2.8]], colors: ["#3f8f4a"] },
    },
    other: {
      sky: SKY.day,
      sun: { x: 540, y: 70, r: 24 },
      clouds: whiteClouds(3),
      hills: [{ color: "#8cc47a", y: 245, amp: 14 }, { color: "#6fb061", y: 300, amp: 12 }],
      trees: { kind: "round", n: 24, y: [240, 330], colors: ["#3f8f4a", "#58a85a", "#2f7a3e"], size: [0.8, 1.2] },
    },
  },
  {
    description: "a foggy pine forest",
    better: "B",
    good: {
      sky: SKY.fogGrey,
      hills: [{ color: "#93a39d", y: 230, amp: 10 }],
      ground: { y: 270, color: "#7d8f86" },
      trees: { kind: "pine", n: 26, y: [255, 365], colors: ["#2b4a42", "#33574d", "#243f38"], size: [0.8, 1.3] },
      fog: 0.7,
    },
    other: {
      sky: SKY.day,
      sun: { x: 480, y: 80, r: 26 },
      hills: [{ color: "#6fa07f", y: 230, amp: 10 }],
      ground: { y: 270, color: "#5f8f6d" },
      trees: { kind: "pine", n: 26, y: [255, 365], colors: ["#2b4a42", "#33574d", "#243f38"], size: [0.8, 1.3] },
    },
  },
  {
    description: "a starry night over a desert",
    better: "A",
    good: {
      sky: SKY.night,
      stars: 150,
      moon: { x: 470, y: 80, r: 20 },
      hills: [
        { color: "#c79a5b", y: 262, amp: 18, period: 120 },
        { color: "#a97b44", y: 312, amp: 20, period: 140 },
        { color: "#8a5f33", y: 362, amp: 14, period: 110 },
      ],
      tint: { color: "#0a1030", opacity: 0.45 },
    },
    other: {
      sky: SKY.desertDay,
      sun: { x: 320, y: 60, r: 34 },
      hills: [
        { color: "#f0c27a", y: 262, amp: 18, period: 120 },
        { color: "#e2a95a", y: 312, amp: 20, period: 140 },
        { color: "#d09040", y: 362, amp: 14, period: 110 },
      ],
    },
  },
  {
    description: "a rainy day in the city",
    better: "B",
    good: {
      sky: SKY.overcast,
      clouds: { n: 6, color: "#59606d", opacity: 0.85, y: [10, 110], scale: [1.1, 1.7] },
      city: [
        { y: 330, color: "#7c8794", minH: 60, maxH: 150, litProb: 0.15, litColor: "#ffe3a0" },
        { y: 360, color: "#505a66", minH: 80, maxH: 220, litProb: 0.35, litColor: "#ffe3a0" },
      ],
      tint: { color: "#1a2433", opacity: 0.15 },
      rain: 190,
    },
    other: {
      sky: SKY.noon,
      sun: { x: 120, y: 70, r: 28 },
      clouds: whiteClouds(2),
      city: [
        { y: 330, color: "#a3b6c9", minH: 60, maxH: 150, litProb: 0, windows: true, dim: "#7e93a8" },
        { y: 360, color: "#8aa0b6", minH: 80, maxH: 220, litProb: 0, windows: true, dim: "#6d869d" },
      ],
    },
  },
  {
    description: "a mountain lake at midday",
    better: "A",
    good: {
      sky: SKY.noon,
      sun: { x: 140, y: 70, r: 24 },
      clouds: whiteClouds(3),
      mountains: { color: "#6b7f99", base: 250, h: 160, count: 5, snow: true },
      hills: [{ color: "#4f7d5b", y: 238, amp: 8 }],
      water: { y: 262, top: "#4aa3d8", bottom: "#2a6f9e", waves: 8 },
      trees: { kind: "pine", n: 10, y: [255, 264], colors: ["#245b43", "#2d6b4f"], size: [0.6, 0.9] },
    },
    other: {
      sky: SKY.dusk,
      mountains: { color: "#2b2f4d", base: 250, h: 160, count: 5 },
      hills: [{ color: "#1f2b34", y: 238, amp: 8 }],
      water: { y: 262, top: "#3a3f66", bottom: "#161a33", waves: 8 },
      trees: { kind: "pine", n: 10, y: [255, 264], colors: ["#16241f", "#1b2d27"], size: [0.6, 0.9] },
    },
  },
  {
    description: "an autumn forest",
    better: "B",
    good: {
      sky: ["#9ec3dd", "#f6e3c3"],
      hills: [{ color: "#c08a3e", y: 232, amp: 10 }],
      ground: { y: 268, color: "#a8742f" },
      trees: { kind: "round", n: 24, y: [252, 360], colors: ["#d9742c", "#e8a33b", "#b8472a", "#c9852f"], size: [0.9, 1.5] },
    },
    other: {
      sky: ["#9ec3dd", "#f6e3c3"],
      hills: [{ color: "#6fa86a", y: 232, amp: 10 }],
      ground: { y: 268, color: "#5e9a55" },
      trees: { kind: "round", n: 24, y: [252, 360], colors: ["#3f8f4a", "#5aa95a", "#2f7a3e"], size: [0.9, 1.5] },
    },
  },
  {
    description: "a sunny beach",
    better: "tie",
    good: {
      sky: SKY.noon,
      sun: { x: 500, y: 70, r: 28 },
      clouds: whiteClouds(2, [40, 110]),
      water: { y: 215, top: "#37b6d6", bottom: "#1f8fb8", waves: 14 },
      ground: { y: 300, color: "#f1dfae" },
      boats: { n: 2, y: [232, 250] },
    },
    other: {
      sky: SKY.noon,
      sun: { x: 150, y: 75, r: 28 },
      clouds: whiteClouds(3, [40, 110]),
      water: { y: 215, top: "#3ac0dc", bottom: "#2294bd", waves: 14 },
      ground: { y: 305, color: "#f4e3b5" },
      boats: { n: 3, y: [232, 252] },
    },
  },
  {
    description: "a field of tall grass at golden hour",
    better: "B",
    good: {
      sky: SKY.golden,
      sun: { x: 200, y: 200, r: 34, color: "#fff0b0" },
      hills: [{ color: "#c9a24c", y: 232, amp: 10 }],
      ground: { y: 252, color: "#b88a35" },
      grass: { n: 460, y: [252, 400], colors: ["#d9b04a", "#c8923a", "#e8c365"], h: [18, 46] },
    },
    other: {
      sky: SKY.night,
      stars: 90,
      moon: { x: 460, y: 70, r: 20 },
      hills: [{ color: "#1d2a24", y: 232, amp: 10 }],
      ground: { y: 252, color: "#17211c" },
      grass: { n: 460, y: [252, 400], colors: ["#2b3a2f", "#25322a", "#33463a"], h: [18, 46] },
    },
  },
  {
    description: "a calm sea under a full moon",
    better: "A",
    good: {
      sky: SKY.night,
      stars: 80,
      moon: { x: 380, y: 90, r: 44 },
      clouds: { n: 2, color: "#3a4572", opacity: 0.5, y: [40, 120], scale: [1, 1.4] },
      water: { y: 232, top: "#2a3d66", bottom: "#0b1226", reflect: { x: 380, color: "#f6f3e4" }, waves: 10 },
    },
    other: {
      sky: ["#1a1f33", "#2c3347"],
      clouds: { n: 7, color: "#1f2535", opacity: 0.9, y: [10, 140], scale: [1.1, 1.7] },
      water: { y: 232, top: "#262f44", bottom: "#0d111c", waves: 10 },
    },
  },
  {
    description: "a village in a valley under heavy clouds",
    better: "tie",
    good: {
      sky: SKY.overcast,
      clouds: { n: 8, color: "#59606d", opacity: 0.85, y: [10, 130], scale: [1.1, 1.8] },
      mountains: { color: "#5f6b78", base: 235, h: 100, count: 5 },
      hills: [{ color: "#6f8a6a", y: 252, amp: 10 }],
      ground: { y: 285, color: "#6a8566" },
      houses: { n: 5, y: [300, 340], wall: ["#d9c9a8", "#c8b48e", "#e0d3b4"], roof: ["#8a4b3c", "#7a4034"] },
      trees: { kind: "round", n: 8, y: [275, 350], colors: ["#4a7a4f", "#3d6b45"], size: [0.7, 1] },
    },
    other: {
      sky: SKY.overcast,
      clouds: { n: 9, color: "#5d6471", opacity: 0.85, y: [10, 130], scale: [1.1, 1.8] },
      mountains: { color: "#626e7b", base: 235, h: 95, count: 6 },
      hills: [{ color: "#718c6c", y: 252, amp: 10 }],
      ground: { y: 285, color: "#6c8768" },
      houses: { n: 6, y: [300, 340], wall: ["#d9c9a8", "#c8b48e", "#e0d3b4"], roof: ["#8a4b3c", "#7a4034"] },
      trees: { kind: "round", n: 10, y: [275, 350], colors: ["#4a7a4f", "#3d6b45"], size: [0.7, 1] },
    },
  },
  {
    description: "a spring meadow with flowers",
    better: "A",
    good: {
      sky: SKY.day,
      sun: { x: 520, y: 70, r: 26 },
      clouds: whiteClouds(3),
      hills: [{ color: "#9bd37a", y: 220, amp: 14 }],
      ground: { y: 262, color: "#7fc65a" },
      flowers: { n: 110, y: [270, 392], colors: ["#ff6b8b", "#ffd23f", "#ffffff", "#b388eb"] },
      grass: { n: 160, y: [262, 400], colors: ["#5fae45", "#6dbb4d"], h: [8, 20] },
    },
    other: {
      sky: SKY.overcast,
      clouds: { n: 5, color: "#8a929d", opacity: 0.8, y: [20, 120], scale: [1, 1.5] },
      hills: [{ color: "#8f7c5a", y: 220, amp: 14 }],
      ground: { y: 262, color: "#7a6347" },
      grass: { n: 60, y: [262, 400], colors: ["#9a8a5e", "#8c7c52"], h: [6, 14] },
    },
  },
  {
    description: "a snowy mountain peak at sunrise",
    better: "B",
    good: {
      sky: SKY.sunrise,
      sun: { x: 360, y: 205, r: 30, color: "#ffe2a8" },
      mountains: { color: "#7d8fb5", base: 320, h: 250, count: 4, snow: true },
      ground: { y: 345, color: "#eef3fb" },
    },
    other: {
      sky: SKY.noon,
      clouds: whiteClouds(2),
      mountains: { color: "#8a7a6a", base: 320, h: 200, count: 5 },
      ground: { y: 345, color: "#9c8a6c" },
    },
  },
  {
    description: "a peaceful harbor with boats",
    better: "A",
    good: {
      sky: SKY.day,
      sun: { x: 500, y: 75, r: 26 },
      clouds: whiteClouds(2),
      hills: [{ color: "#7aa58b", y: 205, amp: 8 }],
      houses: { n: 7, y: [226, 232], wall: ["#f2e6d0", "#e9d3b8", "#d8e4ee"], roof: ["#b5483b", "#4f6d8a"] },
      water: { y: 232, top: "#4aa8d6", bottom: "#2a7aa8", waves: 12 },
      boats: { n: 6, y: [255, 345] },
      ground: { y: 372, color: "#8b6b4a" },
    },
    other: {
      sky: SKY.storm,
      clouds: darkClouds(6),
      hills: [{ color: "#2f3b3a", y: 205, amp: 8 }],
      water: { y: 232, top: "#3d4a5c", bottom: "#222b38", waves: 20 },
      ground: { y: 372, color: "#4b4033" },
      rain: 120,
    },
  },
  {
    description: "a lighthouse on a stormy coast",
    better: "B",
    good: {
      sky: SKY.storm,
      clouds: darkClouds(8),
      water: { y: 255, top: "#2d4059", bottom: "#101c2c", waves: 24 },
      ground: { y: 320, color: "#3b3f46" },
      lighthouse: { x: 430, y: 322, beam: true },
      rain: 120,
      lightning: { x: 150 },
    },
    other: {
      sky: SKY.day,
      sun: { x: 150, y: 80, r: 28 },
      clouds: whiteClouds(2),
      water: { y: 255, top: "#3aa0d8", bottom: "#1f78b4", waves: 8 },
      ground: { y: 320, color: "#8a8f94" },
      lighthouse: { x: 430, y: 322 },
    },
  },
  {
    description: "a campsite under the stars",
    better: "A",
    good: {
      sky: SKY.night,
      stars: 140,
      hills: [{ color: "#1b2a3a", y: 262, amp: 14 }, { color: "#142030", y: 300, amp: 10 }],
      ground: { y: 322, color: "#10202c" },
      trees: { kind: "pine", n: 12, y: [270, 330], colors: ["#0f2a26", "#12322d"], size: [0.8, 1.2] },
      tent: { x: 290, y: 345, color: "#e07a3a", fire: true },
    },
    other: {
      sky: SKY.day,
      sun: { x: 500, y: 75, r: 26 },
      clouds: whiteClouds(3),
      hills: [{ color: "#79b56a", y: 262, amp: 14 }, { color: "#62a05a", y: 300, amp: 10 }],
      ground: { y: 322, color: "#4f9a4a" },
      trees: { kind: "pine", n: 12, y: [270, 330], colors: ["#2f6b45", "#37784e"], size: [0.8, 1.2] },
      tent: { x: 290, y: 345, color: "#e07a3a" },
    },
  },
  {
    description: "a windmill on green hills",
    better: "B",
    good: {
      sky: SKY.day,
      sun: { x: 540, y: 70, r: 24 },
      clouds: whiteClouds(3),
      hills: [{ color: "#8cc47a", y: 245, amp: 14 }, { color: "#6fb061", y: 295, amp: 12 }],
      windmill: { x: 330, y: 288 },
    },
    other: {
      sky: SKY.day,
      sun: { x: 540, y: 70, r: 24 },
      clouds: whiteClouds(3),
      hills: [{ color: "#8cc47a", y: 245, amp: 14 }, { color: "#6fb061", y: 295, amp: 12 }],
      trees: { kind: "round", n: 5, y: [265, 320], colors: ["#3f8f4a", "#58a85a"], size: [0.8, 1.1] },
    },
  },
  {
    description: "a desert at noon",
    better: "A",
    good: {
      sky: SKY.desertDay,
      sun: { x: 320, y: 55, r: 34, color: "#fffbe0" },
      hills: [
        { color: "#f0c27a", y: 240, amp: 16, period: 120 },
        { color: "#e2a95a", y: 300, amp: 20, period: 140 },
        { color: "#d09040", y: 360, amp: 14, period: 110 },
      ],
    },
    other: {
      sky: SKY.sunset,
      sun: { x: 180, y: 232, r: 38, color: "#ffd27a" },
      hills: [
        { color: "#c98a5a", y: 240, amp: 16, period: 120 },
        { color: "#a96a45", y: 300, amp: 20, period: 140 },
        { color: "#7e4b33", y: 360, amp: 14, period: 110 },
      ],
    },
  },
  {
    description: "a purple twilight sky over a lake",
    better: "tie",
    good: {
      sky: SKY.twilight,
      stars: 25,
      hills: [{ color: "#2a1f4a", y: 235, amp: 12 }],
      water: { y: 258, top: "#7a4f9a", bottom: "#2b1f4a", reflect: { x: 330, color: "#f2a6d0" }, waves: 8 },
      clouds: { n: 3, color: "#c47ab8", opacity: 0.55, y: [50, 140], scale: [1, 1.5] },
    },
    other: {
      sky: ["#3f2d70", "#e585b9"],
      stars: 30,
      hills: [{ color: "#2d2150", y: 238, amp: 12 }],
      water: { y: 258, top: "#7d52a0", bottom: "#2d2150", reflect: { x: 290, color: "#f2a6d0" }, waves: 8 },
      clouds: { n: 4, color: "#c47ab8", opacity: 0.55, y: [50, 140], scale: [1, 1.5] },
    },
  },
  {
    description: "a winter forest with falling snow",
    better: "tie",
    good: {
      sky: SKY.snow,
      hills: [{ color: "#e3eaf0", y: 230, amp: 10 }],
      ground: { y: 262, color: "#f7f9fb" },
      trees: { kind: "pine", n: 30, y: [255, 365], colors: ["#2f5d50", "#386b5a", "#2a5246"], size: [0.8, 1.3], snow: true },
      snowfall: 120,
    },
    other: {
      sky: SKY.snow,
      hills: [{ color: "#e3eaf0", y: 232, amp: 10 }],
      ground: { y: 262, color: "#f5f8fa" },
      trees: { kind: "pine", n: 26, y: [255, 365], colors: ["#2f5d50", "#386b5a", "#2a5246"], size: [0.8, 1.3], snow: true },
      snowfall: 95,
    },
  },
  {
    description: "a city in the rain at dusk",
    better: "tie",
    good: {
      sky: SKY.dusk,
      clouds: { n: 5, color: "#4a4f73", opacity: 0.7, y: [10, 120], scale: [1.1, 1.7] },
      city: [
        { y: 330, color: "#2a2f55", minH: 60, maxH: 150, litProb: 0.3 },
        { y: 345, color: "#1b2040", minH: 90, maxH: 210, litProb: 0.5 },
      ],
      ground: { y: 345, color: "#232838" },
      rain: 170,
    },
    other: {
      sky: SKY.dusk,
      clouds: { n: 6, color: "#4a4f73", opacity: 0.7, y: [10, 120], scale: [1.1, 1.7] },
      city: [
        { y: 330, color: "#2c3158", minH: 60, maxH: 150, litProb: 0.3 },
        { y: 345, color: "#1d2243", minH: 90, maxH: 200, litProb: 0.45 },
      ],
      ground: { y: 345, color: "#262b3b" },
      rain: 150,
    },
  },
];

// ----------------------------------------------------------------- output

const imageDir = join(appDir, "public", "images");
const dataDir = join(appDir, "data");
mkdirSync(imageDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

const tasks = [];
const intended = [];
pairs.forEach((pair, i) => {
  const num = String(i + 1).padStart(2, "0");
  const id = `ip-${num}`;
  const goodOnA = pair.better !== "B";
  const specA = goodOnA ? pair.good : pair.other;
  const specB = goodOnA ? pair.other : pair.good;
  writeFileSync(join(imageDir, `${id}-a.svg`), renderScene(specA, (i + 1) * 1000 + 1, `${id} image A`));
  writeFileSync(join(imageDir, `${id}-b.svg`), renderScene(specB, (i + 1) * 1000 + 2, `${id} image B`));
  tasks.push({
    id,
    type: "image-preference",
    payload: {
      instruction: `Pick the image that better matches: ${pair.description}`,
      imageA: `images/${id}-a.svg`,
      imageB: `images/${id}-b.svg`,
    },
  });
  intended.push([id, pair.description, pair.better]);
});

writeFileSync(join(dataDir, "sample-tasks.json"), JSON.stringify(tasks, null, 2) + "\n");

console.log(`Wrote ${pairs.length} pairs (${pairs.length * 2} images) and data/sample-tasks.json`);
console.log("\nid     intended  description");
for (const [id, d, b] of intended) console.log(`${id}  ${b.padEnd(8)}  ${d}`);
