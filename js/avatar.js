// Calibration-screen widgets: the live webcam preview with landmark overlay,
// and the small avatar scene where the runner mirrors your gestures so you
// can verify the model before starting a run.

const avCanvas = document.getElementById('avatar-canvas');
const avCtx = avCanvas.getContext('2d');
const AV = { W: 160, H: 120, HOR: 50 };
const avatar = { lean: 0, targetLean: 0, duck: 0, targetDuck: 0, y: 0, vy: 0, phase: 0, t: 0 };
const GESTURE_ICONS = { IDLE: '●', LEFT: '◀', RIGHT: '▶', JUMP: '▲', DUCK: '▼' };
let avatarGestureTime = 0;

function setAvatarGesture(g) {
    avatarGestureTime = performance.now();
    avatar.targetLean = g === 'LEFT' ? -1 : g === 'RIGHT' ? 1 : 0;
    avatar.targetDuck = g === 'DUCK' ? 1 : 0;
    if (g === 'JUMP' && avatar.y === 0 && avatar.vy === 0) { avatar.vy = 3.6; }
    document.getElementById('avatar-label').innerText = `AI: ${GESTURE_ICONS[g] || ''} ${g}`;
}

function updateAvatar() {
    // Decay to idle if no confident gesture recently
    if (performance.now() - avatarGestureTime > 450) {
        avatar.targetLean = 0;
        avatar.targetDuck = 0;
    }
    avatar.lean += (avatar.targetLean - avatar.lean) * 0.14;
    avatar.duck += (avatar.targetDuck - avatar.duck) * 0.22;
    if (avatar.vy !== 0 || avatar.y > 0) {
        avatar.y += avatar.vy;
        avatar.vy -= 0.3;
        if (avatar.y <= 0) { avatar.y = 0; avatar.vy = 0; }
    }
    avatar.phase += 0.22;
    avatar.t++;
}

function drawAvatarScene() {
    if (document.getElementById('screen-calib').classList.contains('hidden')) return;
    const { W, H, HOR } = AV;
    const vpX = W / 2 - avatar.lean * 10;
    renderScene(avCtx, W, H, HOR, vpX, avatar.t, avatar.t * 0.012);
    const rx = W / 2 + avatar.lean * 20;
    renderRunner(avCtx, rx, H - 12, avatar.phase, avatar.lean, avatar.duck, avatar.y * 0.8, 1);
}

// The camera is rendered onto the canvas directly (more reliable than the
// <video> element) with AI landmarks overlaid.
function drawCamPreview() {
    if (document.getElementById('screen-calib').classList.contains('hidden')) return;
    const w = prevCanvas.width, h = prevCanvas.height;

    if (video.readyState >= 2 && video.videoWidth > 0) {
        prevCtx.save();
        prevCtx.translate(w, 0);
        prevCtx.scale(-1, 1); // mirror
        prevCtx.drawImage(video, 0, 0, w, h);
        prevCtx.restore();
    } else {
        prevCtx.fillStyle = '#111';
        prevCtx.fillRect(0, 0, w, h);
        prevCtx.fillStyle = '#ff2975';
        prevCtx.font = '12px "Press Start 2P"';
        prevCtx.fillText('NO SIGNAL', 100, 120);
        return;
    }

    const now = performance.now();
    if (latestResults && latestResults.faceLandmarks && latestResults.faceLandmarks.length > 0) {
        lastFaceSeenAt = now;
        const lm = latestResults.faceLandmarks[0];
        prevCtx.fillStyle = 'rgba(0, 255, 255, 0.85)';
        for (let i = 0; i < lm.length; i += 4) {
            prevCtx.fillRect((1 - lm[i].x) * w, lm[i].y * h, 2, 2);
        }
        // Key points highlighted in pink (nose, eyes, chin)
        prevCtx.fillStyle = '#ff2975';
        [1, 33, 263, 152].forEach(idx => {
            prevCtx.fillRect((1 - lm[idx].x) * w - 2, lm[idx].y * h - 2, 5, 5);
        });
    } else if (faceLandmarker && now - lastFaceSeenAt > 2000) {
        prevCtx.fillStyle = 'rgba(0,0,0,0.6)';
        prevCtx.fillRect(0, h - 40, w, 40);
        prevCtx.fillStyle = '#ffd319';
        prevCtx.font = '8px "Press Start 2P"';
        prevCtx.fillText('NO FACE - CHECK LIGHTING /', 10, h - 24);
        prevCtx.fillText('MACOS CAMERA PERMISSION', 10, h - 10);
    }

    if (model) {
        prevCtx.fillStyle = '#00ff00';
        prevCtx.font = '10px "Press Start 2P"';
        prevCtx.fillText(`AI: ${lastGesture} ${Math.round(lastGestureConf * 100)}%`, 8, 18);
    }
}
