content = """The fastest path to Level 6 is not “a slightly better heuristic.” It is a **state-space redesign**.

Right now your solver is paying for three expensive things at once:

1. **Exact robot coordinates**
2. **All slide lengths 1..N**
3. **A heuristic that only cares about R3 distance, not corridor clearance**

That combination is why the 5-box level blows up.

## What I would change first

### 1) Make the search state mostly about **boxes**, not exact robot squares

For macro search, exact robot positions are usually the wrong granularity. In Sokoban-like solvers, a standard trick is to normalize the player to the reachable region because many different player squares imply the same move set. That same idea is even more important here. Sokoban work also got big gains from **tunnel macros** and **relevance cuts**, both of which are basically attempts to stop searching unimportant local detail. ([ijcai.org](https://www.ijcai.org/Proceedings/99-1/Papers/082.pdf?utm_source=chatgpt.com))

For your game, I would represent robots as:

- **box layout**
- **which free-space component each robot is in**
- maybe one extra bit: whether both robots are in the same component and whether that component has at least 2 free cells

Instead of `(r1Exact, r2Exact, boxes)`, use something like:

`(boxes, comp(r1), comp(r2), lastMoveSignature)`

Why this works:
- A macro only needs to know whether some robot can reach the required stance square for the next push/pull.
- For most states, all exact squares inside the same connected component are equivalent for *feasibility*.
- You can still keep exact squares as a **secondary label** for the cheapest representative seen so far, but do not make them part of the transposition key.

This is the single biggest likely win.

### Dominance rule to add
For the same `box layout`, if you already reached a state with:
- the same robot components, or
- robot components that can do a superset of the same box operations,
- and lower or equal `g`

then prune the new state.

That gives you a **Pareto frontier per box layout**, instead of exploding over harmless robot shuffles.

---

## 2) Stop generating all slide lengths 1..N unless the stop point is meaningful

This is probably your second biggest branching-factor leak.

Right now each “move box in direction d” branches into every intermediate stop. Most of those endpoints are strategically meaningless.

Replace that with **selective stop points**:

- corridor end
- junction / intersection
- immediately before obstacle
- immediately after obstacle cleared
- door-adjacent cells
- cells that change whether R3 has a path/corridor to the door
- cells that change whether another robot can access a needed stance square

This is essentially a domain-specific tunnel macro. Sokoban solvers got major gains from collapsing forced corridor motion into one macro. ([ijcai.org](https://www.ijcai.org/Proceedings/99-1/Papers/082.pdf?utm_source=chatgpt.com))

A practical rule:

For each box+direction, generate only:
- the **maximal** slide,
- plus any endpoint where one of the following changes:
  - the box enters/leaves the current best R3→door corridor
  - the box reaches a junction cell
  - the move creates/removes adjacency to R3, door, or another box

That usually cuts branching hard without hurting completeness if your “interesting stop” test is broad enough.

---

## 3) Split the problem into phases around the **door articulation**

Your map has a 1-tile door between maze and safe zone, and normal boxes cannot enter the safe zone. That is a huge structural gift.

A very effective exact decomposition is:

### Phase A
Get R3 to a small set of **door staging states**  
Examples:
- R3 on the tile above the door
- R3 aligned so one more push/pull gets it through

### Phase B
Move R3 through the door into the repair room

### Phase C
Walk both robots home

Phase C is tiny. Phase B is tiny-ish. Nearly all difficulty is Phase A.

So instead of searching directly to the final win state, search first for one of maybe **2–6 staging states** around the door. That reduces goal ambiguity and makes your heuristic much sharper.

Because the door is unique, this is not an arbitrary human-style decomposition. Any solution must pass through that bottleneck.

---

## Better heuristic: what I’d actually use

Your current `3 * distToExit[R3]` is too weak because it ignores corridor clearance.

I’d use **two heuristics**:

### A. Cheap lower bound for the anchor queue
Use:

`h_lb = dR3 + blockersLB + doorLB + homeLB`

Where:

- `dR3` = shortest-path distance from R3 to door/repair tile **ignoring boxes**
- `blockersLB` = minimum number of normal boxes that must be displaced at least once to open *some* R3→door path
- `doorLB` = +1 if the door cell or required staging cell is occupied by a normal box
- `homeLB` = lower bound for robots returning to safe zone, only once R3 is already at/inside the door zone

### How to compute `blockersLB`
Run a **0–1 BFS** from R3 to the door:
- moving through an empty cell costs `0`
- moving through a normal-box cell costs `1`
- walls blocked
- safe-zone illegal cells for normal boxes handled accordingly

That gives the minimum number of boxes intersecting any corridor R3 could use.

This is a solid lower bound: every box on that chosen corridor must be moved off it at least once.

It is cheap and much better than raw distance.

### B. Aggressive ranking heuristic for a greedy queue
For ordering only, not for correctness:

`h_rank = 3*dR3 + 8*blockersLB + 4*doorCongestion + nearestRobotToRelevantBox`

This is intentionally biased toward:
- clearing a corridor to the door,
- opening the bottleneck,
- moving the robot that can act soonest.

Because you only need *some* solution fast, I would not rely on one pure admissible heuristic. I would run an **anchor queue + aggressive queue** together.

---

## Search algorithm: keep best-first, but make it multi-queue

I would **not** switch to IDA*.

IDA* saves memory, but in your setting it redoes too much work, and your big gains are going to come from transpositions, dominance, and rich macros. Those all play more naturally with best-first search. Sokoban research used IDA* effectively, but only with a heavy stack of domain enhancements; your browser budget and macro setup favor best-first much more. ([svn.sable.mcgill.ca](https://svn.sable.mcgill.ca/sable/courses/COMP763/oldpapers/junghanns-01-sokoban.pdf?utm_source=chatgpt.com))

What I would do instead:

### Use two open lists
- **Anchor queue**: Weighted A* with `h_lb`
- **Greedy queue**: best-first with `h_rank`

Expand, say, 1 node from anchor for every 4–8 nodes from greedy.

That gives you:
- robustness from the anchor
- speed from the greedy queue

This usually beats a single WA* when the heuristic is informative but imperfect.

---

## The robot-position problem: how to abstract it without lying to yourself

You already noticed that “box-only search” makes infeasible plans. That’s because box-only loses action-side feasibility.

So the right abstraction is **not** “ignore robots.”  
It is: **store only the robot information that changes future box-move feasibility.**

That means:

### Store robot components, not robot cells
For each state:
1. Compute connected components of free cells under current box layout.
2. Map each robot to its component.
3. For each candidate box move, ask:
   - does any robot component contain the required stance square?
   - after executing the macro, what are the new robot components?

You can derive post-move components from the new layout and the robots’ new endpoint cells.

### Optional refinement
If component-only abstraction is occasionally too coarse in narrow corridors, keep a tiny extra signature:
- for each robot, the set of reachable **interaction stances** around “relevant” boxes and door cells

In practice that means a bitmask over maybe 20–40 stance squares, not 100 board cells.

That still collapses far more than exact coordinates.

---

## Pruning that still works in push-pull puzzles

You’re right that classic Sokoban deadlock pruning is much less useful here. But you still have good pruning options.

### 1) Capability dominance
Best practical prune in your domain.

For the same box layout, if a prior state can realize every relevant next macro your new state can, at lower `g`, prune the new one.

### 2) No-progress box moves
Prune a box move if it does **all** of these:
- leaves the box in the same static corridor/junction region,
- does not reduce `blockersLB`,
- does not unblock the door,
- does not create any new reachable interaction stance for either robot,
- is not moving R3

That catches a lot of “wiggle a box around for nothing.”

### 3) Iterative relevance window
Your earlier relevance pruning failed because it was too absolute. Make it **iterative widening** instead:
- first search only moves affecting boxes on or near the current best corridor/cut to the door
- if no solution by budget slice, widen the relevance radius
- final fallback is unrestricted

That keeps completeness in practice while still getting human-like focus early.

### 4) Stronger anti-reversal
Generalize your current immediate undo prune to a short tabu signature:
- same box moved back into same corridor segment within 2 plies
- unless the move changed `blockersLB` or door status

---

## Pattern DBs: not the first thing I’d build

A full pattern database over multi-box states is unlikely to be the best ROI here.

What *is* worth precomputing:

### A. Single-box relocation table on the static map
For each ordered pair `(fromCell, toCell)`:
- lower bound on moving one box there with walls only
- maybe distinguished by push-only / pull-capable / corridor class

This helps both:
- heuristic estimates for “clear this blocker”
- macro generation

### B. Door-local mini PDB
Precompute a tiny table for a 5×5 or 6×6 window around the door with:
- R3
- up to 2 normal boxes
- one robot-stance abstraction

That is small enough to be practical and directly targets the level bottleneck.

### C. Static corridor graph
Precompute:
- junction cells
- corridor segments
- articulation regions
- all stance squares from which each box cell can be pushed/pulled in each direction

This is probably more valuable than a classic PDB.

---

## What I’d implement in order

### Highest ROI
1. **Robot abstraction by connected component / stance mask**
2. **Selective slide endpoints instead of 1..N everywhere**
3. **Door-phase decomposition**
4. **0–1 BFS blocker heuristic**
5. **Multi-queue search**

### After that
6. Capability dominance per box layout
7. Iterative relevance widening
8. Static corridor/junction preprocessing
9. Door-local mini PDB

---

## A concrete redesign sketch

### State key
`(canonicalBoxes, r3Pos, compSigOrStanceMask, phase, lastMoveSig)`

Where:
- `canonicalBoxes` includes R3 separately from normal boxes
- `compSigOrStanceMask` is either:
  - sorted `(compR1, compR2)`, or
  - a compressed bitmask of reachable “interaction stances”
- `phase ∈ {approachDoor, crossDoor, returnHome}`

### Successor generation
For each relevant box:
- enumerate push/pull directions
- enumerate only meaningful endpoints
- discard if required stance not in any robot-reachable interaction set
- score move by:
  - whether it reduces `blockersLB`
  - whether it helps R3 corridor
  - whether it opens the door region
  - whether it moves R3

### Heuristics
- anchor: `h_lb`
- greedy: `h_rank`

### Search
- expand greedy most of the time
- anchor often enough to avoid drifting
- stop on first valid expanded-and-validated action plan

---

## Direct answers to your numbered questions

### 1) Heuristic improvement
Best practical choice:
- `dist(R3, door/repair)` plus
- **minimum blockers on any R3→door corridor** via 0–1 BFS
- plus small door/home lower bounds

That is cheap, domain-aware, and much stronger than distance alone.

### 2) Search space reduction
Most effective:
- robot abstraction by component/stance mask
- dominance per box layout
- tunnel/junction macro endpoints
- iterative relevance widening
- no-progress move pruning

### 3) Alternative algorithms
- **No** to IDA* as the main fix
- **No** to bidirectional as the main fix
- **Yes** to hierarchical / phased search
- **Yes** to multi-queue best-first
- **No** to MCTS for this stage

### 4) Robot position problem
Yes: abstract them away, but only to **reachability capabilities**, not completely.

### 5) Pattern databases
Only small, targeted ones:
- single-box relocation
- door-local PDB  
Not giant general multi-box PDBs.

---

## My prediction

If you do only these three:
- robot abstraction,
- meaningful stop points,
- blocker-aware corridor heuristic,

you’ll probably turn Level 6 from “timeouts often” into “usually solves,” without needing a full solver rewrite.

If you want, I can turn this into a concrete `solver.ts` refactor plan with data structures and pseudocode for the new state key, `generateMacros`, and the 0–1 BFS blocker heuristic.
