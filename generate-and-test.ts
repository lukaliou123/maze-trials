import * as fs from 'fs';
import { createStateFromLevel } from './src/state';
import { solve } from './src/solver';
import { applyAction } from './src/logic';
import type { GameState, LevelDef } from './src/types';

function validateSolution(gameState: GameState, actions: any[]): boolean {
  const s: GameState = {
    grid: gameState.grid, width: gameState.width, height: gameState.height,
    robots: [
      { ...gameState.robots[0], pos: { ...gameState.robots[0].pos } },
      { ...gameState.robots[1], pos: { ...gameState.robots[1].pos } },
    ],
    boxes: gameState.boxes.map(b => ({ pos: { ...b.pos }, isRedBuddy: b.isRedBuddy })),
    exitPos: gameState.exitPos, safeZone: gameState.safeZone,
    selectedRobotIndex: 0, steps: 0, won: false, winPhase: 0,
  };
  for (const action of actions) applyAction(s, action);
  return s.won;
}

// --- Random maze generator ---
// innerW/innerH = playable space (excluding outer walls)
// Actual grid = (innerW+2) wide, (innerH+2) + 4 tall
function generateMaze(innerW: number, innerH: number, numBoxes: number): LevelDef | null {
  const mazeW = innerW + 2;
  const mazeH = innerH + 2;
  const totalH = mazeH + 4;
  const grid: string[][] = [];

  // Fill with walls (border) + floor (interior)
  for (let y = 0; y < totalH; y++) {
    grid[y] = [];
    for (let x = 0; x < mazeW; x++) {
      if (y === 0 || y === mazeH - 1 || x === 0 || x === mazeW - 1) {
        grid[y][x] = '#'; // border wall
      } else if (y < mazeH) {
        grid[y][x] = '.'; // open floor
      } else {
        grid[y][x] = '#'; // safe zone area (filled later)
      }
    }
  }

  // Add random internal wall segments for structure
  // Wall density: 15-25% of internal tiles become walls
  const wallDensity = 0.15 + Math.random() * 0.1;
  const internalCells: [number, number][] = [];
  for (let y = 1; y < mazeH - 1; y++)
    for (let x = 1; x < mazeW - 1; x++)
      internalCells.push([x, y]);

  // Place wall segments (L-shapes, lines, pillars)
  const numWallOps = Math.floor(internalCells.length * wallDensity / 2);
  for (let i = 0; i < numWallOps; i++) {
    const [wx, wy] = internalCells[Math.floor(Math.random() * internalCells.length)];
    const pattern = Math.random();

    if (pattern < 0.4) {
      // Single pillar
      grid[wy][wx] = '#';
    } else if (pattern < 0.7) {
      // Horizontal segment (2-3 tiles)
      const len = 2 + Math.floor(Math.random() * 2);
      for (let dx = 0; dx < len && wx + dx < mazeW - 1; dx++)
        grid[wy][wx + dx] = '#';
    } else {
      // Vertical segment (2-3 tiles)
      const len = 2 + Math.floor(Math.random() * 2);
      for (let dy = 0; dy < len && wy + dy < mazeH - 1; dy++)
        grid[wy + dy][wx] = '#';
    }
  }

  // Ensure 4 corners are open (at least 2x2)
  for (const [cx, cy] of [[1,1], [mazeW-3,1], [1,mazeH-3], [mazeW-3,mazeH-3]]) {
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++)
        if (cy+dy > 0 && cy+dy < mazeH-1 && cx+dx > 0 && cx+dx < mazeW-1)
          grid[cy+dy][cx+dx] = '.';
  }

  // Ensure connectivity: BFS from (1,1), remove walls blocking disconnected regions
  const floorSet = new Set<string>();
  for (let y = 1; y < mazeH - 1; y++)
    for (let x = 1; x < mazeW - 1; x++)
      if (grid[y][x] === '.') floorSet.add(`${x},${y}`);

  const reachable = new Set<string>();
  const bfsQ: [number, number][] = [[1, 1]];
  reachable.add('1,1');
  let bfsH = 0;
  while (bfsH < bfsQ.length) {
    const [cx, cy] = bfsQ[bfsH++];
    for (const [ddx, ddy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nx = cx+ddx, ny = cy+ddy;
      const key = `${nx},${ny}`;
      if (nx >= 1 && nx < mazeW-1 && ny >= 1 && ny < mazeH-1 &&
          grid[ny][nx] === '.' && !reachable.has(key)) {
        reachable.add(key);
        bfsQ.push([nx, ny]);
      }
    }
  }
  // Open walls to connect unreachable floor tiles
  for (const key of floorSet) {
    if (!reachable.has(key)) {
      const [x, y] = key.split(',').map(Number);
      // Try to connect by removing a wall neighbor
      for (const [ddx, ddy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const wx = x+ddx, wy = y+ddy;
        if (wx >= 1 && wx < mazeW-1 && wy >= 1 && wy < mazeH-1 && grid[wy][wx] === '#') {
          // Check if other side of wall is reachable
          const ox = wx+ddx, oy = wy+ddy;
          if (reachable.has(`${ox},${oy}`)) {
            grid[wy][wx] = '.';
            reachable.add(key);
            reachable.add(`${wx},${wy}`);
            break;
          }
        }
      }
    }
  }

  // Door: center-ish bottom of maze connects to safe zone
  // Must be an odd column to align with maze carving (which carves at odd positions)
  let doorX = Math.floor(mazeW / 2);
  if (doorX % 2 === 0) doorX--; // ensure odd for maze alignment
  // Also make sure the tile above the door is carved
  if (grid[mazeH - 2][doorX] === '#') {
    // Try to open a path from nearest carved cell to door
    for (let y = mazeH - 2; y >= 1; y--) {
      if (grid[y][doorX] === '.') break;
      grid[y][doorX] = '.';
    }
  }
  grid[mazeH - 1][doorX] = '.'; // open door in maze bottom wall

  // Safe zone (4 rows below maze)
  const safeLeft = doorX - 1;
  const safeRight = doorX + 1;
  for (let y = mazeH; y < mazeH + 3; y++) {
    for (let x = safeLeft; x <= safeRight; x++) {
      if (x >= 0 && x < mazeW) grid[y][x] = '.';
    }
  }
  // Bottom wall of safe zone
  for (let x = 0; x < mazeW; x++) grid[mazeH + 3][x] = '#';

  // Door corridor connecting maze to safe zone
  grid[mazeH][doorX] = '.';

  // Place exit in center of safe zone
  grid[mazeH + 1][doorX] = 'E';

  // Place R1 and R2 in safe zone
  grid[mazeH + 2][doorX - 1] = '1';
  grid[mazeH + 2][doorX + 1] = '2';

  // Collect floor tiles in maze (not safe zone)
  const floorTiles: [number, number][] = [];
  for (let y = 1; y < mazeH - 1; y++) {
    for (let x = 1; x < mazeW - 1; x++) {
      if (grid[y][x] === '.') floorTiles.push([x, y]);
    }
  }

  if (floorTiles.length < numBoxes + 1) return null; // not enough space

  // Shuffle and pick positions for R3 + normal boxes
  const shuffledTiles = floorTiles.sort(() => Math.random() - 0.5);

  // R3 should be far from exit for interesting puzzles
  shuffledTiles.sort((a, b) => {
    const da = Math.abs(a[0] - doorX) + Math.abs(a[1] - (mazeH - 1));
    const db = Math.abs(b[0] - doorX) + Math.abs(b[1] - (mazeH - 1));
    return db - da; // farthest first
  });

  // Pick R3 from top 30% farthest tiles
  const r3Candidates = shuffledTiles.slice(0, Math.max(3, Math.floor(shuffledTiles.length * 0.3)));
  const r3Idx = Math.floor(Math.random() * r3Candidates.length);
  const [r3x, r3y] = r3Candidates[r3Idx];
  grid[r3y][r3x] = '3';

  // Remove R3 position from available tiles
  const remaining = shuffledTiles.filter(([x, y]) => !(x === r3x && y === r3y));

  // Place normal boxes randomly
  const boxPositions: [number, number][] = [];
  for (let i = 0; i < numBoxes && i < remaining.length; i++) {
    const [bx, by] = remaining[i];
    grid[by][bx] = 'B';
    boxPositions.push([bx, by]);
  }

  // Convert to ASCII
  const ascii = grid.map(row => row.join('')).join('\n');
  return { name: `Random ${innerW}x${innerH} ${numBoxes}B`, ascii };
}

// --- Main ---
const origLog = console.log;
let lastStates = '-';
console.log = (...args: any[]) => {
  const msg = args.join(' ');
  const m = msg.match(/(\d+)\s*states/);
  if (m) lastStates = m[1];
};

origLog('=== Maze Trials: Random Level Generator + Solver Benchmark ===\n');
origLog(`${'Config'.padEnd(16)} ${'Result'.padEnd(10)} ${'States'.padEnd(10)} ${'Actions'.padEnd(10)} ${'Time'.padEnd(10)} ${'Difficulty'.padEnd(10)} Map`);
origLog('-'.repeat(100));

const results = { easy: 0, medium: 0, hard: 0, unsolvable: 0, invalid: 0 };
const interesting: { config: string; states: number; time: number; actions: number; ascii: string; difficulty: string }[] = [];

// Archive: all puzzles with solutions for future DL training
interface PuzzleRecord {
  id: number;
  config: string;
  mazeW: number;
  mazeH: number;
  numBoxes: number;
  ascii: string;
  solved: boolean;
  difficulty: string;      // EASY / MEDIUM / HARD / PROVEN_UNSOLVABLE / TIMEOUT / EXCEEDED
  states: number;
  actions: number;
  timeMs: number;
  solution: any[] | null;  // full action sequence
}
const archive: PuzzleRecord[] = [];
let puzzleId = 0;

const configs = [
  // Open 6x6 with many boxes
  { w: 6, h: 6, boxes: 5, count: 30 },
  { w: 6, h: 6, boxes: 6, count: 30 },
  // Open 7x7
  { w: 7, h: 7, boxes: 5, count: 30 },
  { w: 7, h: 7, boxes: 6, count: 30 },
  // Open 8x8
  { w: 8, h: 8, boxes: 5, count: 20 },
  { w: 8, h: 8, boxes: 6, count: 20 },
  { w: 8, h: 8, boxes: 7, count: 20 },
];

for (const cfg of configs) {
  for (let attempt = 0; attempt < cfg.count; attempt++) {
    const level = generateMaze(cfg.w, cfg.h, cfg.boxes);
    if (!level) { results.invalid++; continue; }

    let state: GameState;
    try {
      state = createStateFromLevel(level);
    } catch {
      results.invalid++;
      continue;
    }

    lastStates = '-';
    const t0 = performance.now();
    const solution = solve(state);
    const dt = performance.now() - t0;

    const configStr = `${cfg.w}x${cfg.h}i+${cfg.boxes}B`;

    const statesNum = parseInt(lastStates) || 0;

    if (solution) {
      const valid = validateSolution(createStateFromLevel(level), solution);
      if (!valid) { results.invalid++; continue; }

      let difficulty: string;
      if (dt < 100) { difficulty = 'EASY'; results.easy++; }
      else if (dt < 1000) { difficulty = 'MEDIUM'; results.medium++; }
      else if (dt < 10000) { difficulty = 'HARD'; results.hard++; }
      else { difficulty = 'HARD'; results.hard++; }

      if (difficulty !== 'EASY') {
        origLog(
          `\n${configStr} — ${difficulty} — ${lastStates} states, ${solution.length} actions, ${dt.toFixed(0)}ms`
        );
        origLog(level.ascii);
      }

      archive.push({
        id: puzzleId++, config: configStr, mazeW: cfg.w, mazeH: cfg.h, // inner dimensions
        numBoxes: cfg.boxes, ascii: level.ascii, solved: true,
        difficulty, states: statesNum, actions: solution.length,
        timeMs: Math.round(dt), solution,
      });

      if (difficulty !== 'EASY') {
        interesting.push({
          config: configStr, states: statesNum, time: Math.round(dt),
          actions: solution.length, ascii: level.ascii, difficulty,
        });
      }
    } else {
      results.unsolvable++;
      // Distinguish: proven unsolvable (heap empty quickly) vs timeout/exceeded
      let failReason: string;
      if (dt >= 9900) {
        failReason = 'TIMEOUT';        // 10s timeout hit
      } else if (statesNum >= 2900000) {
        failReason = 'EXCEEDED';       // 3M state limit hit
      } else {
        failReason = 'PROVEN_UNSOLVABLE'; // heap exhausted — truly no solution
      }
      origLog(`\n${configStr} — ${failReason} (${lastStates} states, ${dt.toFixed(0)}ms)`);
      archive.push({
        id: puzzleId++, config: configStr, mazeW: cfg.w, mazeH: cfg.h, // inner dimensions
        numBoxes: cfg.boxes, ascii: level.ascii, solved: false,
        difficulty: failReason, states: statesNum, actions: 0,
        timeMs: Math.round(dt), solution: null,
      });
    }
  }
}

origLog('\n' + '='.repeat(100));
origLog(`Summary: Easy=${results.easy} Medium=${results.medium} Hard=${results.hard} Timeout=${results.unsolvable} Invalid=${results.invalid}`);

if (interesting.length > 0) {
  origLog(`\n=== Interesting puzzles (Medium/Hard) ===\n`);
  // Sort by difficulty then time
  interesting.sort((a, b) => b.time - a.time);
  for (const p of interesting.slice(0, 10)) {
    origLog(`[${p.difficulty}] ${p.config} — ${p.states} states, ${p.actions} actions, ${p.time}ms`);
    origLog(p.ascii);
    origLog('');
  }
}

// Save archive to JSON
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const archivePath = `data/puzzles-${timestamp}.json`;
fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
origLog(`\nArchive saved: ${archivePath} (${archive.length} puzzles, ${archive.filter(p => p.solved).length} solved)`);

console.log = origLog;
