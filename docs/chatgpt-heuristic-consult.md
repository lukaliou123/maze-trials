I’m narrowing this to the heuristic/tie-break layer only and treating your search architecture as fixed, because your current solver is already in the “good bones” zone. The pattern in your results screams that the blocker term is useful as information, but too blunt and too strong to live inside the main `f` value.

Yes. The pattern in your results is pretty clear:

**your added heuristics are informative, but not trustworthy enough to sit inside the main weighted-A* score.**

That is why they help some levels and hurt others. With `distToExit * 3`, your search already has a very strong global direction. When you add a coarse blocker term directly into `f`, it stops being a gentle nudge and starts rerouting the entire search over low-resolution noise.

So my main recommendation is:

# Keep the main heuristic simple. Move the “smart” stuff into deterministic tie-breaking.

## The short version

Use this:

```ts
primary:   f0 = g + 3 * distToExit[r3]
secondary: smaller distToExit[r3]
tertiary:  smaller mandatoryBlockers
quaternary: prefer states where the last macro affected R3
fifth:     prefer larger g   // i.e. smaller h among equal-f0 states
```

And do **not** add blocker count into `f` unless it is tiny and very localized.

That is the lowest-risk way to improve all levels without blowing up L3/L7 again.

---

# Why your blocker term makes some levels worse

Your observations are exactly what I’d expect in a weighted best-first search.

## 1) The blocker feature is too coarse

If blocker count is usually `0`, `1`, or `2`, then it is not acting like a precise estimate. It is acting like a **routing bias**.

That is fine as a tie-breaker. It is dangerous as an additive term.

## 2) Weighted A* amplifies bad secondary information

With:

```ts
f = g + 3 * dist + blockerPenalty
```

the search is already aggressively chasing low `dist`. If `blockerPenalty` is even modest, it can dominate the ordering inside huge plateaus and pull the search toward “clean-looking” but strategically worse regions.

That fits L3/L7 perfectly: lots of superficially similar routes, where “few blockers now” does not equal “less total work later.”

## 3) Per-state BFS is too expensive for a feature that is not reliable enough

Even a good dynamic feature has to earn its CPU cost. Yours is doing the opposite:

* higher compute cost
* lower ranking stability

That is almost always a sign it should move out of the primary heuristic.

---

# Direct answers to your questions

## 1) Should blocker penalty be added to `distToExit`, or used only as tie-breaking?

**Use it as tie-breaking, not as an additive term.**

That is my strongest recommendation.

So prefer:

```ts
key = (
  g + 3 * distToExit[r3],
  distToExit[r3],
  mandatoryBlockers,
  lastMoveAffectedR3 ? 0 : 1,
  -g
)
```

not:

```ts
g + 3 * distToExit[r3] + blockerCount * W
```

### Why

Because your blocker signal is:

* low resolution
* map-dependent
* sometimes misleading
* expensive when computed dynamically

Those are exactly the properties of a feature that should refine ties, not steer the whole search.

### A useful rule of thumb

A feature belongs in the main heuristic only if:

* it correlates strongly with true remaining cost
* it helps on most maps
* it is reasonably stable under local rearrangements

Your blocker count is not there yet.

---

## 2) Is there a way to precompute a better heuristic table without per-state BFS?

Yes, but I would keep it **static and structural**, not configuration-aware.

The best precomputable signals here are about the map’s **funnel geometry**, especially the door bottleneck.

## Recommendation: precompute three O(1) features per cell

### A) `distToExit[cell]`

You already have this. Keep it as the primary heuristic term.

### B) `phase[cell]`

A coarse structural progress measure:

* same room / tunnel decomposition idea
* number of bottleneck milestones remaining between `cell` and the exit

For example:

* “deep maze room”
* “approach corridor”
* “door corridor”
* “safe zone”

This is not a distance. It is a **progress class**.

Use it as a tie-breaker:

```ts
prefer smaller phase[r3]
```

This tends to help because all solutions must pass through the same door funnel.

### C) `backboneDeviation[cell]`

Pick one deterministic shortest-path tree from every cell to exit. For each cell, precompute:

* whether it is on the canonical backbone
* or its deviation cost from that backbone

Then tie-break toward states where R3 is on or near the backbone.

This is cheap and often better than blocker count because it rewards actual geometric progress without pretending to know future box movement cost.

---

# The best low-cost blocker signal: count only blockers in mandatory cells

Do **not** count blockers on “some best path.”
Do **not** run 0-1 BFS per state.

Instead, precompute a tiny static set of cells that matter most.

## Suggested feature: `mandatoryBlockers`

Count normal boxes in:

* the door cell
* the door approach corridor
* any 1-tile tunnel segment that every viable R3 route must pass through

On your maps, this is likely a very small set.

Then:

```ts
mandatoryBlockers = number of normal boxes in mandatoryFunnelSet
```

This is cheap:

* no per-state BFS
* just membership checks over 2–8 critical cells
* with ≤5 normal boxes, effectively O(boxes), which is constant here

This feature is much safer than “minimum blockers on any path,” because it focuses on genuinely unavoidable congestion.

---

## 3) What deterministic tie-breaking strategy works well?

Yes. This is where I think your next gains are.

I would use a **lexicographic queue key**, not random tie-breaking.

## My recommended key order

