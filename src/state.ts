import type { LevelDef, GameState, TileKind, Robot, Box, Vec2 } from './types';

export function createStateFromLevel(level: LevelDef): GameState {
  const lines = level.ascii.split('\n');
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));

  const grid: TileKind[][] = [];
  const boxes: Box[] = [];
  let robot1: Robot | null = null;
  let robot2: Robot | null = null;
  let exitPos: Vec2 = { x: 0, y: 0 };

  for (let y = 0; y < height; y++) {
    const row: TileKind[] = [];
    for (let x = 0; x < width; x++) {
      const ch = lines[y]?.[x] ?? '#';
      switch (ch) {
        case '#':
          row.push('wall');
          break;
        case 'E':
          row.push('exit');
          exitPos = { x, y };
          break;
        case '1':
          row.push('floor');
          robot1 = {
            id: 'R1',
            pos: { x, y },
            facing: 'up',
            attachedBoxIndex: null,
          };
          break;
        case '2':
          row.push('floor');
          robot2 = {
            id: 'R2',
            pos: { x, y },
            facing: 'up',
            attachedBoxIndex: null,
          };
          break;
        case 'B':
          row.push('floor');
          boxes.push({ pos: { x, y }, isRedBuddy: false });
          break;
        case '3':
          row.push('floor');
          boxes.push({ pos: { x, y }, isRedBuddy: true });
          break;
        default:
          row.push('floor');
          break;
      }
    }
    grid.push(row);
  }

  if (!robot1 || !robot2) {
    throw new Error('Level must have both robot R1 and robot R2');
  }

  // Compute safe zone: 3x3 area centered on exitPos
  const safeZone: Vec2[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const sx = exitPos.x + dx;
      const sy = exitPos.y + dy;
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        const tile = grid[sy][sx];
        if (tile !== 'wall') {
          safeZone.push({ x: sx, y: sy });
        }
      }
    }
  }

  return {
    grid,
    width,
    height,
    robots: [robot1, robot2],
    boxes,
    exitPos,
    safeZone,
    selectedRobotIndex: 0,
    steps: 0,
    won: false,
    winPhase: 0,
  };
}
