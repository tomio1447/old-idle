/* Regressão: pose montada (zPattern=1) + composição OTC com a montaria. */
"use strict";
const fs = require("fs");
const path = require("path");

function must(ok, msg) { if (!ok) throw Error(msg); }

function pngSize(file) {
  const buf = fs.readFileSync(file);
  must(buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG", "não é PNG: " + file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
const appearanceSrc = fs.readFileSync(path.join(js, "appearance.js"), "utf8");
const preloadSrc = fs.readFileSync(path.join(js, "preload.js"), "utf8");
const dataSrc = fs.readFileSync(path.join(js, "appearancedata.js"), "utf8");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");

must(appearanceSrc.includes("opts.mounted") &&
  appearanceSrc.includes('assetMode = wantMounted ? ".mounted"') &&
  appearanceSrc.includes("mnt ? { mounted: true } : null") &&
  appearanceSrc.includes("bodyX = fullW - ca.sw + ca.ox - mdx") &&
  !/const subir = o\.dy/.test(appearanceSrc),
  "renderer não usa zPattern montado / âncora OTC");

must(html.includes("js/appearance.js?v=mount-zpattern-v1") &&
  html.includes("js/appearancedata.js?v=mount-zpattern-v1") &&
  html.includes("js/preload.js?v=mount-zpattern-v1"),
  "cache-bust de mount/zPattern ausente");

must(preloadSrc.includes(".mounted.base.png"),
  "preload não pede sheets .mounted");

const appearances = JSON.parse(dataSrc.slice(dataSrc.indexOf("{"), dataSrc.lastIndexOf("}") + 1));
const citizen = appearances.outfits.find((o) => o.id === "citizen-m");
must(citizen && citizen.mounted && citizen.mounted.cw > 0,
  "citizen-m sem meta mounted");
must(citizen.mounted.oy < citizen.oy || citizen.mounted.ch !== citizen.ch,
  "geometria mounted deveria diferir da pose a pe");

const mountedPath = path.join(game, "assets", "appearance", "outfit", "citizen-m.mounted.base.png");
const standPath = path.join(game, "assets", "appearance", "outfit", "citizen-m.base.png");
must(fs.existsSync(mountedPath) && fs.existsSync(standPath), "sheets mounted/base ausentes");

const mounted = pngSize(mountedPath);
const stand = pngSize(standPath);
must(mounted.w === citizen.mounted.cw * citizen.mounted.cols &&
  mounted.h === citizen.mounted.ch * citizen.mounted.rows,
  "geometria do sheet mounted diverge do appearancedata");
must(stand.w === citizen.cw * citizen.cols &&
  stand.h === citizen.ch * citizen.rows,
  "geometria do sheet a pe diverge");
must(mounted.w !== stand.w || mounted.h !== stand.h,
  "sheet mounted idêntico ao a pe");

const flame = appearances.mounts.find((m) => m.id === "flamesteed");
must(flame && flame.looktype === 626,
  "flamesteed (mount do screenshot) ausente no catálogo");

const withMounted = appearances.outfits.filter((o) => o.mounted && o.mounted.cw).length;
must(withMounted >= 200, "poucas outfits com sheet mounted: " + withMounted);

console.log("OK: mount zPattern=1 (citizen-m + flamesteed) e composição OTC.");
