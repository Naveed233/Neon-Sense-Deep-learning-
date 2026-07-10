// Shared pixel-art scene renderer. Draws the synthwave world (sky, stars,
// sun, clouds, grid, road) and the runner on any canvas — used by both the
// calibration preview and the real game so they look identical.

const SUN_COLORS = ['#ffd319', '#ffb018', '#ff8c25', '#ff5e3a', '#ff2975'];

function renderScene(g, W, H, HOR, vpX, t, scroll) {
    // Sky: banded gradient for a pixel feel
    const bands = ['#05030f', '#0b0723', '#150b3a', '#221052', '#331463'];
    const bandH = Math.ceil(HOR / bands.length);
    bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * bandH, W, bandH); });

    // Stars with a deterministic twinkle
    g.fillStyle = '#ffffff';
    const starCount = Math.round(W / 7);
    for (let i = 0; i < starCount; i++) {
        if (((t >> 3) + i) % 5 === 0) continue;
        g.fillRect((i * 53 + 7) % W, (i * 29 + 3) % (HOR - 18), 1, 1);
    }

    // Synthwave sun: striped semicircle sitting on the horizon
    const sr = Math.round(W * 0.14);
    for (let dy = -sr; dy <= 0; dy++) {
        const rowY = HOR + dy;
        if (dy > -Math.round(sr * 0.55) && ((dy % 4) === 0 || (dy % 4) === -1)) continue;
        const half = Math.floor(Math.sqrt(sr * sr - dy * dy));
        g.fillStyle = SUN_COLORS[Math.min(SUN_COLORS.length - 1, Math.floor(((dy + sr) / sr) * SUN_COLORS.length * 0.55))];
        g.fillRect(vpX - half, rowY, half * 2, 1);
    }

    // Clouds: drifting pixel clusters at different parallax speeds
    const clouds = [
        { y: HOR * 0.16, s: 0.10, w: W * 0.13 },
        { y: HOR * 0.4, s: 0.16, w: W * 0.16 },
        { y: HOR * 0.64, s: 0.07, w: W * 0.1 }
    ];
    clouds.forEach((c, i) => {
        const cw = Math.round(c.w);
        const cx = ((i * W * 0.4 + t * c.s) % (W + cw * 2)) - cw * 2;
        const cy = Math.round(c.y);
        g.fillStyle = '#4a3a7a';
        g.fillRect(cx, cy, cw, 4);
        g.fillRect(cx + 4, cy - 3, Math.max(4, cw - 10), 3);
        g.fillStyle = '#6a5aa0';
        g.fillRect(cx + 2, cy, Math.max(2, cw - 6), 1);
    });

    // Ground
    g.fillStyle = '#0d0a1e';
    g.fillRect(0, HOR, W, H - HOR);

    const cxB = W / 2; // screen-bottom center

    // Converging grid verticals (drawn first so the road covers the middle)
    g.strokeStyle = 'rgba(0, 255, 255, 0.14)';
    g.lineWidth = 1;
    for (let k = -5; k <= 5; k++) {
        g.beginPath();
        g.moveTo(vpX, HOR);
        g.lineTo(cxB + k * W * 0.21, H);
        g.stroke();
    }
    // Scrolling grid horizontals (accelerate toward the camera)
    for (let i = 0; i < 7; i++) {
        const p = ((i / 7) + scroll * 0.66) % 1;
        const y = HOR + p * p * (H - HOR);
        g.strokeStyle = `rgba(0, 255, 255, ${0.08 + p * 0.3})`;
        g.beginPath();
        g.moveTo(0, y); g.lineTo(W, y);
        g.stroke();
    }

    // Road: perspective trapezoid with neon edges
    const roadHalf = W * 0.275;
    g.fillStyle = '#16122b';
    g.beginPath();
    g.moveTo(vpX - 3, HOR);
    g.lineTo(vpX + 3, HOR);
    g.lineTo(cxB + roadHalf, H);
    g.lineTo(cxB - roadHalf, H);
    g.closePath();
    g.fill();
    g.strokeStyle = '#ff2975';
    g.lineWidth = Math.max(1, W / 160);
    g.beginPath();
    g.moveTo(vpX - 3, HOR); g.lineTo(cxB - roadHalf, H);
    g.moveTo(vpX + 3, HOR); g.lineTo(cxB + roadHalf, H);
    g.stroke();
    g.lineWidth = 1;
    // Center lane dashes scrolling toward the viewer
    g.fillStyle = '#ffd319';
    for (let i = 0; i < 6; i++) {
        const p = ((i / 6) + scroll) % 1;
        const y = HOR + p * p * (H - HOR);
        const dx = vpX + (cxB - vpX) * p * p;
        const dw = Math.max(1, p * W * 0.025);
        const dh = Math.max(1, p * H * 0.05);
        g.fillRect(dx - dw / 2, y, dw, dh);
    }

    // Horizon glow line
    g.fillStyle = '#ff2975';
    g.fillRect(0, HOR, W, 1);
}

