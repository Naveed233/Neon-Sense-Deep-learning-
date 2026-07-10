// Main loop and page wiring. One face-detection pass per frame feeds the
// calibration preview, the mirroring avatar, and the game itself.

let fpsEWMA = 60;
let lastFrameT = performance.now();

async function loop() {
    if (faceLandmarker && video.readyState >= 2 && video.videoWidth > 0) {
        try {
            latestResults = faceLandmarker.detectForVideo(video, performance.now());
            latestFeats = extractFeatures(latestResults);
        } catch (e) { /* detector busy — keep last results */ }

        if (latestFeats && model) {
            const prediction = tf.tidy(() => model.predict(tf.tensor2d([latestFeats])).dataSync());
            const conf = Math.max(...prediction);
            const gestureIdx = prediction.indexOf(conf);
            const gesture = CONFIG.gestures[gestureIdx];
            lastGesture = gesture;
            lastGestureConf = conf;

            document.getElementById('conf-val').innerText = `${Math.round(conf * 100)}%`;
            const gEl = document.getElementById('gesture-val');
            gEl.innerText = `${GESTURE_ICONS[gesture] || ''} ${gesture}`;
            gEl.style.color = conf > 0.70 ? '#00ff00' : '#666';

            // Confidence gate: uncertain predictions are ignored entirely
            if (conf > 0.70) {
                if (gameState === 'PLAYING') handleInput(gesture);
                else if (gameState !== 'GAMEOVER') setAvatarGesture(gesture);
            }
        }
    }

    // Advance shared world time; road speed follows the game speed
    sceneT++;
    const speed = gameState === 'PLAYING' ? gameSpeed * adaptiveMultiplier : 8;
    roadScroll += speed * 0.0016;
    runPhase += 0.14 + speed * 0.012;

    // FPS + difficulty readouts (updated a few times a second)
    const now = performance.now();
    const dt = now - lastFrameT;
    lastFrameT = now;
    if (dt > 0) fpsEWMA = fpsEWMA * 0.92 + (1000 / dt) * 0.08;
    if (sceneT % 15 === 0) {
        document.getElementById('fps-val').innerText = Math.round(fpsEWMA);
        document.getElementById('spd-val').innerText = 'x' + adaptiveMultiplier.toFixed(2);
    }

    drawCamPreview();
    updateAvatar();
    drawAvatarScene();
    updateGame();
    drawGame();
    requestAnimationFrame(loop);
}

// Keyboard fallback (debug + accessibility): arrows control the runner too
window.addEventListener('keydown', (e) => {
    if (gameState !== 'PLAYING') return;
    const map = { ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'JUMP', ArrowDown: 'DUCK' };
    if (map[e.key]) { handleInput(map[e.key]); e.preventDefault(); }
});

// The game renders at a fixed pixel resolution and is scaled up to fit the
// window (letterboxed so pixels stay square and crisp).
function fitCanvas() {
    const s = Math.min(window.innerWidth / GAME.W, window.innerHeight / GAME.H);
    canvas.style.width = Math.round(GAME.W * s) + 'px';
    canvas.style.height = Math.round(GAME.H * s) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
loop();
