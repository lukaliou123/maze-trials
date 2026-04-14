export interface Vec2 {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export type TileKind = 'wall' | 'floor' | 'exit';

export type RobotId = 'A' | 'C';

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
  selectedRobotIndex: number;
  steps: number;
  won: boolean;
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
