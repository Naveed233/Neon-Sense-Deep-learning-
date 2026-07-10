// Tiny procedural sound engine — every effect is a single oscillator burst.
const AudioEngine = {
    ctx: new (window.AudioContext || window.webkitAudioContext)(),
    play(freq, type = 'square', duration = 0.1, vol = 0.1) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + duration);
    },
    jump() { this.play(400, 'triangle', 0.2); },
    duck() { this.play(200, 'square', 0.2); },
    move() { this.play(300, 'sine', 0.1); },
    crash() { this.play(100, 'sawtooth', 0.5); }
};
