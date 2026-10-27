// Desktop wrapper: opens the built game (dist/) in a native window.
const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// no menu bar, which also drops the default Ctrl+W / Ctrl+R shortcuts so Ctrl stays free for crouch
Menu.setApplicationMenu(null);

// display mode survives restarts in a small json file in the app's data folder
const MODES = ['fullscreen', 'borderless', 'windowed'];
const prefsFile = () => path.join(app.getPath('userData'), 'display.json');
function loadMode() {
  try { const m = JSON.parse(fs.readFileSync(prefsFile(), 'utf8')).mode; return MODES.includes(m) ? m : 'windowed'; } catch (e) { return 'windowed'; }
}
function saveMode(m) { try { fs.writeFileSync(prefsFile(), JSON.stringify({ mode: m })); } catch (e) {} }

let win = null, mode = 'windowed';

// a window's frame can't be added or removed after it's created, so borderless gets its own frameless window
function createWindow(display) {
  const area = (display || screen.getPrimaryDisplay()).bounds;
  const w = new BrowserWindow({
    ...(mode === 'borderless'
      ? { x: area.x, y: area.y, width: area.width, height: area.height, frame: false, resizable: false, maximizable: false }
      : { width: 1600, height: 900, minWidth: 960, minHeight: 540 }),
    fullscreen: mode === 'fullscreen',
    title: 'Kinetic', backgroundColor: '#05060c', show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  w.once('ready-to-show', () => {
    if (mode === 'windowed') w.maximize();
    w.show();
    // Windows shrinks new windows to stop above the taskbar; size it again once shown so borderless covers the whole screen
    if (mode === 'borderless') w.setBounds(area);
  });
  w.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return w;
}

ipcMain.handle('display:get', () => mode);
ipcMain.handle('display:set', (_e, next) => {
  if (!MODES.includes(next) || next === mode) return mode;
  const prev = mode;
  mode = next; saveMode(mode);
  if ((prev === 'borderless') === (next === 'borderless')) {
    // fullscreen <-> windowed happens in place
    if (next === 'windowed') win.once('leave-full-screen', () => win.maximize());
    win.setFullScreen(next === 'fullscreen');
    return mode;
  }
  // to or from borderless: open a replacement window on the same screen, then close the old one (the game reloads to the menu)
  const old = win;
  win = createWindow(screen.getDisplayMatching(old.getBounds()));
  win.once('ready-to-show', () => old.destroy());
  return mode;
});

app.whenReady().then(() => { mode = loadMode(); win = createWindow(); });
app.on('window-all-closed', () => app.quit());
