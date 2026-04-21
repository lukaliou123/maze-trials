# Maze Trials

A two-robot cooperative puzzle game with AI solver, built for demonstrating embodied AI capabilities. Two hexapod rescue robots (R1, R2) navigate a maze, move obstacle boxes, and extract an unconscious teammate (R3) back to the Repair Room.

**Live Demo**: https://pxzhang16.github.io/maze-trials/

## Background

This project is a simulation layer for an embodied AI research platform. The puzzle game serves as:
- **AI Solver testbed** — validate planning algorithms without physical robots
- **Digital twin visualization** — monitor real robot execution in sync
- **Challenge designer** — rapidly prototype new scenarios via ASCII maps

The physical system uses two MINIHEXA hexapod robots controlled by an AI that observes the maze via overhead camera, computes the solution, and issues movement commands.

## Gameplay

R1 and R2 start in a safe zone (charging station / Repair Room) at the bottom of the maze. They must enter the maze through a narrow 1-tile door, navigate obstacles, reach R3 (sealed in a red cargo box), and bring R3 back to the Repair Room. Both robots must also return to the safe zone.

### Controls

| Key | Action |
|-----|--------|
| Q | Select Robot R1 (blue) |
| E | Select Robot R2 (orange) |
| Arrow Keys | Move selected robot |
| Space | Attach / Detach to adjacent box |
| R | Reset level |
| N | Next level (after winning) |

Touch controls are also available for mobile play.

### Rules

- **Pushing**: Move into a box to push it one tile forward (the tile beyond must be empty). No chain pushing.
- **Attaching**: Press Space next to a box. With one adjacent box, attaches automatically. With multiple, attaches to the box in the facing direction (last movement direction).
- **Towing (Pulling)**: While attached, move away from the box in a straight line — the box follows into your previous tile.
- **Corner Rule**: A box cannot be towed around a 90-degree corner. To move a box around a corner, push it to the turn, loop around, and pull from the other side.
- **Safe Zone Rule**: Normal boxes cannot enter the safe zone (they would "explode"). Only R3 can.
- **Win Condition**: R3 on the Repair Room tile + both R1 and R2 in the safe zone. After winning, R3 "revives" with a 4-second animation sequence.

## AI Solver

Click the **AI SOLVE** button to watch the AI find and execute a solution automatically.

### Algorithm

The solver uses **macro-move weighted A\*** with connected-component abstraction:

- **State**: `(robotComponentSignature, R3position, canonicalBoxPositions)` — robots abstracted to connected components, normal boxes encoded with combinatorial number system
- **Transitions**: each search step = "robot walks to box + pushes/pulls it 1..N tiles"
- **Heuristic**: weighted Dijkstra from R3 to both robots and the exit, with penalties for normal boxes blocking likely extraction routes
- **Validation**: every solution is verified through the actual game logic before playback

### Performance

| Level | Boxes | States Explored | Time |
|-------|-------|----------------|------|
| L1: First Rescue | 2B+R3 | 36 | 11ms |
| L2: Narrow Ops | 3B+R3 | 32 | 10ms |
| L3: Deep Extraction | 4B+R3 | 77 | 13ms |
| L4: Corridor Jam | 3B+R3 | 46 | 7ms |
| L5: Lock & Key | 4B+R3 | 40 | 7ms |
| L6: The Gauntlet | 5B+R3 | 79 | 9ms |
| L7: Huarongdao Lite | 4B+R3 | 319 | 19ms |
| L8: Gridlock | 5B+R3 | 1,083 | 26ms |
| L9: Dead End | 4B+R3 | 5,551 | 99ms |
| L10: Red-Blue Siege | 7B+R3 | 207,625 | 2,739ms |
| L11: Red-Blue Lockdown | 8B+R3 | 172,718 | 2,240ms |
| L12: Left-Hand Siege | 7B+R3 | 216,523 | 2,835ms |
| L13: Left-Hand Lockdown | 8B+R3 | 174,898 | 2,228ms |
| L14: Wide Hook | 8B+R3 | 220,635 | 4,148ms |
| L15: Central Chicane | 8B+R3 | 114,210 | 3,793ms |

