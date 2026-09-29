export const GESTURES = ['IDLE', 'LEFT', 'RIGHT', 'DUCK', 'JUMP'];

export const GESTURE_ICONS = { IDLE: '●', LEFT: '◀', RIGHT: '▶', DUCK: '▼', JUMP: '▲' };

// Predictions below this softmax probability are ignored.
export const CONFIDENCE_THRESHOLD = 0.7;

export const SAMPLES_PER_GESTURE = 40;

export const LANES = [-150, 150];

export const LEVELS = [
    { speed: 8, spawnInterval: 1500, name: 'NEON GRID' },
    { speed: 11, spawnInterval: 1200, name: 'CYBER TUNNEL' },
    { speed: 14, spawnInterval: 1000, name: 'DATA STREAM' },
    { speed: 17, spawnInterval: 800, name: 'VOID RUNNER' },
    { speed: 20, spawnInterval: 600, name: 'SINGULARITY' },
];

export const POINTS_PER_LEVEL = 500;

// Internal render resolution. The canvas is scaled up with nearest-neighbour filtering.
export const VIEW = { width: 320, height: 240, horizon: 100 };
