const KEY_GESTURES = {
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    ArrowUp: 'JUMP',
    ArrowDown: 'DUCK',
    a: 'LEFT',
    d: 'RIGHT',
    w: 'JUMP',
    s: 'DUCK',
    ' ': 'JUMP',
};

const MIN_SWIPE_PX = 30;

/** Keyboard (arrows / WASD / space) and touch (swipe, tap to jump) controls. */
export function bindControls(touchTarget, onGesture) {
    window.addEventListener('keydown', (event) => {
        const gesture = KEY_GESTURES[event.key] ?? KEY_GESTURES[event.key.toLowerCase()];
        if (!gesture) return;
        event.preventDefault();
        onGesture(gesture);
    });

    let start = null;
    touchTarget.addEventListener('touchstart', (event) => {
        const touch = event.changedTouches[0];
        start = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });

    touchTarget.addEventListener('touchend', (event) => {
        if (!start) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        start = null;

        if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE_PX) onGesture('JUMP');
        else if (Math.abs(dx) > Math.abs(dy)) onGesture(dx < 0 ? 'LEFT' : 'RIGHT');
        else onGesture(dy < 0 ? 'JUMP' : 'DUCK');
    });
}
