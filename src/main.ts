import { LEVELS } from './levels';
import { createStateFromLevel } from './state';
import { applyAction } from './logic';
import { setupInput } from './input';
import { createRenderer } from './renderer';
import type { GameAction } from './types';
import './style.css';

let currentLevelIndex = 0;
let state = createStateFromLevel(LEVELS[currentLevelIndex]);

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = createRenderer(canvas);

function handleAction(action: GameAction): void {
  if (action.type === 'reset') {
    state = createStateFromLevel(LEVELS[currentLevelIndex]);
    render();
    return;
  }

  if (action.type === 'nextLevel') {
    if (state.won && currentLevelIndex < LEVELS.length - 1) {
      currentLevelIndex++;
      state = createStateFromLevel(LEVELS[currentLevelIndex]);
    }
    render();
    return;
  }

  if (state.won) return;

  applyAction(state, action);
  render();
}

function render(): void {
  renderer.render(state, LEVELS[currentLevelIndex].name);
}

setupInput(handleAction);
render();
