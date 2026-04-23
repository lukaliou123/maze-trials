import { LEVELS } from './levels';
import { createStateFromLevel } from './state';
import { applyAction } from './logic';
import { setupInput } from './input';
import { createRenderer } from './renderer';
import { solve } from './solver';
import { computeTileSize } from './constants';
import type { GameAction, Direction, Vec2 } from './types';
import type { SolverAction } from './solver';
import { scanTriggers } from './dialogue/triggers';
import { requestAllDialogues } from './dialogue/client';
import * as dialoguePanel from './dialogue/panel';
import type { DialogueLine, DialogueMoment } from './dialogue/types';
import './style.css';

const PLAYBACK_STEP_MS = 400;

let currentLevelIndex = 0;
let state = createStateFromLevel(LEVELS[currentLevelIndex]);

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const solveBtn = document.getElementById('solve-btn') as HTMLButtonElement;
const levelSelectDiv = document.getElementById('level-select') as HTMLDivElement;

let playbackAbort: AbortController | null = null;
let autoWalkTimer: ReturnType<typeof setInterval> | null = null;
let dialogueEnabled = false;

const dialogueToggleBtn = document.getElementById('dialogue-toggle') as HTMLButtonElement;
const dialoguePanelEl = document.getElementById('dialogue-panel') as HTMLElement;

dialogueToggleBtn.addEventListener('click', () => {
  dialogueEnabled = !dialogueEnabled;
  dialoguePanelEl.classList.toggle('hidden', !dialogueEnabled);
  dialogueToggleBtn.classList.toggle('active', dialogueEnabled);
  if (!dialogueEnabled) dialoguePanel.reset();
});

// --- Level select buttons ---
function buildLevelSelect(): void {
  levelSelectDiv.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const btn = document.createElement('button');
    btn.textContent = `L${i + 1}`;
    btn.title = level.name;
    if (i === currentLevelIndex) btn.classList.add('active');
    btn.addEventListener('click', () => {
      stopPlayback();
      if (dialogueEnabled) dialoguePanel.reset();
      currentLevelIndex = i;
      state = createStateFromLevel(LEVELS[currentLevelIndex]);
      buildLevelSelect();
      render();
    });
    levelSelectDiv.appendChild(btn);
  });
}

function stopPlayback(): void {
  stopAutoWalk();
  if (playbackAbort) {
    playbackAbort.abort();
    playbackAbort = null;
  }
  solveBtn.textContent = 'AI SOLVE';
  solveBtn.disabled = false;
}

