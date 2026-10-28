// ---------------------------------------------------------------- tuning
export const R = 0.35, H_STAND = 1.8, H_CROUCH = 1.0, EYE = 0.15, EPS = 0.001;
export const GRAV = 28, JUMP_V = 10, MAX_SPEED = 70;
// hard cap on horizontal speed: 25 m/s = 90 km/h
export const MAX_HSPEED = 25;
export const RUN = 10, CROUCH_SPEED = 3.5, G_ACCEL = 10, FRICTION = 7, STOP_SPEED = 4;
// dash and air jump share one 0-100 stamina meter. it refills after a pause, and a roll refunds some
export const STAMINA_REGEN = 20, STAMINA_DELAY = 0.8, DASH_COST = 30, ROLL_REFILL = 35;
export const AIR_JUMP_COST = 30, AIR_JUMP_V = 9.5;
// how fast running speed steers toward the held direction
export const MOMENTUM_TURN = 5;
// build-up running: speed gain = RUN_BUILD / (1 + speed / RUN_SOFT), so ~1.5s from jog to 36 km/h, ~6s to 72, ~9s to the 90 cap
export const RUN_START = 4.8, RUN_BUILD = 8, RUN_SOFT = 6, TURN_SCRUB = 12;
export const AIR_ACCEL = 50, AIR_CAP = 2, AIR_CONTROL = 14;
export const SLIDE_FRICTION = 0.045, SLIDE_BOOST = 4, SLIDE_MIN = 6.5;
export const DASH_SPEED = 30, DASH_T = 0.17;
export const SLAM_V = 44, ROLL_WINDOW = 0.15, HARD_LAND = 25;
export const WR_MIN = 5, WR_ACCEL = 5, WR_MAX = 24, WR_TIME = 1.9, WR_PUSH = 8.5, WR_JUMP_V = 9;
export const WJ_PUSH = 8, WJ_V = 10.5;
export const HOOK_RANGE = 42, HOOK_PULL = 55;
export const MANTLE_REACH = 2.3;
