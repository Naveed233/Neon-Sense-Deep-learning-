import { CONFIDENCE_THRESHOLD, GESTURES, GESTURE_ICONS, SAMPLES_PER_GESTURE } from './config.js';
import { renderRunner, renderScene } from './renderer.js';

const FRAME_MS = 1000 / 60;
const RECORD_TIMEOUT_MS = 6000;
const FACE_LOST_WARNING_MS = 2000;
// How long the avatar holds a pose after the last confident prediction.
const MIRROR_HOLD_MS = 450;
const AVATAR_VIEW = { width: 160, height: 120, horizon: 50 };
const HIGHLIGHT_POINTS = [1, 33, 263, 152]; // nose tip, outer eye corners, chin

/**
 * The calibration screen: records labelled samples for each gesture, retrains
 * the classifier after each one, and shows a live webcam view plus an avatar
 * that copies whatever the model currently predicts.
 */
export class Calibration {
    constructor({ classifier, video, cameraCanvas, avatarCanvas, statusEl, labelEl, buttons, startButton }) {
        this.classifier = classifier;
        this.video = video;
        this.cameraCtx = cameraCanvas.getContext('2d');
        this.avatarCtx = avatarCanvas.getContext('2d');
        this.statusEl = statusEl;
        this.labelEl = labelEl;
        this.buttons = buttons;
        this.startButton = startButton;

        this.active = false;
        this.recorded = new Set();
        this.recording = null;
        this.training = false;
        this.lastFaceAt = 0;
        this.avatar = { lean: 0, targetLean: 0, duck: 0, targetDuck: 0, height: 0, velocity: 0, phase: 0, frame: 0, mirroredAt: 0 };

        for (const button of buttons) {
            button.addEventListener('click', () => this.record(button.dataset.gesture));
        }
        this.setButtonsEnabled(false);
    }

    activate() {
        this.active = true;
        this.lastFaceAt = performance.now();
        this.setButtonsEnabled(true);
    }

    setStatus(text, isError = false) {
        this.statusEl.textContent = text;
        this.statusEl.classList.toggle('error', isError);
    }

    setButtonsEnabled(enabled) {
        for (const button of this.buttons) button.disabled = !enabled;
    }

    buttonFor(gesture) {
        return this.buttons.find((button) => button.dataset.gesture === gesture);
    }

    record(gesture) {
        if (!this.active || this.recording || this.training) return;
        this.recording = { gesture, samples: [], startedAt: performance.now() };
        this.setButtonsEnabled(false);
        this.buttonFor(gesture).classList.add('active');
        this.setStatus(`RECORDING ${gesture}... HOLD THE POSE`);
    }

    /** Called once per new camera frame. */
    addFrame(features) {
        if (!this.recording || !features) return;
        this.recording.samples.push(features);
        if (this.recording.samples.length >= SAMPLES_PER_GESTURE) this.finishRecording();
    }

    async finishRecording() {
        const { gesture, samples } = this.recording;
        this.recording = null;
        this.buttonFor(gesture).classList.remove('active');
        this.training = true;
        this.setStatus(`TRAINING ON ${this.classifier.sampleCount + samples.length} SAMPLES...`);

        try {
            this.classifier.addSamples(samples, gesture);
            await this.classifier.train();
            this.recorded.add(gesture);
            this.buttonFor(gesture).classList.add('done');

            const remaining = GESTURES.filter((g) => !this.recorded.has(g));
            if (remaining.length === 0) {
                this.startButton.disabled = false;
                this.setStatus('ALL GESTURES LEARNED. CHECK THE RUNNER COPIES YOU, THEN START.');
            } else {
                this.setStatus(`SAVED ${gesture}. STILL TO RECORD: ${remaining.join(', ')}`);
            }
        } catch (err) {
            console.error(err);
            this.setStatus('TRAINING FAILED. RECORD THE GESTURE AGAIN.', true);
        } finally {
            this.training = false;
            this.setButtonsEnabled(true);
        }
    }