function isPlaying(): boolean {
  return playbackAbort !== null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// --- Mobile: tap-to-move ---

function stopAutoWalk(): void {
  if (autoWalkTimer !== null) {
    clearInterval(autoWalkTimer);
    autoWalkTimer = null;
  }
}

function startAutoWalk(directions: Direction[]): void {
  stopAutoWalk();
  let i = 0;
  const step = () => {
    if (i >= directions.length || state.won) {
      stopAutoWalk();
      if (state.won) startWinSequence();
      return;
    }
    const ok = applyAction(state, { type: 'move', direction: directions[i] });
    render();
    if (!ok) {
      stopAutoWalk();
      return;
    }
    i++;
  };
  step();
  if (i < directions.length) {
    autoWalkTimer = setInterval(step, 120);
  }
}

function findPath(from: Vec2, to: Vec2): Direction[] {
  if (from.x === to.x && from.y === to.y) return [];
  const visited = new Set<string>();
  const queue: { pos: Vec2; path: Direction[] }[] = [{ pos: from, path: [] }];
  visited.add(`${from.x},${from.y}`);

  const dirs: { dir: Direction; dx: number; dy: number }[] = [
    { dir: 'up', dx: 0, dy: -1 },
    { dir: 'down', dx: 0, dy: 1 },
    { dir: 'left', dx: -1, dy: 0 },
    { dir: 'right', dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const { dir, dx, dy } of dirs) {
      const nx = cur.pos.x + dx;
      const ny = cur.pos.y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      if (state.grid[ny][nx] === 'wall') continue;
      if (state.boxes.some(b => b.pos.x === nx && b.pos.y === ny)) continue;
      if (state.robots.some((r, ri) => ri !== state.selectedRobotIndex && r.pos.x === nx && r.pos.y === ny)) continue;
      visited.add(key);
      const newPath = [...cur.path, dir];
      if (nx === to.x && ny === to.y) return newPath;
      queue.push({ pos: { x: nx, y: ny }, path: newPath });
    }
  }
  return [];
}

function handleTap(gridX: number, gridY: number): void {
  if (state.won || isPlaying()) return;
  stopAutoWalk();

  if (gridX < 0 || gridY < 0 || gridX >= state.width || gridY >= state.height) return;

  for (let i = 0; i < state.robots.length; i++) {
    if (state.robots[i].pos.x === gridX && state.robots[i].pos.y === gridY) {
      state.selectedRobotIndex = i;
      render();
      return;
    }
  }

  const robot = state.robots[state.selectedRobotIndex];
  const dist = Math.abs(robot.pos.x - gridX) + Math.abs(robot.pos.y - gridY);

  if (dist === 1 && state.boxes.some(b => b.pos.x === gridX && b.pos.y === gridY)) {
    const dx = gridX - robot.pos.x;
    const dy = gridY - robot.pos.y;
    if (dx === 1) robot.facing = 'right';
    else if (dx === -1) robot.facing = 'left';
    else if (dy === 1) robot.facing = 'down';
    else if (dy === -1) robot.facing = 'up';
    applyAction(state, { type: 'toggleAttach' });
    render();
    return;
  }

  if (state.grid[gridY][gridX] === 'wall') return;

  const path = findPath(robot.pos, { x: gridX, y: gridY });
  if (path.length > 0) {
    startAutoWalk(path);
  }
}

// --- Core game actions ---

function handleAction(action: GameAction): void {
  stopAutoWalk();
  if (action.type === 'reset') {
    stopPlayback();
    if (dialogueEnabled) dialoguePanel.reset();
    state = createStateFromLevel(LEVELS[currentLevelIndex]);
    render();
    return;
  }

  if (action.type === 'nextLevel') {
    stopPlayback();
    if (state.won && currentLevelIndex < LEVELS.length - 1) {
      currentLevelIndex++;
      if (dialogueEnabled) dialoguePanel.reset();
      state = createStateFromLevel(LEVELS[currentLevelIndex]);
      buildLevelSelect();
    }
    render();
    return;
  }

  if (state.won || isPlaying()) return;

  applyAction(state, action);
  render();
  if (state.won) startWinSequence();
}

function getAvailableCanvasHeight(): number {
  let used = 0;
  for (const sel of ['h1', '#level-select', '#btn-row', '#touch-controls']) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) used += el.offsetHeight;
  }
  return window.innerHeight - used - 60;
}

function render(): void {
  computeTileSize(state.width, state.height, getAvailableCanvasHeight());
  renderer.render(state, LEVELS[currentLevelIndex].name);
}

function startWinSequence(): void {
  setTimeout(() => {
    state.winPhase = 1;
    render();
    setTimeout(() => {
      state.winPhase = 2;
      render();
    }, 2000);
  }, 2000);
}

// --- Dialogue system ---

let dialogueCache: Map<number, DialogueLine[]> = new Map();
let playedMomentIndices: Set<number> = new Set();

async function renderMomentFromCache(
  moment: DialogueMoment,
  signal: AbortSignal,
): Promise<void> {
  const lines = dialogueCache.get(moment.triggerActionIndex) ?? [];
  for (const line of lines) {
    if (signal.aborted) return;
    await dialoguePanel.appendLine(line);
  }
  playedMomentIndices.add(moment.triggerActionIndex);
}

function startBackgroundRetry(
  moments: DialogueMoment[],
  levelIndex: number,
  signal: AbortSignal,
): void {
  void requestAllDialogues(moments, levelIndex, signal).then((retry) => {
    if (signal.aborted) return;
    if (retry.usedFallback) {
      console.log('[dialogue] background retry also failed; keeping fallback');
      return;
    }
    let swapped = 0;
    for (const m of moments) {
      if (playedMomentIndices.has(m.triggerActionIndex)) continue;
      const lines = retry.cache.get(m.triggerActionIndex);
      if (lines) {
        dialogueCache.set(m.triggerActionIndex, lines);
        swapped++;
      }
    }
    console.log(`[dialogue] background retry succeeded; swapped ${swapped} unrendered moments`);
  });
}

