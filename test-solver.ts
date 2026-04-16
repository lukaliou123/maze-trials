import { LEVELS } from './src/levels';
import { createStateFromLevel } from './src/state';
import { solve } from './src/solver';
import { applyAction } from './src/logic';
import type { GameState } from './src/types';

function validateSolution(gameState: GameState, actions: any[]): boolean {
  const s: GameState = {
    grid: gameState.grid,
    width: gameState.width,
    height: gameState.height,
    robots: [
      { ...gameState.robots[0], pos: { ...gameState.robots[0].pos } },
      { ...gameState.robots[1], pos: { ...gameState.robots[1].pos } },
    ],
    boxes: gameState.boxes.map(b => ({ pos: { ...b.pos }, isRedBuddy: b.isRedBuddy })),
    exitPos: gameState.exitPos,
    safeZone: gameState.safeZone,
    selectedRobotIndex: 0,
    steps: 0,
    won: false,
    winPhase: 0,
  };

  for (const action of actions) {
    applyAction(s, action);
  }
  return s.won;
}

// Capture console.log to extract states count
let lastStates = '';
const origLog = console.log;
console.log = (...args: any[]) => {
  const msg = args.join(' ');
  const m = msg.match(/(\d+)\s*states/);
  if (m) lastStates = m[1];
};

origLog('=== Maze Trials Solver Benchmark ===\n');
origLog(`${'Level'.padEnd(30)} ${'Result'.padEnd(10)} ${'States'.padEnd(10)} ${'Actions'.padEnd(10)} ${'Time'.padEnd(10)} Valid`);
origLog('-'.repeat(80));

let allPass = true;
for (let i = 0; i < LEVELS.length; i++) {
  const level = LEVELS[i];
  const state = createStateFromLevel(level);

  lastStates = '-';
  const t0 = performance.now();
  const solution = solve(state);
  const dt = performance.now() - t0;

  if (solution) {
    const freshState = createStateFromLevel(level);
    const valid = validateSolution(freshState, solution);
    if (!valid) allPass = false;
    origLog(
      `${level.name.padEnd(30)} ${'SOLVED'.padEnd(10)} ${lastStates.padEnd(10)} ${String(solution.length).padEnd(10)} ${(dt.toFixed(0) + 'ms').padEnd(10)} ${valid ? 'OK' : 'FAIL!'}`
    );
  } else {
    allPass = false;
    origLog(
      `${level.name.padEnd(30)} ${'TIMEOUT'.padEnd(10)} ${lastStates.padEnd(10)} ${'-'.padEnd(10)} ${(dt.toFixed(0) + 'ms').padEnd(10)} -`
    );
  }
}

origLog('-'.repeat(80));
origLog(allPass ? 'All levels PASSED.' : 'Some levels FAILED!');

console.log = origLog; // restore
