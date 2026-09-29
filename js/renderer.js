// Pixel-art drawing shared by the game and the calibration preview.
// All coordinates are in the canvas's internal (low) resolution.

const SKY_BANDS = ['#05030f', '#0b0723', '#150b3a', '#221052', '#331463'];
const SUN_COLORS = ['#ffd319', '#ffb018', '#ff8c25', '#ff5e3a', '#ff2975'];
const NEON_PINK = '#ff2975';
const NEON_YELLOW = '#ffd319';

/**
 * Sky, sun, clouds, grid and road, with the road converging on `vpX`.
 * @param {CanvasRenderingContext2D} g
 * @param {{width: number, height: number, horizon: number}} view
 * @param {number} vpX vanishing point x; shifting it pans the camera
 * @param {number} frame animation clock (whole frames)
 * @param {number} scroll road scroll position; its fractional part is used
 */
export function renderScene(g, view, vpX, frame, scroll) {
    const { width: W, height: H, horizon: HOR } = view;

    const bandH = Math.ceil(HOR / SKY_BANDS.length);
    SKY_BANDS.forEach((color, i) => {
        g.fillStyle = color;
        g.fillRect(0, i * bandH, W, bandH);
    });

    // Stars; a rotating subset is hidden each few frames to make them twinkle.
    g.fillStyle = '#ffffff';
    const starCount = Math.round(W / 7);
    for (let i = 0; i < starCount; i++) {
        if (((frame >> 3) + i) % 5 === 0) continue;
        g.fillRect((i * 53 + 7) % W, (i * 29 + 3) % (HOR - 18), 1, 1);
    }

    // Striped sun sitting on the horizon.
    const radius = Math.round(W * 0.14);
    for (let dy = -radius; dy <= 0; dy++) {
        if (dy > -Math.round(radius * 0.55) && (dy % 4 === 0 || dy % 4 === -1)) continue;
        const half = Math.floor(Math.sqrt(radius * radius - dy * dy));
        const shade = Math.floor(((dy + radius) / radius) * SUN_COLORS.length * 0.55);
        g.fillStyle = SUN_COLORS[Math.min(SUN_COLORS.length - 1, shade)];
        g.fillRect(vpX - half, HOR + dy, half * 2, 1);
    }

    // Clouds drifting at different speeds for parallax.
    const clouds = [
        { y: HOR * 0.16, speed: 0.1, width: W * 0.13 },
        { y: HOR * 0.4, speed: 0.16, width: W * 0.16 },
        { y: HOR * 0.64, speed: 0.07, width: W * 0.1 },
    ];
    clouds.forEach((cloud, i) => {
        const cw = Math.round(cloud.width);
        const cx = ((i * W * 0.4 + frame * cloud.speed) % (W + cw * 2)) - cw * 2;
        const cy = Math.round(cloud.y);
        g.fillStyle = '#4a3a7a';
        g.fillRect(cx, cy, cw, 4);
        g.fillRect(cx + 4, cy - 3, Math.max(4, cw - 10), 3);
        g.fillStyle = '#6a5aa0';
        g.fillRect(cx + 2, cy, Math.max(2, cw - 6), 1);
    });

    g.fillStyle = '#0d0a1e';
    g.fillRect(0, HOR, W, H - HOR);

    const bottomCenter = W / 2;

    // Grid lines converging on the vanishing point.
    g.strokeStyle = 'rgba(0, 255, 255, 0.14)';
    g.lineWidth = 1;
    for (let k = -5; k <= 5; k++) {
        g.beginPath();
        g.moveTo(vpX, HOR);
        g.lineTo(bottomCenter + k * W * 0.21, H);
        g.stroke();
    }
    // Horizontal grid lines, spaced quadratically so they speed up as they approach.
    for (let i = 0; i < 7; i++) {
        const p = (i / 7 + scroll * 0.66) % 1;
        const y = HOR + p * p * (H - HOR);
        g.strokeStyle = `rgba(0, 255, 255, ${0.08 + p * 0.3})`;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
    }

    const roadHalf = W * 0.275;
    g.fillStyle = '#16122b';
    g.beginPath();
    g.moveTo(vpX - 3, HOR);
    g.lineTo(vpX + 3, HOR);
    g.lineTo(bottomCenter + roadHalf, H);
    g.lineTo(bottomCenter - roadHalf, H);
    g.closePath();
    g.fill();

    g.strokeStyle = NEON_PINK;
    g.lineWidth = Math.max(1, W / 160);
    g.beginPath();
    g.moveTo(vpX - 3, HOR);
    g.lineTo(bottomCenter - roadHalf, H);
    g.moveTo(vpX + 3, HOR);
    g.lineTo(bottomCenter + roadHalf, H);
    g.stroke();
    g.lineWidth = 1;

    // Centre lane dashes.
    g.fillStyle = NEON_YELLOW;
    for (let i = 0; i < 6; i++) {
        const p = (i / 6 + scroll) % 1;
        const y = HOR + p * p * (H - HOR);
        const x = vpX + (bottomCenter - vpX) * p * p;
        const w = Math.max(1, p * W * 0.025);
        const h = Math.max(1, p * H * 0.05);
        g.fillRect(x - w / 2, y, w, h);
    }

    g.fillStyle = NEON_PINK;
    g.fillRect(0, HOR, W, 1);
}

