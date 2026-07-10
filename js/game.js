// Game logic: obstacles, collision, adaptive difficulty, and the pixel-world
// game rendering built on the shared renderer.

const GAME = { W: 320, H: 240, HOR: 100 };
let sceneT = 0;
let roadScroll = 0;
let runPhase = 0;
let obstacles = [];

/**
 * Adaptive difficulty controller. Builds a skill estimate (0..1) from two
 * live signals — reaction time (EWMA of how fast you clear threats after
 * they enter range) and dodge streak — and maps it to obstacle speed and
 * spawn frequency. Crashing knocks the estimate down, so the game backs off.
 * The estimate survives RETRY, so it keeps tracking you across runs.
 */
const DifficultyAI = {
    streak: 0,
    reactionEWMA: 700,   // ms; starts at an average-human baseline
    skill: 0.25,

    recordDodge(reactionMs) {
        this.streak++;
        if (reactionMs != null) {
            this.reactionEWMA = this.reactionEWMA * 0.8 + reactionMs * 0.2;
        }
        const reactionScore = Math.max(0, Math.min(1, (900 - this.reactionEWMA) / 700));
        const streakScore = Math.min(1, this.streak / 25);
        const target = 0.5 * reactionScore + 0.5 * streakScore;
        this.skill += (target - this.skill) * 0.1;
    },

    recordCrash() {
        this.streak = 0;
        this.skill *= 0.6;
    },

    speedMultiplier() { return 1 + this.skill * 0.9; },
    spawnMultiplier() { return 1 / (1 + this.skill * 0.8); }
};

class Obstacle {
    constructor(speed) {
        this.z = 1000;
        this.lane = Math.floor(Math.random() * 2);
        this.type = Math.random() > 0.7 ? (Math.random() > 0.5 ? 'HIGH' : 'LOW') : 'WALL';
        this.speed = speed;
        this.dangerAt = null;    // when it entered reaction-measuring range
        this.threat = false;     // was the player in its lane at that moment
        this.reactionMs = null;  // how long the player took to become safe
    }
    update() { this.z -= this.speed * adaptiveMultiplier; }
}

function updateGame() {
    if (gameState !== 'PLAYING') return;

    // Ease toward the AI-chosen difficulty
    adaptiveMultiplier += (DifficultyAI.speedMultiplier() - adaptiveMultiplier) * 0.005;

    currentLaneX += (targetLaneX - currentLaneX) * 0.2;
    // Jump falls back down; duck eases back up
    if (playerY > 0) playerY -= 4;
    else if (playerY < 0) playerY += 4;

    obstacleTimer -= 16;
    if (obstacleTimer <= 0) {
        obstacles.push(new Obstacle(gameSpeed));
        obstacleTimer = CONFIG.levels[level].spawnRate * DifficultyAI.spawnMultiplier();
    }

    obstacles.forEach((obs, i) => {
        obs.update();
        const inLane = (obs.lane === 0 && currentLaneX < 0) || (obs.lane === 1 && currentLaneX > 0);

        // Reaction-time measurement: the clock starts when the obstacle
        // enters range while threatening the player's current lane, and
        // stops the moment the player is in a safe state for its type.
        if (obs.z < 500 && obs.dangerAt === null) {
            obs.dangerAt = performance.now();
            obs.threat = inLane;
        }
        if (obs.threat && obs.reactionMs === null) {
            const safe = obs.type === 'WALL' ? !inLane :
                         obs.type === 'LOW' ? playerY > 30 : playerY < -30;
            if (safe) obs.reactionMs = performance.now() - obs.dangerAt;
        }

        if (obs.z < 50 && obs.z > 10 && inLane) {
            let hit = true;
            if (obs.type === 'LOW' && playerY > 30) hit = false;
            if (obs.type === 'HIGH' && playerY < -30) hit = false;
            if (hit) endGame();
        }

        if (obs.z < 0) {
            obstacles.splice(i, 1);
            score += 10;
            DifficultyAI.recordDodge(obs.reactionMs);
            document.getElementById('score-val').innerText = score;
        }
    });

    if (score > (level + 1) * 500 && level < 4) {
        level++;
        gameSpeed = CONFIG.levels[level].speed;
        document.getElementById('lvl-val').innerText = level + 1;
    }
}

function startGame() {
    document.getElementById('screen-calib').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    gameState = 'PLAYING';
    AudioEngine.play(500, 'square', 0.3);
}

// Restart the run, keeping the trained model, camera stream and calibration.
// The difficulty controller's skill estimate is kept too, so a returning
// player ramps up faster than a fresh one.
function retryGame() {
    score = 0;
    level = 0;
    gameSpeed = CONFIG.levels[0].speed;
    adaptiveMultiplier = 1.0;
    obstacles = [];
    obstacleTimer = 0;
    currentLaneX = CONFIG.lanes[0];
    targetLaneX = CONFIG.lanes[0];
    playerY = 0;
    document.getElementById('score-val').innerText = 0;
    document.getElementById('lvl-val').innerText = 1;
    document.getElementById('screen-gameover').classList.add('hidden');
    gameState = 'PLAYING';
    AudioEngine.play(500, 'square', 0.3);
}

