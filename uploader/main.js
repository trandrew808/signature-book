// Booth Uploader — menu-bar app for the editing Mac.
// Watches a folder; every new JPEG is posted to the Signature Book for the chosen event.
const { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain, dialog, shell, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const chokidar = require("chokidar");
const Store = require("electron-store");

const store = new Store({
  defaults: { baseUrl: "", slug: "", pin: "", eventTitle: "", folder: path.join(os.homedir(), "Pictures", "Booth Export"), launchAtLogin: false },
});

let tray = null, win = null, watcher = null;
const state = { watching: false, uploaded: 0, failed: [], last: "", queue: [], busy: false, seen: new Set(), paused: false };

// ---------- helpers ----------
const icon = (name) => nativeImage.createFromPath(path.join(__dirname, name));
const notify = (title, body) => { try { new Notification({ title, body, silent: true }).show(); } catch {} };
const apiBase = () => store.get("baseUrl").replace(/\/$/, "");
const eventFolder = () => store.get("folder"); // the exact folder the editor picked

/** Accept a pasted editor link like https://book.photoloungehawaii.com/sarah-and-kai-2026-11-14/upload */
function parseEditorLink(text) {
  try {
    const u = new URL(text.trim());
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = parts[0];
    if (!slug || slug === "admin") return null;
    return { baseUrl: `${u.protocol}//${u.host}`, slug };
  } catch { return null; }
}

async function verify(baseUrl, slug, pin) {
  const r = await fetch(`${baseUrl}/api/upload`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, pin, dry: true }) });
  if (r.status === 404) throw new Error("No event at that link.");
  if (r.status === 403) throw new Error("Wrong PIN for this event.");
  if (!r.ok) throw new Error(`Server said ${r.status}.`);
  return true;
}

// ---------- upload queue ----------
const mime = (n) => (/\.png$/i.test(n) ? "image/png" : /\.webp$/i.test(n) ? "image/webp" : "image/jpeg");

async function uploadOne(file) {
  const name = path.basename(file);
  const bytes = fs.readFileSync(file);
  const fd = new FormData();
  fd.append("slug", store.get("slug")); fd.append("pin", store.get("pin")); fd.append("kind", "photo");
  fd.append("file", new Blob([bytes], { type: mime(name) }), name);
  const r = await fetch(`${apiBase()}/api/upload`, { method: "POST", body: fd });
  if (!r.ok) { let msg = `HTTP ${r.status}`; try { msg = (await r.json()).error || msg; } catch {} throw new Error(msg); }
}

async function drain() {
  if (state.busy || state.paused) return;
  state.busy = true;
  while (state.queue.length && !state.paused) {
    const { file, tries } = state.queue.shift();
    try {
      await uploadOne(file);
      state.uploaded++; state.last = path.basename(file);
      state.failed = state.failed.filter((f) => f.file !== file);
    } catch (e) {
      if (tries < 5) {
        // back off and retry: venue wifi hiccups are normal
        setTimeout(() => { state.queue.push({ file, tries: tries + 1 }); drain(); }, 4000 * (tries + 1));
      } else {
        state.failed.push({ file, error: e.message });
        notify("Upload failed", `${path.basename(file)}: ${e.message}`);
      }
    }
    refreshMenu();
  }
  state.busy = false;
}

function enqueue(file) {
  if (!/\.(jpe?g|png|webp)$/i.test(file) || path.basename(file).startsWith(".")) return;
  if (state.seen.has(file)) return;
  state.seen.add(file);
  state.queue.push({ file, tries: 0 });
  refreshMenu(); drain();
}

// ---------- watcher ----------
function startWatching() {
  stopWatching();
  if (!store.get("slug") || !store.get("pin") || !store.get("baseUrl")) return;
  const dir = eventFolder();
  fs.mkdirSync(dir, { recursive: true });
  watcher = chokidar.watch(dir, { ignoreInitial: true, depth: 0, awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 } });
  watcher.on("add", enqueue);
  state.watching = true; state.uploaded = 0; state.failed = []; state.last = ""; state.seen.clear();
  refreshMenu();
}
function stopWatching() { if (watcher) { watcher.close(); watcher = null; } state.watching = false; refreshMenu(); }