/**
 * The runner, seen from behind.
 * @param {CanvasRenderingContext2D} g
 * @param {object} pose
 * @param {number} pose.x centre x
 * @param {number} pose.groundY y of the feet when standing
 * @param {number} pose.phase running cycle phase (radians)
 * @param {number} pose.lean -1 (left) .. 1 (right)
 * @param {number} pose.duck 0 (standing) .. 1 (crouched)
 * @param {number} pose.lift height above the ground in pixels
 * @param {number} pose.scale body size multiplier
 */
export function renderRunner(g, { x, groundY, phase, lean, duck, lift, scale: s }) {
    const airborne = lift > 0.5;
    const stride = Math.sin(phase);
    const bob = airborne ? 0 : Math.abs(Math.cos(phase)) * 1.5 * s;
    const feetY = Math.round(groundY - lift - bob);
    const cx = Math.round(x);
    const u = Math.max(1, Math.round(s)); // one "pixel" of the sprite

    // Shadow shrinks as the runner leaves the ground.
    const shadowScale = Math.max(0.35, 1 - lift / (26 * s));
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.fillRect(
        Math.round(cx - 9 * s * shadowScale),
        Math.round(groundY + 1),
        Math.round(18 * s * shadowScale),
        Math.max(2, Math.round(3 * s)),
    );

    const legLength = Math.round(13 * s * (1 - 0.45 * duck));
    const torsoHeight = Math.round(12 * s * (1 - 0.35 * duck));
    const headHeight = Math.round(8 * s);
    const hipY = feetY - legLength;
    const shoulderY = hipY - torsoHeight;
    const headY = shoulderY - headHeight - 1;
    const hipX = Math.round(cx + lean * 2 * s);
    const shoulderX = Math.round(cx + lean * 5 * s);
    const headX = Math.round(cx + lean * 7.5 * s);

    // Legs alternate with the stride and tuck up in the air.
    const leftLift = airborne ? 6 * s : Math.max(0, stride) * 7 * s;
    const rightLift = airborne ? 6 * s : Math.max(0, -stride) * 7 * s;
    const leftLeg = Math.max(3 * u, Math.round(legLength - leftLift));
    const rightLeg = Math.max(3 * u, Math.round(legLength - rightLift));
    g.fillStyle = '#0e7c9e';
    g.fillRect(hipX - 5 * u, hipY, 4 * u, leftLeg);
    g.fillRect(hipX + u, hipY, 4 * u, rightLeg);
    g.fillStyle = NEON_PINK;
    g.fillRect(hipX - 5 * u, hipY + leftLeg - 2 * u, 4 * u, 2 * u);
    g.fillRect(hipX + u, hipY + rightLeg - 2 * u, 4 * u, 2 * u);

    // Arms swing opposite to the legs.
    const armLength = Math.round(10 * s * (1 - 0.3 * duck));
    const leftArm = Math.max(3 * u, Math.round(armLength - Math.max(0, -stride) * 5 * s));
    const rightArm = Math.max(3 * u, Math.round(armLength - Math.max(0, stride) * 5 * s));
    g.fillStyle = '#00b8d9';
    g.fillRect(shoulderX - 8 * u, shoulderY + u, 3 * u, leftArm);
    g.fillRect(shoulderX + 5 * u, shoulderY + u, 3 * u, rightArm);
    g.fillStyle = NEON_YELLOW;
    g.fillRect(shoulderX - 8 * u, shoulderY + u + leftArm - 2 * u, 3 * u, 2 * u);
    g.fillRect(shoulderX + 5 * u, shoulderY + u + rightArm - 2 * u, 3 * u, 2 * u);

    g.fillStyle = '#00e5ff';
    g.fillRect(shoulderX - 5 * u, shoulderY, 10 * u, torsoHeight);
    g.fillStyle = '#0099bb';
    g.fillRect(shoulderX + 3 * u, shoulderY, 2 * u, torsoHeight);
    g.fillStyle = NEON_PINK;
    g.fillRect(shoulderX - 5 * u, shoulderY + 2 * u, 10 * u, 2 * u);

    // Helmet.
    g.fillStyle = '#e8f8ff';
    g.fillRect(headX - 4 * u, headY, 8 * u, headHeight);
    g.fillStyle = NEON_PINK;
    g.fillRect(headX - 4 * u, headY + Math.round(headHeight * 0.62), 8 * u, 2 * u);
    g.fillStyle = '#0099bb';
    g.fillRect(headX + 2 * u, headY, 2 * u, headHeight);
}

