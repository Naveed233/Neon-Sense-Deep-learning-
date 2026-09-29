import { LANES, LEVELS, POINTS_PER_LEVEL, VIEW } from './config.js';
import { renderBanner, renderObstacle, renderRunner, renderScene } from './renderer.js';

// Tuning values are per 60 Hz frame; update() scales them by elapsed time so
// the game runs at the same speed on 60 Hz and 120 Hz displays.
const FRAME_MS = 1000 / 60;
const MAX_STEP_MS = 100;

const SPAWN_Z = 1000;
const PLAYER_Z = 30;
// Reaction time is measured from the moment an obstacle crosses this depth.
const REACTION_WINDOW_Z = 500;

const JUMP_VELOCITY = 5.5;
const GRAVITY = 0.3;
const JUMP_CLEARANCE = 20;
const DUCK_FRAMES = 36;
const POINTS_PER_OBSTACLE = 10;

function createObstacle() {
    const roll = Math.random();
    return {
        z: SPAWN_Z,
        lane: Math.random() < 0.5 ? 0 : 1,
        type: roll < 0.7 ? 'WALL' : roll < 0.85 ? 'LOW' : 'HIGH',
        dangerAt: null,
        threatened: false,
        reactionMs: null,
    };
}

export class Game {
    /**
     * @param {CanvasRenderingContext2D | null} ctx
     * @param {object} deps
     * @param {import('./difficulty.js').DifficultyController} deps.difficulty
     * @param {ReturnType<import('./audio.js').createAudio>} deps.audio
     * @param {(score: number) => void} deps.onCrash
     */
    constructor(ctx, { difficulty, audio, onCrash }) {
        this.ctx = ctx;
        this.difficulty = difficulty;
        this.audio = audio;
        this.onCrash = onCrash;

        this.running = false;
        this.frame = 0;
        this.roadScroll = 0;
        this.runPhase = 0;
        this.reset();
    }

    reset() {
        this.score = 0;
        this.level = 0;
        this.laneX = LANES[0];
        this.targetLaneX = LANES[0];
        this.height = 0;
        this.velocity = 0;
        this.duckTimer = 0;
        this.duckAmount = 0;
        this.obstacles = [];
        this.spawnTimer = 0;
        this.speedMultiplier = 1;
        this.banner = null;
    }

    start() {
        this.reset();
        this.running = true;
        this.showLevelBanner();
    }

    get speed() {
        return this.running ? LEVELS[this.level].speed * this.speedMultiplier : LEVELS[0].speed;
    }

    handleGesture(gesture) {
        if (!this.running) return;
        const grounded = this.height === 0 && this.velocity === 0;

        if (gesture === 'LEFT' && this.targetLaneX !== LANES[0]) {
            this.targetLaneX = LANES[0];
            this.audio.move();
        } else if (gesture === 'RIGHT' && this.targetLaneX !== LANES[1]) {
            this.targetLaneX = LANES[1];
            this.audio.move();
        } else if (gesture === 'JUMP' && grounded && this.duckTimer === 0) {
            this.velocity = JUMP_VELOCITY;
            this.audio.jump();
        } else if (gesture === 'DUCK' && grounded) {
            // Holding the pose keeps the runner down.
            if (this.duckTimer === 0) this.audio.duck();
            this.duckTimer = DUCK_FRAMES;
        }
    }

    update(elapsedMs) {
        const dt = Math.min(elapsedMs, MAX_STEP_MS);
        const k = dt / FRAME_MS;
        const speed = this.speed;

        this.frame += k;
        this.roadScroll += speed * 0.0016 * k;
        this.runPhase += (0.14 + speed * 0.012) * k;
        this.duckAmount += ((this.duckTimer > 0 ? 1 : 0) - this.duckAmount) * (1 - 0.7 ** k);
        if (!this.running) return;

        this.speedMultiplier += (this.difficulty.speedMultiplier() - this.speedMultiplier) * (1 - 0.995 ** k);
        this.laneX += (this.targetLaneX - this.laneX) * (1 - 0.8 ** k);
        this.duckTimer = Math.max(0, this.duckTimer - k);
        if (this.height > 0 || this.velocity > 0) {
            this.height += this.velocity * k;
            this.velocity -= GRAVITY * k;
            if (this.height <= 0) {
                this.height = 0;
                this.velocity = 0;
            }
        }

        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.obstacles.push(createObstacle());
            this.spawnTimer = LEVELS[this.level].spawnInterval * this.difficulty.spawnMultiplier();
        }

        const now = performance.now();
        for (const obstacle of this.obstacles) {
            const previousZ = obstacle.z;
            obstacle.z -= speed * k;
            const inLane = obstacle.lane === 0 ? this.laneX < 0 : this.laneX > 0;
            const cleared = this.clears(obstacle);

            if (obstacle.dangerAt === null && obstacle.z < REACTION_WINDOW_Z) {
                obstacle.dangerAt = now;
                obstacle.threatened = inLane && !cleared;
            }
            if (obstacle.threatened && obstacle.reactionMs === null && (!inLane || cleared)) {
                obstacle.reactionMs = now - obstacle.dangerAt;
            }

            // Checking the crossing (not a z range) means fast obstacles can't skip past the player.
            if (previousZ > PLAYER_Z && obstacle.z <= PLAYER_Z && inLane && !cleared) {
                this.crash();
                return;
            }
        }

        const remaining = [];
        for (const obstacle of this.obstacles) {
            if (obstacle.z > 0) {
                remaining.push(obstacle);
            } else {
                this.score += POINTS_PER_OBSTACLE;
                this.difficulty.recordDodge(obstacle.reactionMs);
            }
        }
        this.obstacles = remaining;

        if (this.level < LEVELS.length - 1 && this.score >= (this.level + 1) * POINTS_PER_LEVEL) {
            this.level++;
            this.showLevelBanner();
            this.audio.levelUp();
        }
    }

    clears(obstacle) {
        if (obstacle.type === 'LOW') return this.height > JUMP_CLEARANCE;
        if (obstacle.type === 'HIGH') return this.duckTimer > 0;
        return false;
    }

    crash() {
        this.running = false;
        this.difficulty.recordCrash();
        this.audio.crash();
        this.onCrash(this.score);
    }

    showLevelBanner() {
        this.banner = { text: `LEVEL ${this.level + 1}: ${LEVELS[this.level].name}`, until: this.frame + 150 };
    }

    draw() {
        const g = this.ctx;
        const laneOffset = this.laneX / LANES[1]; // -1 .. 1
        const vpX = VIEW.width / 2 - laneOffset * 18;

        renderScene(g, VIEW, vpX, Math.floor(this.frame), this.roadScroll);

        const farthestFirst = [...this.obstacles].sort((a, b) => b.z - a.z);
        for (const obstacle of farthestFirst) {
            renderObstacle(g, VIEW, vpX, { type: obstacle.type, lane: obstacle.lane, progress: 1 - obstacle.z / SPAWN_Z });
        }

        renderRunner(g, {
            x: VIEW.width / 2 + laneOffset * VIEW.width * 0.125,
            groundY: VIEW.height - 16,
            phase: this.runPhase,
            lean: Math.max(-1, Math.min(1, (this.targetLaneX - this.laneX) / LANES[1])),
            duck: this.duckAmount,
            lift: this.height * 0.6,
            scale: 1.6,
        });

        if (this.running && this.banner && this.frame < this.banner.until) {
            renderBanner(g, VIEW, this.banner.text);
        }
    }
}
