Build a small TypeScript puzzle game called Maze Trials.
It is a top-down grid-based game with:
* two controllable robots, A and C
* walls
* movable cardboard boxes
* one special box X, which is the unconscious teammate inside a red cargo box with a robot head icon
* one exit tile E

Core idea
The player controls two rescue robots in a maze.They must move boxes to open paths, reach the red buddy box, and extract that red box to the exit.
The red buddy box is not an NPC or follower.It is just a special cargo box with:
* a different appearance
* the win condition: the level is solved when this red box reaches the exit

Controls
* Q: select robot A
* E: select robot C
* arrow keys: move selected robot
* Space: attach or detach to a nearby box
* R: reset level

Rules

Movement
* Robots move one tile at a time.
* Walls block everything.
* Robots cannot move through walls, boxes, or each other.

Pushing
* If a robot moves into a box, and the next tile beyond the box is empty, it pushes the box.
* This works for both normal boxes and the red buddy box.

Attaching
* A robot can attach to one adjacent box using Space.
* If already attached, Space detaches it.
* Attachment must be explicit. Never auto-attach.

Towing
* If a robot is attached to a box and moves into an empty tile, the attached box moves into the robot’s previous tile.
* This is how pulling works.

Important corner rule

A box cannot be towed through a 90-degree corner.

That means:
* towing only works if the robot, the box, and the movement direction stay in a straight line
* if the robot tries to turn a corner while towing, the move must fail

This is important because it creates the intended puzzle behavior:

* in a narrow corridor with a right-angle turn, the robot cannot simply pull the box around the corner
* instead, the robot may need to push the box up to the corner
* then travel around another route
* then approach from a different side
* then pull the box out from that side
This rule should apply to all boxes, including the red buddy box.

Win condition
* The level is complete when the red buddy box reaches the exit tile.

Level format
Use a simple ASCII map:
* # = wall
* . = floor
* A = robot A
* C = robot C
* B = normal box
* X = red buddy box
* E = exit

Example:

###########
#A..B....E#
#.#.#.##..#
#.#..X.#C.#
#...B.....#
###########


What to build
Make a clean playable prototype with:
* TypeScript
* simple top-down rendering
* keyboard controls
* robot selection
* push
* explicit attach/detach
* towing
* the “cannot tow around right-angle corners” rule
* reset
* step counter
* at least 3 handmade test levels

Code structure
Keep the code simple and readable:
* separate game state from rendering
* represent robots, boxes, and walls clearly
* make movement rules easy to modify later

Visuals
Keep visuals minimal:
* normal boxes are brown cardboard boxes
* the buddy box is a red box with a robot-head icon
* selected robot is highlighted
* show which robot is currently selected
* show whether a robot is attached to a box

Most important requirement
The game should feel like:
* rearranging a maze by moving boxes
* careful sequencing
* congestion in narrow corridors
* rescuing the red buddy box

It should not feel like:
* automatic follower behavior
* free dragging of boxes around corners
* standard Sokoban with goals
For Maze Trials UI, I’d actually recommend:

npm create vite@latest maze-trials -- --template vanilla-ts

Why:
* simpler
* fewer moving parts
* good for keyboard controls
* easy to draw a grid game on HTML canvas or with DOM tiles
React is nice for UI panels, but for a puzzle prototype, vanilla TypeScript is probably cleaner.

So the shortest answer for opening this locally
1. Install Node.js
2. Create a Vite TypeScript project
3. Run:

npm install
npm run dev

Open the localhost URL in the browser.