## Project Structure

```
src/
  types.ts        Type definitions (Vec2, Robot, Box, GameState, etc.)
  constants.ts    Tile size and color constants
  levels.ts       15 handmade ASCII level maps
  state.ts        Level parser — ASCII string → GameState (incl. safe zone computation)
  logic.ts        Game rules (move, push, pull, corner rule, attach, safe zone, win check)
  input.ts        Keyboard listener → GameAction dispatcher
  renderer.ts     Canvas rendering (grid, robots as hexapod beetles, boxes, HUD, win animation)
  solver.ts       AI solver (macro-move A*, connected-component abstraction, expandAndValidate)
  main.ts         Entry point (game loop, AI SOLVE button, touch controls, level select, playback)
  style.css       Styling (incl. touch controls, level select buttons)

docs/
  maze-introd.md                    Original game design spec
  solver-architecture-and-lessons.md  Solver architecture deep-dive and lessons learned
  deep-learning-solver-plan.md      Future plan: neural network heuristic
  chatgpt-pro-prompt.md             Consultation prompt sent to ChatGPT Pro
  chatgpt-pro-response-1.md         ChatGPT Pro response #1
  chatgpt-pro-response-2.md         ChatGPT Pro response #2
  chatgpt-regular-response.md       ChatGPT 5.4 response
  chatgpt-heuristic-consult.md      Heuristic optimization consultation
  chatgpt-heuristic-response.md     Heuristic optimization response

test-solver.ts    Solver benchmark script (15-level regression test)
```

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Run Solver Benchmark

```bash
npx tsx test-solver.ts
```

### Deploy to GitHub Pages

```bash
npx vite build --base='./'
npx gh-pages -d dist
```

## Level Format

Levels are defined as ASCII maps in `src/levels.ts`:

```
# = wall    . = floor    E = exit (Repair Room)
1 = Robot R1    2 = Robot R2    3 = Robot R3 (red buddy box)
B = normal box
```

Structure: maze area on top + 3x3 safe zone at bottom, connected by a 1-tile door.

Example (Level 1):
```
########
#....B.#
#.##.#.#
#.#....#
#.#..#3#
#.#..#.#
#.B..#.#
###.####
##...###
##.E.###
##1.2###
########
```

## Visual Design

- **R1**: Blue hexapod beetle (6 articulated legs, sensor eyes, rotates with movement direction)
- **R2**: Orange hexapod beetle
- **R3**: Unconscious beetle in a red cargo box (legs curled, eyes half-shut). Revives to green on rescue.
- **Normal boxes**: Brown cardboard with cross lines
- **Safe zone**: Semi-transparent green overlay with "HOME" label
- **Repair Room**: Green tile with "REPAIR ROOM" label

## Tech Stack

- TypeScript
- Vite (vanilla-ts template)
- HTML Canvas 2D
- No frameworks, no dependencies beyond Vite

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Vanilla TS, no React | Simpler for keyboard-driven grid game |
| Canvas rendering | Direct pixel control for game graphics |
| Macro-move search | Avoid exploding state space from step-by-step robot movement |
| Connected-component abstraction | Collapse equivalent robot positions, ~100x state reduction |
| Combinatorial encoding | Compact state keys for sorted box positions |
| expandAndValidate | Guarantee solution correctness through real game logic |
| Shared compBuf | Single allocation for flood-fill, reused across all computeComponents calls |
| Pre-allocated BFS buffers | Avoid per-state TypedArray allocation and GC pressure |

## Future Plans

1. **Deep Learning Solver** — Train a CNN/GNN value network to replace hand-crafted heuristic. See `docs/deep-learning-solver-plan.md`.
2. **MINIHEXA Integration** — Robot Bridge layer translating solver actions to physical hexapod commands.
3. **Camera-based Maze Recognition** — Real-time overhead camera → maze state extraction → AI solving.
4. **Self-Evolution Demo** — AI improves its solving ability through experience, visible to audience.

## License

Internal research project.
