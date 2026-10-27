import { course } from './course.js';

// ---------------------------------------------------------------- level: The Line (linear course along -Z)
// the original set-piece course. its pieces and their default tuning live in course.js
export function lineCourse() {
  const end = course({}, ['gap', 'gap', 'slide', 'wallrun', 'gap', 'grapple', 'climb', 'drop', ['wallrun', { n: 3 }], 'shaft',
    'gap', 'grapple', 'slide', 'drop', 'wallrun', 'climb', 'grapple', 'gap']).end;
  return { x0: -25, x1: 25, z0: end, z1: 20, yRef: 0 };
}