// Pixel-art runner, back view. `s` scales the whole body.
function renderRunner(g, x, groundY, phase, lean, duck, jumpLift, s) {
    const airborne = jumpLift > 0.5;
    const stride = Math.sin(phase);
    const bob = airborne ? 0 : Math.abs(Math.cos(phase)) * 1.5 * s;
    const gy = Math.round(groundY - jumpLift - bob);
    const rx = Math.round(x);

    // Shadow shrinks while airborne
    const shScale = Math.max(0.35, 1 - jumpLift / (26 * s));
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.fillRect(Math.round(rx - 9 * s * shScale), Math.round(groundY + 1), Math.round(18 * s * shScale), Math.max(2, Math.round(3 * s)));

    const legLen = Math.round(13 * s * (1 - 0.45 * duck));
    const torsoH = Math.round(12 * s * (1 - 0.35 * duck));
    const headH = Math.round(8 * s);
    const hipY = gy - legLen;
    const shY = hipY - torsoH;
    const headY = shY - headH - 1;
    const leanPx = lean * 5 * s;
    const hipX = Math.round(rx + lean * 2 * s);
    const shX = Math.round(rx + leanPx);
    const headX = Math.round(rx + leanPx * 1.5);
    const u = Math.max(1, Math.round(s)); // pixel unit

    // Legs: alternating stride, tucked when airborne
    const lLift = airborne ? 6 * s : Math.max(0, stride) * 7 * s;
    const rLift = airborne ? 6 * s : Math.max(0, -stride) * 7 * s;
    const lLegH = Math.max(3 * u, Math.round(legLen - lLift));
    const rLegH = Math.max(3 * u, Math.round(legLen - rLift));
    g.fillStyle = '#0e7c9e';
    g.fillRect(hipX - 5 * u, hipY, 4 * u, lLegH);
    g.fillRect(hipX + 1 * u, hipY, 4 * u, rLegH);
    // Shoes
    g.fillStyle = '#ff2975';
    g.fillRect(hipX - 5 * u, hipY + lLegH - 2 * u, 4 * u, 2 * u);
    g.fillRect(hipX + 1 * u, hipY + rLegH - 2 * u, 4 * u, 2 * u);

    // Arms swing opposite the legs
    const armLen = Math.round(10 * s * (1 - 0.3 * duck));
    const lArmH = Math.max(3 * u, Math.round(armLen - Math.max(0, -stride) * 5 * s));
    const rArmH = Math.max(3 * u, Math.round(armLen - Math.max(0, stride) * 5 * s));
    g.fillStyle = '#00b8d9';
    g.fillRect(shX - 8 * u, shY + u, 3 * u, lArmH);
    g.fillRect(shX + 5 * u, shY + u, 3 * u, rArmH);
    // Gloves
    g.fillStyle = '#ffd319';
    g.fillRect(shX - 8 * u, shY + u + lArmH - 2 * u, 3 * u, 2 * u);
    g.fillRect(shX + 5 * u, shY + u + rArmH - 2 * u, 3 * u, 2 * u);

    // Torso: suit with racing stripe and side shading
    g.fillStyle = '#00e5ff';
    g.fillRect(shX - 5 * u, shY, 10 * u, torsoH);
    g.fillStyle = '#0099bb';
    g.fillRect(shX + 3 * u, shY, 2 * u, torsoH);
    g.fillStyle = '#ff2975';
    g.fillRect(shX - 5 * u, shY + 2 * u, 10 * u, 2 * u);

    // Head: helmet, back view
    g.fillStyle = '#e8f8ff';
    g.fillRect(headX - 4 * u, headY, 8 * u, headH);
    g.fillStyle = '#ff2975';
    g.fillRect(headX - 4 * u, headY + Math.round(headH * 0.62), 8 * u, 2 * u);
    g.fillStyle = '#0099bb';
    g.fillRect(headX + 2 * u, headY, 2 * u, headH);
}
