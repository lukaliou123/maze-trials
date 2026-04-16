My take: don’t start by replacing A* with a different frontier manager. Level 6 is blowing up because the solver is over-modeling the wrong thing. The expensive variable is not “which exact tile is robot 1 on?” It’s “what box/corridor commitment matters next?” Classic Sokoban solvers got big gains from quotienting player positions by reachability, plus tunnel/goal macros and relevance-based localization; stronger later heuristics also decomposed instances around mandatory cut squares and used small PDBs on those subproblems. That is the direction I’d borrow here. ([webdocs.cs.ualberta.ca](https://webdocs.cs.ualberta.ca/~jonathan/publications/ai_publications/tcs.pdf))

On your Level 6 map, the static topology already tells the story: the one-tile door corridor and nearby articulation cells suggest a room/tunnel abstraction, so the main redesign is shifting search away from exact robot parking spots toward box commitments and area accessibility. The static topology already tells the story: R3’s route to the exit is funneled through the articulation chain around `(4,8) -> (4,9) -> (4,10) -> (4,11)`. So the solver should treat “status of that protected corridor” as first-class, and exact robot tiles as second-class.

## 1) Change the state key first

I would stop keying the closed list by exact `(R1pos, R2pos, boxes)`.

Use this instead:

`stateKey = (phase, R3pos, canonicalNormalBoxes, robotReachabilitySignature)`

Where:

- `phase` = which mandatory landmark/cut-square R3 has already crossed.
- `canonicalNormalBoxes` = what you already do.
- `robotReachabilitySignature` = not exact robot tiles, but the multiset of free-space components the robots occupy under the current box layout.
- keep **1–4 concrete witness placements** per abstract state, so generation still stays executable.

Why this is the right abstraction: in Sokoban, merging states by stone layout plus **equivalent man locations under reachability** can reduce search by several orders of magnitude. Your two-robot version should do the same idea, just with a richer signature than one player. ([webdocs.cs.ualberta.ca](https://webdocs.cs.ualberta.ca/~jonathan/publications/ai_publications/tcs.pdf))

The practical version is:

- treat robots as **unlabeled** if they are mechanically identical; sort them or store only component counts.
- for each abstract state, retain a tiny nondominated witness set:
  - same box layout
  - same phase
  - one witness per robot-component multiset or per setup-access bitmask
- expand children from witnesses, not from the abstract state directly

That gives you most of the box-only reduction without the “box-only search produced infeasible plans” problem. You are no longer pretending robot positions don’t matter; you are saying only a few robot placements per box state matter.

## 2) Split the search by mandatory landmarks

Do not search “solve whole level” in one monolithic space.

Precompute the block-cut tree of the static board, rooted at the exit. Then define mandatory landmarks for R3:

- next cut square / protected corridor entrance
- door tile
- safe-zone entrance
- exit tile

For Level 6, a natural phase sequence is roughly:

1. clear and reach the north side of the door corridor
2. move R3 through the corridor to the safe-zone entrance
3. place R3 on `E`
4. bring both robots home

This is not brittle relevance pruning. It is exploiting a fact of the map: every valid solution must move R3 through those cut squares in that order. Sokoban work on cut-square decomposition and multiple intermediate goal states is very much the same idea. ([webdocs.cs.ualberta.ca](https://webdocs.cs.ualberta.ca/~holte/Publications/ijcai2016-sokoban.pdf))

The big win is that every phase gets a much smaller “active area,” which means better heuristics, fewer box moves worth considering, and fewer robot placements worth distinguishing.

## 3) Replace the heuristic with a corridor-aware one

Your current `3 * distToExit[R3]` is basically blind to prerequisite work. I’d use two heuristics:

### A safe lower bound

For the current phase target `t`:

- `h0 = staticDist(R3, t)`
- `hcut = min occupied vertex-cut cost between R3 and t`
- `hcorr = sum relaxed evacuation costs for normal boxes currently on the protected corridor`
- `hhome = final phase only: dist(robotA, safeZone) + dist(robotB, safeZone)`

Then:

`h_adm = max(h0, hcut, hcorr, hhome)`

How to compute the new pieces:

`hcut`: build a tiny node-split graph on the current board. Give occupied normal-box tiles weight 1, empty tiles weight 0/∞ as appropriate, and compute the minimum vertex cut between R3 and the next landmark. That lower-bounds how many boxes must move at least once to make some path exist.

`hcorr`: precompute, for each tile on a protected corridor, the relaxed minimum box-step cost to evacuate a box from that tile to any legal parking tile outside that corridor and outside the safe zone, ignoring other boxes. Because any normal box sitting on a mandatory corridor tile must be removed, that sum is admissible.

This is the first heuristic you have that directly answers “how many blockers are in the way?” and “how hard is the door corridor to clear?”

### A stronger search-ordering score

Because you only need *a* solution, not an optimal one, use a more aggressive ordering score too:

`h_focus = h0 + 2*hcut + hcorr + setupCost`

Where `setupCost` is a cheap estimate of the nearest robot getting to a useful manipulation position.

Use `h_adm` for pruning / incumbent checks and `h_focus` for queue ordering.

## 4) Keep A* only as one queue; add novelty search

I would not switch to plain IDA* as the main engine. In domains with lots of transpositions, IDA* redoes too much work; A*+IDA* is mainly attractive when A* is hitting a memory wall, not when the abstraction itself is poor. ([ijcai.org](https://www.ijcai.org/proceedings/2019/0168.pdf))

I also would not do full bidirectional search. The backward goal set is too loose: “R3 on exit, both robots in safe zone, normal boxes anywhere legal” is a messy reverse frontier.

What I would do is a **dual-queue satisficing search**:

- Queue A: weighted A* on `g + w * h_focus`
- Queue B: BFWS-style novelty queue on abstract features

BFWS works by ordering states lexicographically by novelty and then heuristic values, and the whole point is to mix exploration with goal-directed search when heuristics plateau. That is exactly your situation: many useful moves do not immediately improve `distToExit(R3)`. ([cdn.aaai.org](https://cdn.aaai.org/ojs/19780/19780-40-23793-1-2-20220613.pdf))

Good novelty features here are tiny and cheap:

- current phase / farthest landmark reached by R3
- door free?
- protected-corridor-clear bitmask
- count of parked boxes
- “at least one robot north of door” / “south of door”
- “R3 has line access to next landmark”

You can alternate queues 3:1 or 1:1. In practice this is much more useful than picking one “best” algorithm.

## 5) Slash branching in move generation

Right now you generate too many semantically equivalent box moves.

You already macro-slide 1..N. I would go further and generate only **endpoint macros**:

- maximal slide in that direction
- first slide that clears a protected corridor / door tile
- first junction / branch point
- first legal parking tile
- next landmark position, if the moved box is R3

Do **not** generate every intermediate stop in a straight corridor unless it changes topology.

This is straight out of the Sokoban tunnel-macro mindset: once a box enters a forced corridor, intermediate states are mostly noise. Junghanns and Schaeffer used tunnel macros, goal macros, and relevance localization exactly to cut this kind of branching. ([webdocs.cs.ualberta.ca](https://webdocs.cs.ualberta.ca/~jonathan/publications/ai_publications/tcs.pdf))

Also, don’t hard-prune “irrelevant” boxes globally. Use **iterative widening by influence** instead:

- pass 1: expand only boxes on the protected corridor or adjacent basins
- pass 2: include boxes one topological step farther
- pass 3: full generation

That keeps completeness in practice while still exploiting locality. Relevance cuts in Sokoban were based on topological influence rather than plain geometric distance, which is the right model for your door/corridor structure too. ([webdocs.cs.ualberta.ca](https://webdocs.cs.ualberta.ca/~jonathan/publications/ai_publications/tcs.pdf))

## 6) Pattern databases: yes, but tiny and topology-based

A giant 6-box PDB is not where I’d spend time in the browser.

A useful PDB here is one of these:

1. **single-box relaxed transport / evacuation tables**  
   Reverse-search once per map:
   - box from tile `a` to tile `b`
   - box from corridor tile `a` to any parking tile
   - respect walls, safe-zone ban for normal boxes, and your push/pull/tow geometry

2. **tiny phase PDBs** over  
   `R3 + 2 blocker boxes + phase`

   Reverse-search from “R3 at next landmark, blockers outside protected corridor.”

Pattern databases are exact abstract-distance lookup tables, partial PDBs are specifically meant to work under memory limits, and complementary PDB work supports combining several small abstractions instead of betting on one huge table. Sokoban’s later heuristics also explicitly use PDBs with intermediate cut-square states in transportation-style domains. ([webdocs.cs.ualberta.ca](https://webdocs.cs.ualberta.ca/~holte/Publications/sara2007anderson.pdf))

So yes: PDBs can help. But the practical version for you is “many tiny map-specific abstractions,” not “one heroic global database.”

## What I would implement, in order

1. **Robot symmetry + robot reachability signature + witness set**
2. **Phase decomposition on exit-rooted cut squares**
3. **Protected-corridor heuristic** (`hcut` + `hcorr`)
4. **Endpoint-only macro generation**
5. **Dual queue: weighted A* + novelty**
6. **Tiny relaxed transport / evacuation PDBs**

That combination directly attacks all four pain points at once:

- fewer duplicate states
- fewer children per node
- better guidance on blocker-clearing work
- less wasted search on robot micro-positioning

## What I would not prioritize

- plain IDA* as the main solver
- full bidirectional search
- MCTS
- global deadlock tables borrowed from Sokoban

Your domain is reversible enough that classic deadlock machinery is not the payoff. The payoff is **topology-aware progression** and **robot-position abstraction with witnesses**.

## One concrete code-level reshape

In your current structure, I’d aim for this split:

- `encodeState()` → encode `(phase, R3, sortedBoxes, robotSig)` instead of exact robots
- transposition entry → small array of concrete robot witnesses
- `canReach()` → cache by `(boxMask, actingRobotWitness)` and also expose component IDs / setup-tile bitmasks
- successor generation → endpoint macros only
- `solve()` → run per-phase search with shared incumbent
- `expandAndValidate()` → still validate full action stream at the end, but also validate each macro against the stored witness during generation so infeasible abstractions die early

That should be enough to get Level 6 from “state explosion” into “focused corridor-clearance search.”

Posting `src/solver.ts` would make the next step very concrete: mapping this into your actual `encodeState`, macro generator, and open/closed-list logic