async function startPlayback(actions: SolverAction[]): Promise<void> {
  const ctrl = new AbortController();
  playbackAbort = ctrl;
  const signal = ctrl.signal;

  state = createStateFromLevel(LEVELS[currentLevelIndex]);
  render();

  let momentsByIndex = new Map<number, DialogueMoment>();

  if (dialogueEnabled) {
    const initialState = createStateFromLevel(LEVELS[currentLevelIndex]);
    const moments = scanTriggers(actions, currentLevelIndex, initialState);
    for (const m of moments) momentsByIndex.set(m.triggerActionIndex, m);

    dialoguePanel.reset();
    dialogueCache = new Map();
    playedMomentIndices = new Set();

    solveBtn.textContent = '计划路线...';
    const t0 = performance.now();
    const batch = await requestAllDialogues(moments, currentLevelIndex, signal);
    const dt = performance.now() - t0;
    console.log(
      `[dialogue] prefetch ${moments.length} moments in ${dt.toFixed(0)}ms` +
        (batch.usedFallback ? ' (fallback)' : ' (LLM)'),
    );
    if (signal.aborted) {
      if (playbackAbort === ctrl) playbackAbort = null;
      solveBtn.textContent = 'AI SOLVE';
      solveBtn.disabled = false;
      return;
    }
    dialogueCache = batch.cache;
    if (batch.usedFallback) startBackgroundRetry(moments, currentLevelIndex, signal);
  }

  solveBtn.textContent = `REPLAYING 0/${actions.length}`;

  try {
    for (let i = 0; i <= actions.length; i++) {
      if (signal.aborted) return;

      if (dialogueEnabled) {
        const moment = momentsByIndex.get(i);
        if (moment) await renderMomentFromCache(moment, signal);
        if (signal.aborted) return;
      }

      if (i === actions.length) break;

      applyAction(state, actions[i] as GameAction);
      render();
      solveBtn.textContent = `REPLAYING ${i + 1}/${actions.length}`;

      await sleep(PLAYBACK_STEP_MS, signal);
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('[playback] unexpected error', err);
    }
    return;
  } finally {
    if (playbackAbort === ctrl) playbackAbort = null;
    solveBtn.textContent = 'AI SOLVE';
    solveBtn.disabled = false;
  }

  if (state.won) startWinSequence();
}

solveBtn.addEventListener('click', () => {
  if (isPlaying()) return;

  solveBtn.textContent = 'SOLVING...';
  solveBtn.disabled = true;

  setTimeout(() => {
    const t0 = performance.now();
    const freshState = createStateFromLevel(LEVELS[currentLevelIndex]);
    const solution = solve(freshState);
    const dt = performance.now() - t0;

    if (solution) {
      console.log(`Solved in ${dt.toFixed(0)}ms, ${solution.length} steps`);
      void startPlayback(solution);
    } else {
      console.log(`No solution found (${dt.toFixed(0)}ms)`);
      solveBtn.textContent = 'NO SOLUTION';
      setTimeout(() => {
        solveBtn.textContent = 'AI SOLVE';
        solveBtn.disabled = false;
      }, 2000);
    }
  }, 50);
});

setupInput(handleAction, canvas, handleTap);
buildLevelSelect();

window.addEventListener('resize', () => render());

// Touch controls
document.querySelectorAll<HTMLButtonElement>('.tc-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    switch (action) {
      case 'up': handleAction({ type: 'move', direction: 'up' }); break;
      case 'down': handleAction({ type: 'move', direction: 'down' }); break;
      case 'left': handleAction({ type: 'move', direction: 'left' }); break;
      case 'right': handleAction({ type: 'move', direction: 'right' }); break;
      case 'select-r1': handleAction({ type: 'selectRobot', id: 'R1' }); break;
      case 'select-r2': handleAction({ type: 'selectRobot', id: 'R2' }); break;
      case 'attach': handleAction({ type: 'toggleAttach' }); break;
      case 'reset': handleAction({ type: 'reset' }); break;
      case 'next': handleAction({ type: 'nextLevel' }); break;
    }
  });
});

render();
