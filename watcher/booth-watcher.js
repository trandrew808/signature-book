#!/usr/bin/env node
/**
 * Photo Lounge booth watcher — runs on the editing laptop during the event.
 * Watches the Lightroom export folder and posts every new JPEG to the app,
 * which stores it and puts it on the iPad within seconds.
 *
 * One-time setup (in this project folder):   npm install
 * Each event:
 *   BOOTH_URL=https://book.photoloungehawaii.com BOOTH_EVENT=smith-2026-11-14 BOOTH_PIN=2468 npm run watcher
 * Optional: BOOTH_FOLDER="/Users/you/Pictures/Booth Export"   (default: ~/Pictures/Booth Export)
 *
 * Lightroom export preset: JPEG, 2500px long edge, quality 85, no subfolder, destination = BOOTH_FOLDER.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const chokidar = require("chokidar");

const BOOTH_URL = (process.env.BOOTH_URL || "").replace(/\/$/, "");
const EVENT = process.env.BOOTH_EVENT;
const PIN = process.env.BOOTH_PIN;
const FOLDER = process.env.BOOTH_FOLDER || path.join(os.homedir(), "Pictures", "Booth Export");

if (!BOOTH_URL || !EVENT || !PIN) {
  console.error("Set BOOTH_URL, BOOTH_EVENT and BOOTH_PIN first. Example:\n  BOOTH_URL=https://your-app.vercel.app BOOTH_EVENT=demo BOOTH_PIN=2468 npm run watcher");
  process.exit(1);
}
fs.mkdirSync(FOLDER, { recursive: true });

const seen = new Set();
const mime = (n) => (/\.png$/i.test(n) ? "image/png" : /\.webp$/i.test(n) ? "image/webp" : "image/jpeg");

async function upload(file) {
  const name = path.basename(file);
  if (seen.has(name) || !/\.(jpe?g|png|webp)$/i.test(name) || name.startsWith(".")) return;
  seen.add(name);
  try {
    const fd = new FormData();
    fd.append("slug", EVENT); fd.append("pin", PIN); fd.append("kind", "photo");
    fd.append("file", new Blob([fs.readFileSync(file)], { type: mime(name) }), name);
    const r = await fetch(`${BOOTH_URL}/api/upload`, { method: "POST", body: fd });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    console.log(new Date().toLocaleTimeString(), "✓", name);
  } catch (e) {
    seen.delete(name);
    console.error(new Date().toLocaleTimeString(), "✗", name, e.message || e);
    setTimeout(() => upload(file), 5000); // retry once wifi comes back
  }
}

console.log(`Watching ${FOLDER}\n→ ${BOOTH_URL}/${EVENT}`);
chokidar
  .watch(FOLDER, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 } })
  .on("add", upload);
