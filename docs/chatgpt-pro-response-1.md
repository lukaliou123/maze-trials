The solver is close. L6 does not look like “you need a fancier search algorithm” so much as “you’re paying for way too many equivalent robot placements and way too many meaningless box stopping points.”

The big move I’d make is this:

**Stop searching the full exact joint state as the primary representation. Search a box-centric abstract state, and keep only the robot information that matters at bottlenecks.**

Before that, there’s one thing I’d audit immediately.

## 1) First: your state key is probably unsafe in JS

You said the full state is packed into a single JS `number`. That is a red flag.

A JavaScript `number` is only exact up to `2^53 - 1`. Even on a 100-cell board, packing 8 positions needs about `log2(100^8) ≈ 53.15` bits. On a 10×14 board it is more like 57 bits. So a plain `number` key can silently collide.

That can do two bad things at once:

* merge distinct states, hurting correctness
* poison duplicate detection, hurting performance exactly when the frontier gets large

For L6, that alone could be a major part of the blow-up.

I’d switch exact state keys to `BigInt`, or to a lossless tuple/string encoding, before doing anything else.

## 2) The restructure I’d use

I would move to a **two-layer solver**:

**High-level search state**

* `R3 position`
* canonical normal-box positions
* **robot bottleneck descriptor**, not exact robot cells

**Low-level feasibility/routing**

* given a proposed macro, decide whether the robots can actually realize it
* cache that result
* validate **per successor**, not only at the very end

