import { createAudio } from './audio.js';
import { Calibration } from './calibration.js';
import { GestureClassifier } from './classifier.js';
import { CONFIDENCE_THRESHOLD, GESTURE_ICONS, VIEW } from './config.js';
import { DifficultyController } from './difficulty.js';
import { extractFeatures } from './features.js';
import { Game } from './game.js';
import { bindControls } from './input.js';
import { FaceTracker } from './tracker.js';

const BEST_SCORE_KEY = 'neon-sense:best-score';
const HUD_REFRESH_MS = 200;

const $ = (id) => document.getElementById(id);

const screens = {
    title: $('screen-title'),
    calibration: $('screen-calibration'),
    gameOver: $('screen-gameover'),
};
const hud = {
    root: $('hud'),
    score: $('hud-score'),
    level: $('hud-level'),
    speed: $('hud-speed'),
    gesture: $('hud-gesture'),
    confidence: $('hud-confidence'),
    fps: $('hud-fps'),
};

const canvas = $('game-canvas');
const audio = createAudio();
const tracker = new FaceTracker($('webcam'));
const classifier = new GestureClassifier();
const game = new Game(canvas.getContext('2d'), {
    difficulty: new DifficultyController(),
    audio,
    onCrash: showGameOver,
});
const calibration = new Calibration({
    classifier,
    video: $('webcam'),
    cameraCanvas: $('camera-canvas'),
    avatarCanvas: $('avatar-canvas'),
    statusEl: $('calibration-status'),
    labelEl: $('avatar-label'),
    buttons: [...document.querySelectorAll('.gesture-btn')],
    startButton: $('btn-start'),
});

/** @type {'webcam' | 'keyboard' | null} */
let mode = null;
let currentScreen = 'title';
let lastPrediction = null;

function showScreen(name) {
    currentScreen = name;
    for (const [key, element] of Object.entries(screens)) {
        element.classList.toggle('hidden', key !== name);
    }
}

async function startWebcamMode() {
    audio.unlock();
    mode = 'webcam';
    showScreen('calibration');
    calibration.setStatus('STARTING CAMERA...');
    try {
        await Promise.all([tracker.start(), classifier.prepare()]);
        calibration.activate();
        calibration.setStatus('CAMERA ONLINE. HOLD A POSE AND PRESS ITS BUTTON.');
    } catch (err) {
        console.error(err);
        calibration.setStatus(describeCameraError(err), true);
    }
}

function startKeyboardMode() {
    audio.unlock();
    mode = 'keyboard';
    startRun();
}

function startRun() {
    audio.unlock();
    showScreen(null);
    hud.root.classList.remove('hidden');
    game.start();
    audio.start();
}

function showGameOver(score) {
    const best = Math.max(score, readBestScore());
    writeBestScore(best);
    $('final-score').textContent = score;
    $('best-score').textContent = best;
    $('retry-note').classList.toggle('hidden', mode !== 'webcam');
    showScreen('gameOver');
}

function describeCameraError(err) {
    switch (err?.name) {
        case 'NotAllowedError':
            return 'CAMERA PERMISSION DENIED. ALLOW IT IN THE ADDRESS BAR AND RELOAD.';
        case 'NotFoundError':
            return 'NO CAMERA FOUND. RELOAD AND PLAY WITHOUT CAMERA.';
        case 'NotReadableError':
            return 'THE CAMERA IS IN USE BY ANOTHER APP.';
        default:
            return `ERROR: ${err?.message ?? err}`.toUpperCase();
    }
}

function readBestScore() {
    try {
        return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
    } catch {
        return 0;
    }
}

function writeBestScore(score) {
    try {
        localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch {
        // Storage can be unavailable (private mode); the best score just won't persist.
    }
}

function applyPrediction(prediction, now) {
    if (!prediction || prediction.confidence < CONFIDENCE_THRESHOLD) return;
    if (game.running) game.handleGesture(prediction.gesture);
    else if (currentScreen === 'calibration') calibration.mirror(prediction.gesture, now);
}

function updateHud(fps) {
    hud.score.textContent = game.score;
    hud.level.textContent = game.level + 1;
    hud.speed.textContent = `x${game.speedMultiplier.toFixed(2)}`;
    hud.fps.textContent = Math.round(fps);

    if (mode === 'keyboard' || !lastPrediction) {
        hud.gesture.textContent = mode === 'keyboard' ? 'KEYS' : '--';
        hud.gesture.style.color = '';
        hud.confidence.textContent = '';
        return;
    }
    const { gesture, confidence } = lastPrediction;
    hud.gesture.textContent = `${GESTURE_ICONS[gesture]} ${gesture}`;
    hud.gesture.style.color = confidence >= CONFIDENCE_THRESHOLD ? 'var(--green)' : '#666';
    hud.confidence.textContent = `${Math.round(confidence * 100)}%`;
}

let lastTime = performance.now();
let fps = 60;
let sinceHudRefresh = 0;

function frame(now) {
    const elapsed = now - lastTime;
    lastTime = now;
    if (elapsed > 0) fps += (1000 / elapsed - fps) * 0.05;

    if (mode === 'webcam' && tracker.ready && tracker.detect(now)) {
        const features = extractFeatures(tracker.landmarks);
        calibration.addFrame(features);
        lastPrediction = features ? classifier.predict(features) : null;
        applyPrediction(lastPrediction, now);
    }

    if (currentScreen === 'calibration') {
        calibration.update(elapsed, now);
        calibration.draw(tracker.landmarks, lastPrediction, now);
    }

    game.update(elapsed);
    game.draw();

    sinceHudRefresh += elapsed;
    if (sinceHudRefresh >= HUD_REFRESH_MS) {
        sinceHudRefresh = 0;
        updateHud(fps);
    }
    requestAnimationFrame(frame);
}

// Render at a fixed low resolution and scale up to fit the window, keeping the aspect ratio.
function fitCanvas() {
    const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
    canvas.style.width = `${Math.floor(VIEW.width * scale)}px`;
    canvas.style.height = `${Math.floor(VIEW.height * scale)}px`;
}

$('btn-webcam').addEventListener('click', startWebcamMode);
$('btn-keyboard').addEventListener('click', startKeyboardMode);
$('btn-start').addEventListener('click', startRun);
$('btn-retry').addEventListener('click', startRun);
$('btn-menu').addEventListener('click', () => window.location.reload());
bindControls($('stage'), (gesture) => game.handleGesture(gesture));
window.addEventListener('resize', fitCanvas);

fitCanvas();
requestAnimationFrame(frame);