// ---------- tray menu ----------
function refreshMenu() {
  if (!tray) return;
  const slug = store.get("slug"), title = store.get("eventTitle") || slug || "No event";
  const status = !slug ? "Set up an event to start" : state.paused ? "Paused" : state.watching ? "Watching for exports" : "Not watching";
  const items = [
    { label: title, enabled: false },
    { label: status, enabled: false },
    { type: "separator" },
    { label: `Uploaded tonight: ${state.uploaded}`, enabled: false },
    { label: state.queue.length ? `In queue: ${state.queue.length}` : "Queue empty", enabled: false },
    ...(state.last ? [{ label: `Last: ${state.last}`, enabled: false }] : []),
    ...(state.failed.length ? [
      { type: "separator" },
      { label: `${state.failed.length} failed`, enabled: false },
      { label: "Retry failed", click: () => { const f = state.failed.splice(0); for (const x of f) { state.seen.delete(x.file); enqueue(x.file); } } },
    ] : []),
    { type: "separator" },
    { label: state.paused ? "Resume uploads" : "Pause uploads", enabled: !!slug, click: () => { state.paused = !state.paused; refreshMenu(); if (!state.paused) drain(); } },
    { label: "Open watch folder", enabled: !!slug, click: () => { fs.mkdirSync(eventFolder(), { recursive: true }); shell.openPath(eventFolder()); } },
    { label: "Open editor page", enabled: !!slug, click: () => shell.openExternal(`${apiBase()}/${slug}/upload`) },
    { type: "separator" },
    { label: slug ? "Change event…" : "Set up event…", click: openSetup },
    { label: "Launch at login", type: "checkbox", checked: store.get("launchAtLogin"), click: (m) => { store.set("launchAtLogin", m.checked); app.setLoginItemSettings({ openAtLogin: m.checked }); } },
    { type: "separator" },
    { label: "Quit Booth Uploader", click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(`Booth Uploader — ${title} — ${status}`);
  tray.setImage(icon(state.watching && !state.paused ? "trayTemplate.png" : "trayOffTemplate.png"));
}

// ---------- setup window ----------
function openSetup() {
  if (win) { win.focus(); return; }
  win = new BrowserWindow({ width: 460, height: 520, resizable: false, title: "Booth Uploader", show: false, webPreferences: { preload: path.join(__dirname, "preload.js") } });
  win.loadFile("setup.html");
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => { win = null; });
}
ipcMain.handle("settings:get", () => ({ ...store.store, eventFolder: eventFolder() }));
ipcMain.handle("settings:pickFolder", async () => { const r = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] }); return r.canceled ? null : r.filePaths[0]; });
ipcMain.handle("settings:save", async (_e, { link, pin, folder, title }) => {
  const parsed = parseEditorLink(link);
  if (!parsed) return { ok: false, error: "Paste the editor link from the admin page (it ends in /upload)." };
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "The PIN is 4 to 8 digits." };
  try { await verify(parsed.baseUrl, parsed.slug, pin); } catch (e) { return { ok: false, error: e.message }; }
  store.set({ baseUrl: parsed.baseUrl, slug: parsed.slug, pin, folder, eventTitle: title || parsed.slug });
  startWatching();
  notify("Booth Uploader", `Watching ${eventFolder()}`);
  return { ok: true, eventFolder: eventFolder() };
});
ipcMain.handle("settings:openFolder", () => { fs.mkdirSync(eventFolder(), { recursive: true }); shell.openPath(eventFolder()); });

// ---------- app ----------
app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock.hide();
  tray = new Tray(icon("trayOffTemplate.png"));
  tray.on("click", () => tray.popUpContextMenu());
  refreshMenu();
  if (store.get("slug") && store.get("pin")) startWatching(); else openSetup();
});
app.on("window-all-closed", (e) => e.preventDefault());
