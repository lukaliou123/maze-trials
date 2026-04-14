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

// --- Win check ---
function checkWin(state: GameState): void {
  const redBuddy = state.boxes.find((b) => b.isRedBuddy);
  if (redBuddy && vecEq(redBuddy.pos, state.exitPos)) {
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

    // If attached to a different box, check tow constraint
    if (
      robot.attachedBoxIndex !== null &&
      robot.attachedBoxIndex !== targetBoxIdx
    ) {
      if (!canTow(state, ri, delta)) return false;
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

  // Try facing direction first, then scan all directions
  const facingDelta = DELTAS[robot.facing];
  const facingPos = vecAdd(robot.pos, facingDelta);
  const facingBox = boxAt(state, facingPos);
  if (facingBox >= 0) {
    robot.attachedBoxIndex = facingBox;
    return;
  }

  // Scan: up, right, down, left
  const scanOrder: Direction[] = ['up', 'right', 'down', 'left'];
  for (const dir of scanOrder) {
    const neighbor = vecAdd(robot.pos, DELTAS[dir]);
    const idx = boxAt(state, neighbor);
    if (idx >= 0) {
      robot.attachedBoxIndex = idx;
      return;
    }
  }
}

// --- Main action dispatcher ---
export function applyAction(state: GameState, action: GameAction): boolean {
  switch (action.type) {
    case 'move':
      return tryMove(state, action.direction);
    case 'selectRobot':
      state.selectedRobotIndex = action.id === 'A' ? 0 : 1;
      return true;
    case 'toggleAttach':
      toggleAttach(state);
      return true;
    default:
      return false;
  }
}