/**
 * An obstacle projected onto the road.
 * @param {CanvasRenderingContext2D} g
 * @param {{width: number, height: number, horizon: number}} view
 * @param {number} vpX
 * @param {{type: 'WALL' | 'LOW' | 'HIGH', lane: number, progress: number}} obstacle
 *   progress runs from 0 (at the horizon) to 1 (at the player)
 */
export function renderObstacle(g, view, vpX, { type, lane, progress }) {
    if (progress <= 0 || progress >= 1) return;
    const { width: W, height: H, horizon: HOR } = view;
    const depth = progress * progress;
    const baseY = HOR + depth * (H - HOR);
    const laneX = W / 2 + (lane === 0 ? -1 : 1) * W * 0.125;
    const x = vpX + (laneX - vpX) * depth;
    const w = Math.max(2, 4 + 40 * depth);
    const left = Math.round(x - w / 2);

    const glowBlock = (color, top, height) => {
        g.globalAlpha = 0.3;
        g.fillStyle = color;
        g.fillRect(left - 2, Math.round(top - 2), Math.round(w + 4), Math.round(height + 4));
        g.globalAlpha = 1;
        g.fillRect(left, Math.round(top), Math.round(w), Math.round(height));
    };

    if (type === 'WALL') {
        const h = Math.max(2, w * 1.1);
        glowBlock(NEON_PINK, baseY - h, h);
        g.fillStyle = '#ff5e3a';
        g.fillRect(left, Math.round(baseY - h), Math.round(w), Math.max(1, Math.round(h * 0.15)));
        g.fillStyle = '#8f0f45';
        for (let i = 1; i < 3; i++) {
            g.fillRect(left, Math.round(baseY - h + (i * h) / 3), Math.round(w), 1);
        }
    } else if (type === 'LOW') {
        const h = Math.max(2, w * 0.35);
        glowBlock('#00ff88', baseY - h, h);
        g.fillStyle = '#00aa55';
        g.fillRect(left, Math.round(baseY - Math.max(1, h * 0.4)), Math.round(w), 1);
    } else {
        const barHeight = Math.max(2, w * 0.28);
        const clearance = w * 0.55;
        const barBottom = baseY - clearance;
        const postWidth = Math.max(1, Math.round(w * 0.08));
        g.fillStyle = '#00cc77';
        g.fillRect(left, Math.round(barBottom), postWidth, Math.round(clearance));
        g.fillRect(Math.round(x + w / 2 - postWidth), Math.round(barBottom), postWidth, Math.round(clearance));
        glowBlock('#00ff88', barBottom - barHeight, barHeight);
        g.fillStyle = '#baffdd';
        g.fillRect(left, Math.round(barBottom - barHeight), Math.round(w), 1);
    }
}

export function renderBanner(g, view, text) {
    g.save();
    g.fillStyle = 'rgba(0, 0, 0, 0.6)';
    g.fillRect(0, 26, view.width, 16);
    g.font = '8px "Press Start 2P", monospace';
    g.textAlign = 'center';
    g.fillStyle = NEON_YELLOW;
    g.fillText(text, view.width / 2, 38);
    g.restore();
}
