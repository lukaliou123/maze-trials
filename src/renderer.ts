import type { GameState, Box, Robot, Vec2 } from './types';
import { TILE_SIZE, COLORS } from './constants';

export interface Renderer {
  render(state: GameState, levelName: string): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')!;

  function render(state: GameState, levelName: string): void {
    canvas.width = state.width * TILE_SIZE;
    canvas.height = state.height * TILE_SIZE + 50; // extra space for HUD

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx, state);
    drawBoxes(ctx, state);
    drawAttachmentLines(ctx, state);
    drawRobots(ctx, state);
    drawHUD(ctx, state, levelName);

    if (state.won) {
      drawWinOverlay(ctx, state);
    }
  }

  return { render };
}

// --- Grid ---
function drawGrid(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const tile = state.grid[y][x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      switch (tile) {
        case 'wall':
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Light edge for 3D effect
          ctx.fillStyle = COLORS.wallLight;
          ctx.fillRect(px, py, TILE_SIZE, 3);
          ctx.fillRect(px, py, 3, TILE_SIZE);
          break;
        case 'floor':
          ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          break;
        case 'exit':
          ctx.fillStyle = COLORS.exit;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Draw exit arrow / marker
          ctx.fillStyle = COLORS.exitGlow;
          ctx.font = `bold ${TILE_SIZE * 0.5}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('EXIT', px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          break;
      }
    }
  }
}

// --- Boxes ---
function drawBoxes(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const box of state.boxes) {
    drawBox(ctx, box);
  }
}

function drawBox(ctx: CanvasRenderingContext2D, box: Box): void {
  const px = box.pos.x * TILE_SIZE;
  const py = box.pos.y * TILE_SIZE;
  const margin = 6;
  const size = TILE_SIZE - margin * 2;

  if (box.isRedBuddy) {
    // Red buddy box
    ctx.fillStyle = COLORS.boxRedBuddy;
    roundRect(ctx, px + margin, py + margin, size, size, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.boxRedBuddyStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Robot head icon
    drawRobotHeadIcon(ctx, px + TILE_SIZE / 2, py + TILE_SIZE / 2, size * 0.35);
  } else {
    // Normal cardboard box
    ctx.fillStyle = COLORS.boxNormal;
    roundRect(ctx, px + margin, py + margin, size, size, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.boxNormalStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cardboard cross lines
    ctx.beginPath();
    ctx.moveTo(px + margin, py + TILE_SIZE / 2);
    ctx.lineTo(px + TILE_SIZE - margin, py + TILE_SIZE / 2);
    ctx.moveTo(px + TILE_SIZE / 2, py + margin);
    ctx.lineTo(px + TILE_SIZE / 2, py + TILE_SIZE - margin);
    ctx.strokeStyle = COLORS.boxNormalStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawRobotHeadIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  // Head circle
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy + 2, r * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy, r * 0.12, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.2, cy, r * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Antenna
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.4);
  ctx.lineTo(cx, cy - r * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.85, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

// --- Robots ---
function drawRobots(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.robots.forEach((robot, i) => {
    drawRobot(ctx, robot, i === state.selectedRobotIndex);
  });
}

function drawRobot(
  ctx: CanvasRenderingContext2D,
  robot: Robot,
  isSelected: boolean
): void {
  const cx = robot.pos.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = robot.pos.y * TILE_SIZE + TILE_SIZE / 2;
  const radius = TILE_SIZE * 0.35;

  // Selection glow
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.robotSelected;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Robot body
  ctx.fillStyle = robot.id === 'A' ? COLORS.robotA : COLORS.robotC;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Robot outline
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Robot label
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${TILE_SIZE * 0.35}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(robot.id, cx, cy);

  // Attachment indicator (small dot)
  if (robot.attachedBoxIndex !== null) {
    ctx.beginPath();
    ctx.arc(cx + radius * 0.6, cy - radius * 0.6, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.attachLine;
    ctx.fill();
  }
}

// --- Attachment Lines ---
function drawAttachmentLines(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  for (const robot of state.robots) {
    if (robot.attachedBoxIndex !== null) {
      const box = state.boxes[robot.attachedBoxIndex];
      if (box) {
        drawDashedLine(ctx, robot.pos, box.pos);
      }
    }
  }
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2
): void {
  const fx = from.x * TILE_SIZE + TILE_SIZE / 2;
  const fy = from.y * TILE_SIZE + TILE_SIZE / 2;
  const tx = to.x * TILE_SIZE + TILE_SIZE / 2;
  const ty = to.y * TILE_SIZE + TILE_SIZE / 2;

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = COLORS.attachLine;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.restore();
}

// --- HUD (drawn below the grid) ---
function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  levelName: string
): void {
  const hudY = state.height * TILE_SIZE;
  const hudH = 50;

  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(0, hudY, state.width * TILE_SIZE, hudH);

  ctx.font = 'bold 16px monospace';
  ctx.textBaseline = 'middle';
  const cy = hudY + hudH / 2;

  // Level name
  ctx.fillStyle = COLORS.hudText;
  ctx.textAlign = 'left';
  ctx.fillText(levelName, 10, cy);

  // Selected robot
  const selRobot = state.robots[state.selectedRobotIndex];
  const robotColor =
    selRobot.id === 'A' ? COLORS.robotA : COLORS.robotC;
  ctx.fillStyle = robotColor;
  const mid = (state.width * TILE_SIZE) / 2;
  ctx.textAlign = 'center';
  ctx.fillText(
    `Robot: ${selRobot.id}` +
      (selRobot.attachedBoxIndex !== null ? ' [ATTACHED]' : ''),
    mid,
    cy
  );

  // Step counter
  ctx.fillStyle = COLORS.hudText;
  ctx.textAlign = 'right';
  ctx.fillText(`Steps: ${state.steps}`, state.width * TILE_SIZE - 10, cy);
}

// --- Win Overlay ---
function drawWinOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  const w = state.width * TILE_SIZE;
  const h = state.height * TILE_SIZE;

  ctx.fillStyle = COLORS.winOverlay;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = COLORS.winText;
  ctx.font = `bold ${TILE_SIZE * 0.6}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LEVEL COMPLETE!', w / 2, h / 2 - 20);

  ctx.font = `${TILE_SIZE * 0.3}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Press N for next level, R to restart', w / 2, h / 2 + 25);
}

// --- Utility: rounded rectangle ---
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
