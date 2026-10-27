# Kinetic

A first-person rooftop parkour time-trial that runs in the browser. Chain wallruns, slides, dashes, slams and grapples across procedurally laid-out city districts, and keep your momentum to set a best time on each course.

The whole game is a single HTML file built on [three.js](https://threejs.org/) (r128, loaded from cdnjs). There's no build step and nothing to install.

## Running it

Open `kinetic/index.html` in a modern desktop browser, pick a level and click to start. The game needs a mouse and keyboard and uses pointer lock for mouse look.

If your browser blocks local files, serve the folder instead:

```sh
cd kinetic
python -m http.server 8000
# then open http://localhost:8000
```

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
- **Runner vision:** red beams, wallrun panels and crates mark useful routes. Cyan hooks are grapple points.

## Levels

| Level | Description |
| --- | --- |
| Rooftops | Wide, forgiving roofs in the midday sun. A good place to learn the moves. |
| Glass Canyon | Tall towers and wide streets. Wallrun and grapple across the gaps. |
| Scaffold | A construction district full of beams, open floors and crane hooks. |
| Descent | Start at the top, finish at the bottom. Roll your landings to keep your speed. |
| Circuit | Three laps around a night-time block. |
| The Line | One straight, unforgiving sprint route. |

Best times, the last level played and your settings (mouse sensitivity, FOV, speed lines and screen shake) are saved in the browser's local storage.

## Project layout

```
kinetic/
  index.html   game: markup, styles, level generation, physics, audio and HUD
```
