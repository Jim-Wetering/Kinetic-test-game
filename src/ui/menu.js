import { load, save, fmt } from '../utils.js';
import { game, look, settings } from '../state.js';
import { renderer } from '../render/scene.js';
import { LEVELS, loadLevel } from '../world/levels.js';
import { initAudio } from '../audio.js';
import { restart, setState } from '../game.js';

// ---------------------------------------------------------------- level select, buttons, settings
// window controls from electron/preload.cjs; undefined when the game runs in a browser
const desktop = window.kineticDesktop;

export function renderLevels() {
  const el = document.getElementById('levels');
  el.innerHTML = LEVELS.map((L, i) => `<button class="lvl${i === game.selected ? ' sel' : ''}" data-i="${i}">
    <span class="n">LEVEL ${i + 1}</span><span class="t">${L.name}</span><span class="d">${L.blurb}</span>
    <span class="b">BEST ${fmt(load('best.' + L.id, null))}</span></button>`).join('');
  const resume = game.state === 'paused' && game.selected === game.levelIdx;
  document.getElementById('go').textContent = resume ? 'RESUME' : 'RUN ' + LEVELS[game.selected].name.toUpperCase();
}
function startSelected() {
  if (game.selected !== game.levelIdx) { loadLevel(game.selected); restart(); }
  else if (game.state !== 'paused') restart();
  lockAndPlay();
}
export function lockAndPlay() {
  initAudio();
  try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  // Ctrl is crouch: Ctrl+W would close the tab, which only the Keyboard Lock API (fullscreen, Chromium) can stop.
  // the desktop app has no Ctrl+W and its own display mode setting, so it skips this
  try {
    const kb = navigator.keyboard;
    if (!desktop && kb && kb.lock && document.documentElement.requestFullscreen) {
      const enter = document.fullscreenElement ? Promise.resolve() : document.documentElement.requestFullscreen();
      enter.then(() => kb.lock()).catch(() => {});
    }
  } catch (e) {}
  setState('play');
}

export function initMenu() {
  document.getElementById('levels').addEventListener('click', (e) => {
    const b = e.target.closest('.lvl');
    if (!b) return;
    game.selected = +b.dataset.i; renderLevels();
  });
  document.getElementById('go').addEventListener('click', startSelected);
  document.getElementById('again').addEventListener('click', () => { restart(); lockAndPlay(); });
  document.getElementById('next').addEventListener('click', () => {
    game.selected = (game.levelIdx + 1) % LEVELS.length; loadLevel(game.selected); restart(); lockAndPlay();
  });
  document.getElementById('toMenu').addEventListener('click', () => { game.selected = game.levelIdx; restart(); });
  renderer.domElement.addEventListener('click', () => { if (game.state === 'play' && !look.locked) lockAndPlay(); });
  // exit buttons only show in the desktop app: browsers ignore window.close() on a tab the player opened
  const desktop = /Electron/.test(navigator.userAgent);
  document.querySelectorAll('[data-quit]').forEach((b) => { b.hidden = !desktop; b.addEventListener('click', () => window.close()); });

  const sensEl = document.getElementById('sens'), fovEl = document.getElementById('fov'), fxEl = document.getElementById('fx');
  sensEl.value = settings.sens; fovEl.value = settings.fov; fxEl.checked = settings.fx;
  const syncSettings = () => {
    settings.sens = +sensEl.value; settings.fov = +fovEl.value; settings.fx = fxEl.checked;
    document.getElementById('sensV').textContent = settings.sens.toFixed(2);
    document.getElementById('fovV').textContent = settings.fov;
    save('sens', settings.sens); save('fov', settings.fov); save('fx', settings.fx);
  };
  [sensEl, fovEl, fxEl].forEach((el) => el.addEventListener('input', syncSettings));
  syncSettings();

  // display mode lives in the desktop app (it owns the window), so the dropdown only shows there
  const displayEl = document.getElementById('displayMode');
  document.getElementById('displayRow').hidden = !desktop;
  if (desktop) {
    desktop.getDisplayMode().then((m) => { displayEl.value = m; });
    displayEl.addEventListener('change', () => desktop.setDisplayMode(displayEl.value));
  }
}
