# Kinetic

A first-person rooftop parkour time-trial that runs in the browser. Chain wallruns, slides, dashes, slams and grapples along hand-built courses of rooftop set pieces, and keep your momentum to set a best time on each course.

It's built on [three.js](https://threejs.org/) (r128) with plain JavaScript modules, bundled by [Vite](https://vite.dev/). Everything, including three.js and the font, is installed through npm, so the game runs offline.

## Running it

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install      # once
npm run dev      # play in the browser with live reload while you edit
npm run build    # production build into dist/
npm run preview  # serve the production build
```

### Single HTML file

```sh
npm run build:html   # builds dist-html/index.html
```

This puts the whole game (three.js, scripts, styles and fonts) into one standalone `index.html` of about 1.3 MB. Double-click it to play in any modern browser. It needs no server or internet connection, so you can copy it anywhere or send it to someone. The build uses its own config, `vite.html.config.js`, so the desktop app build isn't affected.

### Desktop app (Windows .exe)

The game is wrapped in [Electron](https://www.electronjs.org/) for a standalone desktop version.

```sh
npm start        # build and open the game in a desktop window
npm run dist     # build Windows executables into release/
```

`npm run dist` makes two files in `release/`:

- `Kinetic Setup <version>.exe`: an installer with a Start menu shortcut and uninstaller
- `Kinetic-<version>-portable.exe`: a single exe you can run from anywhere without installing

In the desktop app, the menu's **Display** setting switches between Fullscreen, Borderless window and Windowed, and is remembered between launches. Switching to or from Borderless reopens the window, which returns you to the menu.

The exes aren't code-signed, so Windows SmartScreen may warn the first time you run them ("More info" → "Run anyway").

Pick a level and click to start. The game needs a mouse and keyboard and uses pointer lock for mouse look.

## Controls

| Action | Key |
| --- | --- |
| Move / look | WASD + mouse |
| Jump / wall jump / air jump | Space |
| Dash (uses stamina) | Shift |
| Crouch / slide / slam (in the air) | Ctrl or C |
| Grapple (hold) | E or right mouse |
| Restart run | R |
| Pause / level select | Esc |

## Movement

- **Running:** you start at a jog and keep picking up speed the longer you run in any direction, with no top speed. Each extra km/h takes a bit longer, and sharp turns cost speed.
- **Wallrun:** jump at a wall at an angle while holding W. Jump again to kick off.
- **Momentum:** speed from running, wallruns, slides, slams and dashes carries over as long as you keep moving. Letting go of the keys, crouching or landing hard kills it.
- **Vault / mantle:** run or jump into a ledge while holding W and you keep your speed.
- **Bhop:** jump the instant you land to skip ground friction, and air-strafe (A/D + mouse) to gain speed.
- **Slam:** press Ctrl in the air. Jump right after landing for a slam jump; the higher the fall, the bigger the jump.
- **Roll:** tap Ctrl just before a big landing to keep your speed.
- **Stamina:** dash and air jump share one meter. It refills after a short pause, and landing a roll gives a chunk back.
- **Dash:** press Shift to dash the way you're moving (forward if you're standing still). Each dash costs one notch (30%) of stamina.
- **Air jump:** press Space again in the air to jump, as many times as your stamina allows. Each one costs one notch (30%).
- **Dash jump:** jump during a ground dash to launch at dash speed.
- **Body:** you have first-person arms and legs. Your arms pump as you sprint, plant on vaults, hook ledges on mantles, press the wall on wallruns and hold the grapple line. Look down to see your legs. With speed lines & shake on, a roll flips the view all the way over.
- **Runner vision:** red beams, wallrun panels and crates mark useful routes. Cyan hooks are grapple points.

## Levels

| Level | Description |
| --- | --- |
| Rooftops | Wide, forgiving roofs in the midday sun. Every move in turn, with two corners. |
| Glass Canyon | Narrow towers 30 m up. Long wallrun chains, grapples and hook chains. |
| Scaffold | Balance beams, hanging slabs, crane hooks and hazard bars. |
| Descent | Start 80 m up, finish at the bottom. Big drops all the way: roll every landing. |
| Circuit | Three laps of a night-time loop with four corners. |
| The Line | The original: one straight, unforgiving sprint route. |

Every level is a run of set pieces (gap, slide, wallrun, grapple, climb, drop, shaft, beam, platforms, hook chain, steps, long jump, corner) with its own tuning, built by `src/world/course.js`.

Best times, the last level played and your settings (mouse sensitivity, FOV, speed lines and screen shake) are saved in the browser's local storage.

## Project layout

```
index.html            HUD and menu markup; loads src/main.js
electron/main.cjs     desktop window for the .exe build
src/
  main.js             startup and the frame loop (camera, effects, rendering)
  config.js           movement tuning constants
  state.js            shared run state, view angles and settings
  utils.js            seeded rng, local storage, time formatting
  game.js             checkpoints, laps, respawn, restart, finish
  audio.js            footsteps and sound effects (Web Audio)
  input.js            keyboard and mouse
  style.css           HUD and menu styles
  render/             renderer, sky, toon materials, geometry batching, themes, camera fx, player rig (arms, legs, IK)
  world/              level building, the set-piece course builder, level list
  player/             player state, collision, moves (wallrun, grapple, vault...), physics step, body animation
  ui/                 HUD, style meter, level select and settings
```