The reason this is the right shape is the same reason room/tunnel abstractions and tunnel macros worked so well in Sokoban: most of the search cost is not the hard choice, it is all the irrelevant interleavings around the hard choice. Classic Sokoban work got a lot of mileage from tunnel macros and room/tunnel decomposition, and decoupled search has the same idea more generally: search over the “center” variables and avoid multiplying out leaf interleavings when they are conditionally independent. ([ijcai.org](https://www.ijcai.org/Proceedings/99-1/Papers/082.pdf))

### Concretely: how to abstract the robots

Treat robots as **unlabeled** unless your game gives them different capabilities. If they are mechanically identical, sorting `(R1,R2)` is a free 2× symmetry reduction.

Then represent each robot like this:

* **exact cell** only if it is in a 1-wide tunnel, on an articulation cell, or otherwise in a place where ordering matters
* otherwise just a **room ID**

That keeps the information humans actually use: “do I have a robot on this side of the bottleneck?” not “is robot A on tile (6,4) vs (6,5)?”

For Level 6, the one-tile-wide door corridor into the safe zone is exactly the kind of articulation/tunnel structure where precise robot side matters and room-internal exact positions mostly do not.

## 3) Heuristic: replace `3 * distToExit[R3]` with a route-and-blocker lower bound

Your current heuristic only sees how far R3 is from home. It misses the actual pain: clearing a route.

A cheap admissible lower bound is:

```text
h(s) = shortest path cost from R3 to Exit
       where each step costs 1
       and entering a cell occupied by a normal box adds clearCost[cell]
```

Start with:

```text
clearCost[cell] = 1
```

So the heuristic becomes:

```text
h_route(s) = min over paths P from R3 to Exit of
             (path length of P) + (# normal boxes occupying cells on P)
```

Why this is admissible:

* every step R3 eventually takes costs at least 1 slide step
* every normal box occupying the final chosen route must be moved off that route at least once

So this already captures:

* blockers on R3’s path
* door obstruction
* the fact that “distance alone” is too optimistic

And it is very cheap: a Dijkstra/0-1-style shortest path on at most ~100 cells.

### Stronger version

Precompute a **single-box transport oracle** on the empty board:

* for R3: minimal cost to move R3 from any cell to exit ignoring other boxes
* for a normal box: minimal cost to evacuate a cell to some parking cell, ignoring other boxes and treating the safe zone as forbidden

Then use:

```text
clearCost[cell] = empty-board evacuation cost of a normal box from cell
```

That makes bottleneck cells more expensive than open-room cells, which is exactly what you want.

This is the kind of localized abstraction/PDB idea that actually pays off here. Pattern databases are powerful in Sokoban, but for your game the sweet spot is not a giant global multi-box PDB; it is a small online precompute for one-box transport and maybe tiny bottleneck abstractions. ([ijcai.org](https://www.ijcai.org/Proceedings/16/Papers/100.pdf))

A practical final heuristic is:

```text
h = h_route + max(h_robot_return, h_robot_setup)
```

where `h_robot_return` is a weak lower bound for getting both robots into the safe zone, and `h_robot_setup` is a tiny bound for “does any robot currently have access to the relevant side of the next move?”
I would not obsess over perfect admissibility here; you are already in weighted-A* territory, so ranking quality matters more than proof purity.

## 4) Branching factor: this is probably where the real time goes

Your macro generator still sounds too generous because it allows “slide 1..N”. Many of those stops are strategically meaningless.

I would only generate box moves to **interesting endpoints**:

* tunnel ends
* articulation cells / door cells
* room entrances
* parking cells
* cells that newly clear or newly obstruct the current best R3 route

In a degree-2 corridor, stopping halfway is usually pointless; classic tunnel macros exploit exactly that by collapsing forced motion through a tunnel into one move. ([ijcai.org](https://www.ijcai.org/Proceedings/99-1/Papers/082.pdf))

That change alone can slash branching.

### Also add room/tunnel macros

Preprocess the static wall map into:

* **rooms** = biconnected open regions
* **tunnels** = narrow articulation chains / forced corridors

Then define macros like:

* move a box through a tunnel in one macro
* move a box from a room entrance to a parking slot
* move R3 from one room boundary milestone to the next

You do not have to hard-commit to a single room-graph plan. Use these as preferred operators first, with fallback to the full move set if needed.

## 5) Pruning that should help without becoming too dangerous

You already have anti-reversal pruning. I’d add three more things.

### a) Canonical order for independent room-local moves

If two box moves are in different rooms and do not touch the same bottleneck structure, many of their interleavings are redundant. In planning language, this is a partial-order reduction problem; stubborn-set methods are exactly about pruning commuting operators while preserving completeness. ([cdn.aaai.org](https://cdn.aaai.org/ojs/13526/13526-40-17044-1-2-20201228.pdf))

I would not implement full generic stubborn sets. I would do the domain version:

* if two moves affect disjoint rooms and neither changes the current R3 route bottlenecks
* expand only one canonical order first

### b) Iterative widening for relevance, not one hard relevance filter

You already saw that “only move boxes near R3’s path” is too aggressive. The fix is not to abandon the idea; it is to make it staged.

Use a portfolio like:

1. only R3 moves + moves of boxes on the best current route
2. then also boxes adjacent to that route / in the same room
3. then full move set

Classic Sokoban work explicitly noted that the **control logic** of when to enable an enhancement matters as much as the enhancement itself. That fits your experience exactly. ([ijcai.org](https://www.ijcai.org/Proceedings/99-1/Papers/082.pdf))

### c) Early successor validation, not only end-of-plan validation

Right now, a bad abstract plan can survive all the way to a goal state and only then get rejected by `expandAndValidate()`. That wastes huge chunks of search.

Once you switch to a box-centric abstraction, put a low-level macro feasibility check at **successor generation**:

* “can some robot on the required side realize this push/pull macro?”
* cache the answer by `(box-config, robot-descriptor, macro)`

That will kill infeasible plateaus much earlier.

## 6) Alternative algorithms: what I would and would not switch to

### I would keep best-first search

Weighted A* or greedy best-first with a good duplicate table is still the right family here.

### I would not switch to IDA*

IDA* saves memory, but your domain has:

* lots of transpositions
* expensive reachability/feasibility checks
* large branching unless you compress macros hard

IDA* pays for that by re-expanding constantly. I would only consider it after the abstraction and macro changes, not before.

### I would not prioritize bidirectional search

Your domain is “almost reversible,” but the safe-zone restriction for normal boxes and the end condition with both robots home makes reverse-state generation awkward and easy to get wrong. Engineering cost looks high, payoff looks uncertain.

### I would not use MCTS

The signal is too sparse and the domain structure is too deterministic and combinatorial. You have much better domain knowledge available than MCTS would exploit.

### I *would* use subgoals

But softly:

* identify the room/tunnel milestones on promising R3 routes
* prefer operators that clear the next milestone
* fall back to unconstrained search if needed

That is a much better fit than a hard decomposition that can miss the real solution.

## 7) Pattern databases: yes, but small and local

I would not build a global multi-box PDB.

I would build these instead:

**Worth doing**

* one-box empty-board transport table for R3
* one-box empty-board evacuation table for normal boxes
* maybe a tiny local PDB for the door corridor / bottleneck neighborhood

**Probably not worth doing**

* global PDB over 5–6 movable boxes
* anything that tries to enumerate full board subconfigurations online

A very practical compromise is:

* preprocess the static map once per level
* cache local room subproblems as you encounter them

That stays general, browser-friendly, and level-agnostic.

## 8) The rollout order I’d use

In order of impact:

1. **Fix the state key** so it is exact in JS.
2. **Canonicalize robots as unlabeled** if they are truly identical.
3. **Generate only interesting box endpoints**; add tunnel macros.
4. **Replace exact robot positions with room/tunnel robot descriptors**.
5. **Use route+blocker heuristic** instead of `3 * distToExit`.
6. **Validate macro feasibility at successor generation** and cache it.
7. Add **iterative-widening relevance** and a small **GBFS/WA* portfolio**.

My guess is that steps 1–4 are the real breakthrough. The heuristic helps, but the giant win is cutting away robot-noise states and dead branch-factor.

## 9) What I’d expect for Level 6

Level 6 looks especially favorable for this approach because the safe-zone access is a one-wide articulation chain. That means:

* tunnel macros should be very effective there
* robot abstraction only needs to be exact near that chain
* the blocker heuristic should strongly focus the search on clearing that funnel for R3

So this is not a hopeless “6 boxes is too many” case. It looks much more like a solver-representation mismatch.

Share `src/solver.ts` and I’ll turn this into a concrete TS patch plan with data structures, successor generation, and heuristic code shape.
