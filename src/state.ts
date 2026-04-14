import type { LevelDef, GameState, TileKind, Robot, Box, Vec2 } from './types';

export function createStateFromLevel(level: LevelDef): GameState {
  const lines = level.ascii.split('\n');
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));

  const grid: TileKind[][] = [];
  const boxes: Box[] = [];
  let robotA: Robot | null = null;
  let robotC: Robot | null = null;
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
        case 'A':
          row.push('floor');
          robotA = {
            id: 'A',
            pos: { x, y },
            facing: 'down',
            attachedBoxIndex: null,
          };
          break;
        case 'C':
          row.push('floor');
          robotC = {
            id: 'C',
            pos: { x, y },
            facing: 'down',
            attachedBoxIndex: null,
          };
          break;
        case 'B':
          row.push('floor');
          boxes.push({ pos: { x, y }, isRedBuddy: false });
          break;
        case 'X':
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

  if (!robotA || !robotC) {
    throw new Error('Level must have both robot A and robot C');
  }

  return {
    grid,
    width,
    height,
    robots: [robotA, robotC],
    boxes,
    exitPos,
    selectedRobotIndex: 0,
    steps: 0,
    won: false,
  };
}
