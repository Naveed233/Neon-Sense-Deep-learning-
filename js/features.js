// Indices into MediaPipe's 478-point face mesh.
const NOSE_TIP = 1;
const FACE_EDGE_LEFT = 234;
const FACE_EDGE_RIGHT = 454;
// Eye corners, chin and forehead: enough to describe head roll, pitch and yaw.
const KEY_POINTS = [33, 263, 133, 362, 152, 200, 10, 199];
const LEFT_EYE_LIDS = [159, 145];
const RIGHT_EYE_LIDS = [386, 374];

export const FEATURE_COUNT = KEY_POINTS.length * 2 + 2;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Reduces a face mesh to a small pose descriptor. Points are expressed relative
 * to the nose and divided by face width, so the result does not change when the
 * player moves around the frame or sits closer to the camera.
 *
 * @param {{x: number, y: number}[] | null} landmarks
 * @returns {number[] | null} null when there is no usable face
 */
export function extractFeatures(landmarks) {
    if (!landmarks || landmarks.length <= FACE_EDGE_RIGHT) return null;

    const origin = landmarks[NOSE_TIP];
    const faceWidth = distance(landmarks[FACE_EDGE_LEFT], landmarks[FACE_EDGE_RIGHT]);
    if (faceWidth < 1e-6) return null;

    const features = [];
    for (const i of KEY_POINTS) {
        features.push(
            (landmarks[i].x - origin.x) / faceWidth,
            (landmarks[i].y - origin.y) / faceWidth,
        );
    }
    // Eye openness, used to detect blinks.
    features.push(
        distance(landmarks[LEFT_EYE_LIDS[0]], landmarks[LEFT_EYE_LIDS[1]]) / faceWidth,
        distance(landmarks[RIGHT_EYE_LIDS[0]], landmarks[RIGHT_EYE_LIDS[1]]) / faceWidth,
    );
    return features;
}

/**
 * Per-feature mean and standard deviation of the training set. Standardising
 * inputs lets the eye-openness values (tiny) and point offsets (larger)
 * contribute on the same scale.
 *
 * @param {number[][]} samples
 */
export function fitStandardizer(samples) {
    const n = samples.length;
    const dims = samples[0].length;
    const mean = new Array(dims).fill(0);
    const std = new Array(dims).fill(0);

    for (const sample of samples) {
        for (let j = 0; j < dims; j++) mean[j] += sample[j] / n;
    }
    for (const sample of samples) {
        for (let j = 0; j < dims; j++) std[j] += (sample[j] - mean[j]) ** 2 / n;
    }
    for (let j = 0; j < dims; j++) {
        std[j] = Math.sqrt(std[j]);
        if (std[j] < 1e-8) std[j] = 1; // constant feature: avoid dividing by zero
    }
    return { mean, std };
}

export function standardize(features, { mean, std }) {
    return features.map((value, j) => (value - mean[j]) / std[j]);
}
