/** Sound effects synthesised with single oscillator bursts, so there are no audio files to load. */
export function createAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let ctx = null;

    function tone(frequency, type, duration, volume = 0.1) {
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, t);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + duration);
    }

    return {
        // Browsers block audio until the user interacts with the page, so the
        // context is created (or resumed) from a click handler.
        unlock() {
            if (!AudioContextClass) return;
            ctx ??= new AudioContextClass();
            if (ctx.state === 'suspended') ctx.resume();
        },
        start: () => tone(500, 'square', 0.3),
        move: () => tone(300, 'sine', 0.1),
        jump: () => tone(400, 'triangle', 0.2),
        duck: () => tone(200, 'square', 0.2),
        levelUp: () => tone(700, 'square', 0.25),
        crash: () => tone(100, 'sawtooth', 0.5),
    };
}
