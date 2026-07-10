// Shared configuration, game state and DOM references.
// All scripts are classic (non-module) scripts, so top-level declarations
// here are visible to every file loaded after this one.

const CONFIG = {
    lanes: [-150, 150],
    gestures: ['IDLE', 'LEFT', 'RIGHT', 'DUCK', 'JUMP'],
    levels: [
        { speed: 8, spawnRate: 1500, name: "NEON GRID" },
        { speed: 11, spawnRate: 1200, name: "CYBER TUNNEL" },
        { speed: 14, spawnRate: 1000, name: "DATA STREAM" },
        { speed: 17, spawnRate: 800, name: "VOID RUNNER" },
        { speed: 20, spawnRate: 600, name: "SINGULARITY" },
    ]
};

// AI / calibration
let faceLandmarker;
let model;
let isRecording = false;
let activeGesture = null;
let calibrationData = [];
let calibrationLabels = [];
let trainedGestures = new Set();

// Latest AI observations, shared between the render loop and calibration recorder
let latestResults = null;
let latestFeats = null;
let lastGesture = 'IDLE';
let lastGestureConf = 0;
let lastFaceSeenAt = 0;

// Game state
let gameState = 'TITLE';
let score = 0;
let level = 0;
let currentLaneX = CONFIG.lanes[0];
let targetLaneX = CONFIG.lanes[0];
let playerY = 0;
let gameSpeed = CONFIG.levels[0].speed;
let obstacleTimer = 0;
let adaptiveMultiplier = 1.0;

// DOM references
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const video = document.getElementById('webcam-feed');
const prevCanvas = document.getElementById('preview-canvas');
const prevCtx = prevCanvas.getContext('2d');
