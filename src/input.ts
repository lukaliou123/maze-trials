import type { GameAction } from './types';

export function setupInput(onAction: (action: GameAction) => void): void {
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowUp':
        onAction({ type: 'move', direction: 'up' });
        e.preventDefault();
        break;
      case 'ArrowDown':
        onAction({ type: 'move', direction: 'down' });
        e.preventDefault();
        break;
      case 'ArrowLeft':
        onAction({ type: 'move', direction: 'left' });
        e.preventDefault();
        break;
      case 'ArrowRight':
        onAction({ type: 'move', direction: 'right' });
        e.preventDefault();
        break;
      case 'q':
      case 'Q':
        onAction({ type: 'selectRobot', id: 'A' });
        break;
      case 'e':
      case 'E':
        onAction({ type: 'selectRobot', id: 'C' });
        break;
      case ' ':
        onAction({ type: 'toggleAttach' });
        e.preventDefault();
        break;
      case 'r':
      case 'R':
        onAction({ type: 'reset' });
        break;
      case 'n':
      case 'N':
        onAction({ type: 'nextLevel' });
        break;
    }
  });
}
