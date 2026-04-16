import type { GameState, GameAction, Direction, Vec2 } from './types';

// --- Helpers ---

function vecEq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

const DELTAS: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function isWall(state: GameState, pos: Vec2): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= state.width || pos.y >= state.height)
    return true;
  return state.grid[pos.y][pos.x] === 'wall';
}

function boxAt(state: GameState, pos: Vec2): number {
  return state.boxes.findIndex((b) => vecEq(b.pos, pos));
}

function robotAt(state: GameState, pos: Vec2): number {
  return state.robots.findIndex((r) => vecEq(r.pos, pos));
}

function isAdjacent(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function inSafeZone(state: GameState, pos: Vec2): boolean {
  return state.safeZone.some((s) => vecEq(s, pos));
}

// Normal boxes explode if they enter the safe zone — block the move
function boxBlockedBySafeZone(state: GameState, boxIdx: number, dest: Vec2): boolean {
  return !state.boxes[boxIdx].isRedBuddy && inSafeZone(state, dest);
}

function isOccupied(state: GameState, pos: Vec2): boolean {
  if (isWall(state, pos)) return true;
  if (boxAt(state, pos) >= 0) return true;
  if (robotAt(state, pos) >= 0) return true;
  return false;
}

// --- Corner Rule ---
// Towing only works if movement direction matches box→robot direction
function canTow(state: GameState, robotIndex: number, delta: Vec2): boolean {
  const robot = state.robots[robotIndex];
  if (robot.attachedBoxIndex === null) return true;
  const box = state.boxes[robot.attachedBoxIndex];
  const boxToRobot: Vec2 = {
    x: robot.pos.x - box.pos.x,
    y: robot.pos.y - box.pos.y,
  };
  return vecEq(delta, boxToRobot);
}

// --- Validate attachments (auto-detach if no longer adjacent) ---
function validateAttachments(state: GameState): void {
  for (const robot of state.robots) {
    if (robot.attachedBoxIndex !== null) {
      const box = state.boxes[robot.attachedBoxIndex];
      if (!box || !isAdjacent(robot.pos, box.pos)) {
        robot.attachedBoxIndex = null;
      }
    }
  }
}

// --- Win check: R3 on exit + both robots in safe zone ---
function checkWin(state: GameState): void {
  const redBuddy = state.boxes.find((b) => b.isRedBuddy);
  if (!redBuddy || !vecEq(redBuddy.pos, state.exitPos)) return;
  const inSafe = (pos: Vec2) =>
    state.safeZone.some((s) => vecEq(s, pos));
  if (inSafe(state.robots[0].pos) && inSafe(state.robots[1].pos)) {
    state.won = true;
  }
}

// --- Move logic ---
function tryMove(state: GameState, direction: Direction): boolean {
  const delta = DELTAS[direction];
  const ri = state.selectedRobotIndex;
  const robot = state.robots[ri];
  const targetPos = vecAdd(robot.pos, delta);

  // Blocked by wall
  if (isWall(state, targetPos)) return false;

  // Blocked by other robot
  const otherRobot = robotAt(state, targetPos);
  if (otherRobot >= 0 && otherRobot !== ri) return false;

  const targetBoxIdx = boxAt(state, targetPos);

  if (targetBoxIdx >= 0) {
    // --- PUSH ---
    const pushDest = vecAdd(targetPos, delta);
    if (isOccupied(state, pushDest)) return false;
    if (boxBlockedBySafeZone(state, targetBoxIdx, pushDest)) return false;

    // If attached to a different box, check tow constraint
    if (
      robot.attachedBoxIndex !== null &&
      robot.attachedBoxIndex !== targetBoxIdx
    ) {
      if (!canTow(state, ri, delta)) return false;
    }

    // Check tow destination for safe zone restriction
    if (
      robot.attachedBoxIndex !== null &&
      robot.attachedBoxIndex !== targetBoxIdx &&
      boxBlockedBySafeZone(state, robot.attachedBoxIndex, robot.pos)
    ) {
      return false;
    }

    // Execute push
    const oldPos = { ...robot.pos };
    state.boxes[targetBoxIdx].pos = pushDest;
    robot.pos = targetPos;
    robot.facing = direction;

    // Tow attached box (if attached to a different box)
    if (
      robot.attachedBoxIndex !== null &&
      robot.attachedBoxIndex !== targetBoxIdx
    ) {
      state.boxes[robot.attachedBoxIndex].pos = oldPos;
    }

    state.steps++;
    validateAttachments(state);
    checkWin(state);
    return true;
  }

  // --- WALK (empty tile) ---
  if (robot.attachedBoxIndex !== null) {
    if (!canTow(state, ri, delta)) return false;
    if (boxBlockedBySafeZone(state, robot.attachedBoxIndex, robot.pos))
      return false;

    const oldPos = { ...robot.pos };
    robot.pos = targetPos;
    robot.facing = direction;
    state.boxes[robot.attachedBoxIndex].pos = oldPos;
  } else {
    robot.pos = targetPos;
    robot.facing = direction;
  }

  state.steps++;
  validateAttachments(state);
  checkWin(state);
  return true;
}

// --- Attach/Detach ---
function toggleAttach(state: GameState): void {
  const robot = state.robots[state.selectedRobotIndex];

  if (robot.attachedBoxIndex !== null) {
    robot.attachedBoxIndex = null;
    return;
  }

  // Find all adjacent boxes
  const adjacent: number[] = [];
  for (let d = 0; d < 4; d++) {
    const neighbor = vecAdd(robot.pos, DELTAS[DIRECTIONS[d]]);
    const idx = boxAt(state, neighbor);
    if (idx >= 0) adjacent.push(idx);
  }

  if (adjacent.length === 1) {
    // Only one adjacent box — attach directly, no facing requirement
    robot.attachedBoxIndex = adjacent[0];
  } else if (adjacent.length > 1) {
    // Multiple adjacent boxes — use facing direction to choose
    const facingPos = vecAdd(robot.pos, DELTAS[robot.facing]);
    const facingBox = boxAt(state, facingPos);
    if (facingBox >= 0) robot.attachedBoxIndex = facingBox;
  }
}

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

// --- Main action dispatcher ---
export function applyAction(state: GameState, action: GameAction): boolean {
  switch (action.type) {
    case 'move':
      return tryMove(state, action.direction);
    case 'selectRobot':
      state.selectedRobotIndex = action.id === 'R1' ? 0 : 1;
      return true;
    case 'toggleAttach':
      toggleAttach(state);
      return true;
    default:
      return false;
  }
}
