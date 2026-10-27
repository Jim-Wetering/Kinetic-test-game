import { load } from './utils.js';

// shared mutable state lives in objects so any module can update it (imported bindings are read-only)
export const game = {
  state: 'menu', running: false, runTime: 0, cpIndex: 0, falls: 0, topSpeed: 0,
  lap: 1, lapStart: 0, bestLap: null, best: null,
  levelIdx: 0, selected: 0,
};
export const look = { yaw: 0, pitch: 0, locked: false };
export const settings = { sens: load('sens', 1), fov: load('fov', 100), fx: load('fx', true) };