    mirror(gesture, now) {
        const a = this.avatar;
        a.mirroredAt = now;
        a.targetLean = gesture === 'LEFT' ? -1 : gesture === 'RIGHT' ? 1 : 0;
        a.targetDuck = gesture === 'DUCK' ? 1 : 0;
        if (gesture === 'JUMP' && a.height === 0) a.velocity = 3.6;
        this.labelEl.textContent = `AI: ${GESTURE_ICONS[gesture]} ${gesture}`;
    }

    update(elapsedMs, now) {
        if (this.recording && now - this.recording.startedAt > RECORD_TIMEOUT_MS) {
            this.buttonFor(this.recording.gesture).classList.remove('active');
            this.recording = null;
            this.setButtonsEnabled(true);
            this.setStatus('NO FACE DETECTED. CHECK YOUR LIGHTING AND TRY AGAIN.', true);
        }

        const a = this.avatar;
        const k = Math.min(elapsedMs, 100) / FRAME_MS;
        if (now - a.mirroredAt > MIRROR_HOLD_MS) {
            a.targetLean = 0;
            a.targetDuck = 0;
        }
        a.lean += (a.targetLean - a.lean) * (1 - 0.86 ** k);
        a.duck += (a.targetDuck - a.duck) * (1 - 0.78 ** k);
        if (a.height > 0 || a.velocity > 0) {
            a.height += a.velocity * k;
            a.velocity -= 0.3 * k;
            if (a.height <= 0) {
                a.height = 0;
                a.velocity = 0;
            }
        }
        a.phase += 0.22 * k;
        a.frame += k;
    }

    draw(landmarks, prediction, now) {
        this.drawCamera(landmarks, prediction, now);
        this.drawAvatar();
    }

    drawCamera(landmarks, prediction, now) {
        const g = this.cameraCtx;
        const { width: w, height: h } = g.canvas;

        if (this.video.readyState < 2 || this.video.videoWidth === 0) {
            g.fillStyle = '#111';
            g.fillRect(0, 0, w, h);
            g.fillStyle = '#ff2975';
            g.font = '12px "Press Start 2P", monospace';
            g.textAlign = 'center';
            g.fillText('NO SIGNAL', w / 2, h / 2);
            g.textAlign = 'left';
            return;
        }

        // Mirrored, so moving left moves left on screen.
        g.save();
        g.translate(w, 0);
        g.scale(-1, 1);
        g.drawImage(this.video, 0, 0, w, h);
        g.restore();

        if (landmarks) {
            this.lastFaceAt = now;
            g.fillStyle = 'rgba(0, 255, 255, 0.85)';
            for (let i = 0; i < landmarks.length; i += 4) {
                g.fillRect((1 - landmarks[i].x) * w, landmarks[i].y * h, 2, 2);
            }
            g.fillStyle = '#ff2975';
            for (const i of HIGHLIGHT_POINTS) {
                g.fillRect((1 - landmarks[i].x) * w - 2, landmarks[i].y * h - 2, 5, 5);
            }
        } else if (this.active && now - this.lastFaceAt > FACE_LOST_WARNING_MS) {
            g.fillStyle = 'rgba(0, 0, 0, 0.6)';
            g.fillRect(0, h - 30, w, 30);
            g.fillStyle = '#ffd319';
            g.font = '8px "Press Start 2P", monospace';
            g.fillText('NO FACE DETECTED', 10, h - 12);
        }

        if (prediction) {
            g.fillStyle = prediction.confidence >= CONFIDENCE_THRESHOLD ? '#00ff66' : '#888';
            g.font = '10px "Press Start 2P", monospace';
            g.fillText(`${prediction.gesture} ${Math.round(prediction.confidence * 100)}%`, 8, 18);
        }
    }

    drawAvatar() {
        const a = this.avatar;
        const g = this.avatarCtx;
        renderScene(g, AVATAR_VIEW, AVATAR_VIEW.width / 2 - a.lean * 10, Math.floor(a.frame), a.frame * 0.012);
        renderRunner(g, {
            x: AVATAR_VIEW.width / 2 + a.lean * 20,
            groundY: AVATAR_VIEW.height - 12,
            phase: a.phase,
            lean: a.lean,
            duck: a.duck,
            lift: a.height * 0.8,
            scale: 1,
        });
    }
}
