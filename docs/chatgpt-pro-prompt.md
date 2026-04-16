# Solver Optimization Consultation

## Game: Maze Trials

A two-robot cooperative puzzle game (TypeScript, browser-based). Two hexapod robots (R1, R2) must navigate a grid maze, move obstacle boxes, rescue an unconscious teammate robot (R3, sealed in a red cargo box), and bring R3 back to a safe "Repair Room" zone. Both R1 and R2 must also return to the safe zone for the level to be complete.

### Core Mechanics
- **Grid**: 7×7 to 10×10 maze area + a 3×3 safe zone below, connected by a 1-tile-wide door
- **Entities**: 2 controllable robots, 1 red buddy box (R3), 2-5 normal obstacle boxes
- **Push**: Robot walks into a box → box moves 1 tile forward (if clear). No chain pushing.
- **Pull (Tow)**: Robot explicitly attaches to an adjacent box (toggle attach), then moves AWAY from it in a straight line → box follows into robot's previous tile.
- **Corner Rule**: Towing ONLY works in a straight line. If the robot tries to turn while towing, the move fails. This means boxes cannot be pulled around corners.
- **Safe Zone Rule**: Normal boxes CANNOT enter the safe zone (only R3 can).
- **Win Condition**: R3 on the Repair Room tile (center of safe zone) AND both R1, R2 in the safe zone.

### What Makes This Different from Standard Sokoban
1. **Pull mechanic** — Boxes can be pulled (towed) as well as pushed, making most single-box operations reversible.
2. **Corner rule on pulling** — Pulling only works in straight lines, preserving puzzle complexity.
3. **Two cooperative robots** — Both positions are part of the game state; they can block each other.
4. **No permanent deadlocks** — Unlike Sokoban, there are no truly irrecoverable states (push+pull is reversible in straight lines). This means dead-state pruning is largely inapplicable.
5. **PSPACE-complete** — Even with pull, Push-Pull block puzzles are proven PSPACE-complete. The reversibility doesn't reduce the complexity class.

---

## Current Solver Architecture

### Search Strategy: Macro-Move Weighted A*

**State**: `(R1_position, R2_position, canonical_box_positions)`
- Normal box positions sorted for canonical encoding (N! symmetry elimination)
- All positions packed into a single JS number as the hash key

**Transitions (macro moves)**:
Each transition = "Robot i walks to box j, then pushes/pulls it 1..N tiles in direction d"
- Push: robot walks behind box, then pushes (box slides forward, robot follows)
- Pull: robot walks adjacent to box, attaches, pulls N tiles (both slide), detaches
- Walk-only: robot walks to safe zone (for the return-home phase)
- Walk cost computed via BFS; total cost = walk_steps + slide_steps

**Heuristic**: `h = 3 × distToExit[R3]` (weighted, using precomputed BFS wall-aware distances)

**Optimizations already implemented**:
1. Canonical encoding of interchangeable normal boxes (N! reduction)
2. Multi-tile slide per macro move (1..N tiles in one transition)
3. BFS reachability cache (per-state: 2 BFS runs cached, all box operations check reachability via lookup)
4. Anti-reversal pruning (don't undo the immediately previous box move)
5. R3 priority tie-breaking (prefer moves that directly affect R3)
6. 10-second timeout + 3M state limit

**Expansion & Validation**:
After A* finds a goal state, the macro plan is expanded into explicit player actions (selectRobot, toggleAttach, move) on a real game state clone. Each action is validated through the actual game logic (`applyAction`). If any step fails, the solution is discarded and search continues.

---

## Performance Data

| Level | Maze | Boxes | Result | Time |
|-------|------|-------|--------|------|
| L1 | 8×12 | 2B+R3 | Solved | <0.1s |
| L2 | 9×14 | 3B+R3 | Solved | ~0.5s |
| L3 | 10×14 | 4B+R3 | Solved | ~0.2s |
| L4 | 8×12 | 3B+R3 | Solved | <0.1s |
| L5 | 9×14 | 4B+R3 | Solved | ~1s |
| L6 | 10×14 | 5B+R3 | **TIMEOUT** | >10s |

Level 6 has 5 normal boxes + R3 = 6 box entities + 2 robots = 8 entities in state. The state space explodes.

### Level 6 Layout
```
##########
#3.#.....#
#..#.###.#
#..B.#...#
#.##.#.#.#
#....B.#.#
#.#B##...#
#.B....#.#
#.#..#.B.#
####.#####
###...####
###.E.####
###1.2####
##########
```

R3 is at top-left (1,1). Exit at (4,11). 5 normal boxes scattered. Door at (4,9).

---

## What We Need Help With

### Primary Question
How should we restructure the solver to handle Level 6 (and harder levels with 5-6 obstacle boxes on a 10×10 grid) within a 10-second browser time budget?

### Specific Areas We'd Like Advice On

1. **Heuristic improvement**: Our heuristic is just `distToExit[R3] × 3`. It doesn't account for:
   - How many boxes block R3's path
   - The cost to move those blocking boxes
   - Whether the door to the safe zone is obstructed
   What would be a good admissible (or weighted-admissible) heuristic for this push-pull variant?

2. **Search space reduction**: With 8 entities in the state, even with canonical encoding, the space is enormous. We tried:
   - Relevance pruning (only move boxes near R3's path) — this was too aggressive and missed valid solutions
   - The anti-reversal pruning helps but is not enough
   What other pruning techniques work for push-pull puzzles?

3. **Alternative search algorithms**: Should we consider:
   - IDA* (saves memory, can search deeper)?
   - Bidirectional search?
   - Subgoal decomposition (plan R3's path first, then clear obstacles)?
   - MCTS or other anytime algorithms?

4. **The "robot position" problem**: A huge portion of our state space comes from tracking two robot positions. Human solvers don't think about exact robot positions — they think about which box to move next. Is there a way to abstract away robot positions during search and only resolve them during plan execution? We tried a box-only search but it produced infeasible plans too often.

5. **Pattern databases**: Could we precompute solutions for common sub-configurations (e.g., "move a single box from A to B on this map") and use those as heuristic values?

### Constraints
- Must run in a browser (JavaScript/TypeScript, single-threaded)
- Target: solve any level with ≤6 boxes on a ≤10×10 grid in <10 seconds
- Solution quality: any valid solution is acceptable (doesn't need to be optimal)
- The solver output must be a sequence of real game actions (selectRobot, toggleAttach, move)

### What We Don't Need
- Neural network / ML approaches (too complex for this stage)
- Offline precomputation of specific levels (we want a general solver)

---

## Source Code Reference

The full solver is in `src/solver.ts` (~575 lines TypeScript). Key functions:
- `solve()` — main entry, runs A* search
- `encodeState()` / `decodeState()` — canonical state encoding
- `canReach()` — BFS pathfinding for robot walking
- `expandAndValidate()` — converts macro plan to real game actions + validates
- `MinHeap` — binary heap priority queue

Game logic is in `src/logic.ts`:
- `applyAction()` — processes one game action (move/selectRobot/toggleAttach)
- `tryMove()` — handles push/pull mechanics with corner rule
- `checkWin()` — verifies R3 on exit + both robots in safe zone
