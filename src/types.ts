export interface Vec2 {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export type TileKind = 'wall' | 'floor' | 'exit';

export type RobotId = 'R1' | 'R2';

export interface Robot {
  id: RobotId;
  pos: Vec2;
  facing: Direction;
  attachedBoxIndex: number | null;
}

export interface Box {
  pos: Vec2;
  isRedBuddy: boolean;
}

export interface GameState {
  grid: TileKind[][];
  width: number;
  height: number;
  robots: [Robot, Robot];
  boxes: Box[];
  exitPos: Vec2;
  safeZone: Vec2[]; // all floor tiles in 3x3 safe area
  selectedRobotIndex: number;
  steps: number;
  won: boolean;
  winPhase: 0 | 1 | 2; // 0=not won, 1=R3 revived (box gone), 2=show victory
}

export interface LevelDef {
  name: string;
  ascii: string;
}

export type GameAction =
  | { type: 'move'; direction: Direction }
  | { type: 'selectRobot'; id: RobotId }
  | { type: 'toggleAttach' }
  | { type: 'reset' }
  | { type: 'nextLevel' };
