// Desktop wrapper: opens the built game (dist/) in a native window.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

// no menu bar, which also drops the default Ctrl+W / Ctrl+R shortcuts so Ctrl stays free for crouch
Menu.setApplicationMenu(null);

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    title: 'Kinetic', backgroundColor: '#05060c', show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
