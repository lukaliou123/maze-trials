# Maze Trials

A top-down grid-based puzzle game built with TypeScript and HTML Canvas. Control two rescue robots to navigate a maze, move boxes to clear paths, and extract a stranded teammate to the exit.

## Gameplay

Two robots (A and C) are trapped in a maze with their unconscious teammate sealed inside a red cargo box. Players must cooperate between the two robots — pushing and pulling cardboard boxes to open routes — and deliver the red buddy box to the exit tile.

### Controls

| Key | Action |
|-----|--------|
| Q | Select Robot A |
| E | Select Robot C |
| Arrow Keys | Move selected robot |
| Space | Attach / Detach to adjacent box |
| R | Reset level |
| N | Next level (after winning) |

### Rules

- **Pushing**: Move into a box to push it one tile (the tile beyond must be empty).
- **Attaching**: Press Space next to a box to attach. Press again to detach. Attachment is always explicit — never automatic.
- **Towing (Pulling)**: While attached, move away from the box in a straight line — the box follows into your previous tile.
- **Corner Rule**: A box **cannot** be towed around a 90-degree corner. The robot, box, and movement direction must stay collinear. To move a box around a corner, push it to the turn, loop around, and pull from the other side.
- **Win Condition**: The level is complete when the red buddy box reaches the exit tile.

## Project Structure

```
src/
  types.ts        Type definitions (Vec2, Robot, Box, GameState, etc.)
  constants.ts    Tile size and color constants
  levels.ts       3 handmade ASCII level maps
  state.ts        Level parser — ASCII string → GameState
  logic.ts        Core game logic (move, push, attach, tow, corner rule, win check)
  input.ts        Keyboard listener → GameAction dispatcher
  renderer.ts     HTML Canvas rendering (grid, boxes, robots, HUD, win overlay)
  main.ts         Entry point — wires input, logic, and rendering together
  style.css       Minimal styling
```

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Tech Stack

- TypeScript
- Vite (vanilla-ts template)
- HTML Canvas 2D

## Level Format

Levels are defined as ASCII maps:

```
# = wall    . = floor    A = Robot A    C = Robot C
B = box     X = red buddy box           E = exit
```

Example:

```
###########
#A..B....E#
#.#.#.##..#
#.#..X.#C.#
#...B.....#
###########
```