```ts
1.  g + 3 * distToExit[r3]
2.  distToExit[r3]
3.  mandatoryBlockers
4.  phase[r3]
5.  lastMoveAffectedR3 ? 0 : 1
6.  -g
7.  insertionOrder
```

### Why this order

### 1. `g + 3 * dist`

Keep the current global behavior.

### 2. smaller `dist`

Inside equal-`f` plateaus, prefer states that are literally closer to the exit.

### 3. smaller `mandatoryBlockers`

Only break ties with blocker info where it is actually relevant.

### 4. smaller `phase`

Favor crossing structural bottlenecks sooner.

### 5. prefer recent R3 moves

This is a good domain tie-break. It encourages momentum without distorting the search.

### 6. prefer larger `g`

This is a standard best-first tie-break trick. Among equal `f`, favoring larger `g` means favoring smaller `h`, which tends to push search deeper along a promising contour instead of thrashing broadly across a plateau.

### 7. stable insertion order

Keep the whole thing deterministic.

---

## Of the options you listed

### Prefer states where R3 moved most recently

**Good as a late tie-breaker.**
Not strong enough for primary ordering.

### Prefer lower blockerCount

**Good only if it is a mandatory-funnel blocker count.**
I would not use “minimum blockers on any path” here.

### Prefer states where R3 is on the precomputed ideal path

**Also good.**
This is basically the `backboneDeviation` idea. Very cheap and usually less misleading than dynamic blocker penalties.

If I had to pick two low-risk tie-breakers, I’d pick:

1. `mandatoryBlockers`
2. `backboneDeviation` or `phase`

---

## 4) Should you use a dual-queue approach?

Possibly, yes — but only after trying lexicographic tie-breaking first.

Right now you do not have a heuristic problem so much as a **queue-ordering problem inside large plateaus**.

A dual-queue setup can help, but it is more machinery than you probably need.

## What I would try first

A single queue with lexicographic keys:

* same primary `f`
* smarter deterministic secondary criteria

That is the simplest, safest upgrade.

## If you still want a portfolio/dual-queue

Use:

### Queue A: conservative

```ts
(g + 3 * dist, dist, -g)
```

### Queue B: aggressive

```ts
(g + 3 * dist, mandatoryBlockers, phase, lastMoveAffectedR3 ? 0 : 1, -g)
```

Then pop in a fixed ratio, like:

* 3 pops from A
* 1 pop from B

Shared closed set, shared best-`g` table.

### Why this helps

Queue A prevents regressions.
Queue B exploits structure when it helps.

That is much better than trying to force one scalar heuristic to do both jobs.

---

# What I would not do

## 1) No random tie-breaking

Your variance result says it all. Randomness is masking a ranking problem, not solving it.

## 2) No per-state Dijkstra / 0-1 BFS unless it becomes a rare fallback

The compute cost is too high for too little stability.

## 3) No large additive blocker weight

Even if tuned down, it is the wrong role for this feature.

---

# A practical heuristic package I’d recommend

## Primary heuristic

```ts
h = 3 * distToExit[r3]
```

Leave it alone.

## Precompute once per map

### `phase[cell]`

Structural progress class.

### `mandatoryFunnelSet`

Door corridor + unavoidable tunnel cells.

### `backboneDeviation[cell]`

Distance from canonical shortest-path backbone, or just a boolean “on backbone / off backbone.”

## Per state, compute cheaply

```ts
mandatoryBlockers = countBoxesInMandatoryFunnel(boxes)
```

Since you have very few boxes, this is cheap enough.

## Priority key

```ts
(
  g + 3 * distToExit[r3],
  distToExit[r3],
  mandatoryBlockers,
  phase[r3],
  lastMoveAffectedR3 ? 0 : 1,
  -g,
  serial
)
```

That would be my default recommendation.

---

# Why this should avoid the L3/L7 regressions

Because it preserves what is already working:

* `distToExit * 3` remains the actual driver

And it demotes the risky signals:

* blockers
* path preference
* R3-move momentum

from “global cost estimate” to “plateau guidance.”

That is exactly where your experiments suggest they belong.

---

# If you want one more refinement

You can make blocker tie-breaking **phase-dependent**.

Example:

* when R3 is far from the door, ignore blocker tie-breaking entirely
* when R3 enters the approach corridor / door region, activate `mandatoryBlockers`

That reduces noise even further.

So:

```ts
if (phase[r3] > APPROACH_PHASE) {
  key = (g + 3*dist, dist, lastMoveAffectedR3 ? 0 : 1, -g)
} else {
  key = (g + 3*dist, dist, mandatoryBlockers, phase[r3], lastMoveAffectedR3 ? 0 : 1, -g)
}
```

I like this a lot for your maps because the door is the universal bottleneck.

---

# My bottom-line recommendation

If you want the highest-probability improvement with the lowest engineering risk:

1. **Keep `h = 3 * distToExit[r3]`**
2. **Stop adding blocker penalties into `f`**
3. **Use deterministic lexicographic tie-breaking**
4. **Use only static, cheap, structural extra signals**
5. **Count blockers only in the mandatory funnel near the door**
6. **Consider a conservative/aggressive dual-queue only if tie-breaking alone is not enough**

That is the approach I’d bet on to improve the whole suite without making L3/L7 explode again.

If you want, I can turn this into a concrete TypeScript implementation sketch for:

* `phase[cell]`
* `mandatoryFunnelSet`
* `backboneDeviation[cell]`
* and a comparator for your heap.