function endGame() {
    gameState = 'GAMEOVER';
    DifficultyAI.recordCrash();
    AudioEngine.crash();
    document.getElementById('screen-gameover').classList.remove('hidden');
    document.getElementById('final-score').innerText = score;
}

function handleInput(gesture) {
    if (gesture === 'LEFT' && targetLaneX !== CONFIG.lanes[0]) { targetLaneX = CONFIG.lanes[0]; AudioEngine.move(); }
    else if (gesture === 'RIGHT' && targetLaneX !== CONFIG.lanes[1]) { targetLaneX = CONFIG.lanes[1]; AudioEngine.move(); }
    else if (gesture === 'JUMP' && playerY === 0) { playerY = 60; AudioEngine.jump(); }
    else if (gesture === 'DUCK' && playerY === 0) { playerY = -60; AudioEngine.duck(); }
}

function drawObstacle3D(o, vpX) {
    const { W, H, HOR } = GAME;
    if (o.z <= 0 || o.z >= 1000) return;
    const p = (1000 - o.z) / 1000;
    const t2 = p * p;
    const y = HOR + t2 * (H - HOR);           // base sits on the road surface
    const laneBottom = W / 2 + (o.lane === 0 ? -1 : 1) * W * 0.125;
    const x = vpX + (laneBottom - vpX) * t2;
    const w = Math.max(2, 4 + 40 * t2);

    ctx.save();
    if (o.type === 'WALL') {
        const h = Math.max(2, w * 1.1);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ff2975';
        ctx.fillRect(Math.round(x - w / 2 - 2), Math.round(y - h - 2), Math.round(w + 4), Math.round(h + 4));
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff2975';
        ctx.fillRect(Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
        ctx.fillStyle = '#ff5e3a';
        ctx.fillRect(Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.max(1, Math.round(h * 0.15)));
        ctx.fillStyle = '#8f0f45';
        for (let i = 1; i < 3; i++) {
            ctx.fillRect(Math.round(x - w / 2), Math.round(y - h + i * h / 3), Math.round(w), 1);
        }
    } else if (o.type === 'LOW') {
        // Low barrier on the ground — JUMP over it
        const h = Math.max(2, w * 0.35);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(Math.round(x - w / 2 - 2), Math.round(y - h - 2), Math.round(w + 4), Math.round(h + 4));
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
        ctx.fillStyle = '#00aa55';
        ctx.fillRect(Math.round(x - w / 2), Math.round(y - Math.max(1, h * 0.4)), Math.round(w), 1);
    } else {
        // HIGH bar on posts — DUCK under it
        const barH = Math.max(2, w * 0.28);
        const gap = w * 0.55;                  // clearance under the bar
        const barBottom = y - gap;
        const postW = Math.max(1, Math.round(w * 0.08));
        ctx.fillStyle = '#00cc77';
        ctx.fillRect(Math.round(x - w / 2), Math.round(barBottom), postW, Math.round(gap));
        ctx.fillRect(Math.round(x + w / 2 - postW), Math.round(barBottom), postW, Math.round(gap));
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(Math.round(x - w / 2 - 2), Math.round(barBottom - barH - 2), Math.round(w + 4), Math.round(barH + 4));
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(Math.round(x - w / 2), Math.round(barBottom - barH), Math.round(w), Math.round(barH));
        ctx.fillStyle = '#baffdd';
        ctx.fillRect(Math.round(x - w / 2), Math.round(barBottom - barH), Math.round(w), 1);
    }
    ctx.restore();
}

function drawGame() {
    const { W, H, HOR } = GAME;
    const laneNorm = currentLaneX / 150;               // -1 .. 1
    const vpX = W / 2 - laneNorm * 18;                  // world pans as you switch lanes

    renderScene(ctx, W, H, HOR, vpX, sceneT, roadScroll);

    // Obstacles: far ones first so near ones draw on top
    obstacles.slice().sort((a, b) => b.z - a.z).forEach(o => drawObstacle3D(o, vpX));

    // Player
    const px = W / 2 + laneNorm * W * 0.125;
    const lean = Math.max(-1, Math.min(1, (targetLaneX - currentLaneX) / 150));
    const jumpLift = Math.max(0, playerY) * 0.6;        // playerY 0..60 -> 0..36px
    const duckAmt = playerY < 0 ? Math.min(1, -playerY / 60) : 0;
    renderRunner(ctx, px, H - 16, runPhase, lean, duckAmt, jumpLift, 1.6);
}
