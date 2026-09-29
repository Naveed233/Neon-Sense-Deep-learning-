import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractFeatures, FEATURE_COUNT, fitStandardizer, standardize } from '../js/features.js';

// Deterministic pseudo-random face mesh with MediaPipe's 478 points.
function makeFace(seed = 42) {
    let state = seed;
    const random = () => {
        state = (state * 16807) % 2147483647;
        return state / 2147483647;
    };
    return Array.from({ length: 478 }, () => ({ x: 0.3 + random() * 0.4, y: 0.3 + random() * 0.4, z: 0 }));
}

function assertClose(actual, expected, tolerance = 1e-9) {
    assert.equal(actual.length, expected.length);
    actual.forEach((value, i) => {
        assert.ok(Math.abs(value - expected[i]) < tolerance, `index ${i}: ${value} vs ${expected[i]}`);
    });
}

test('returns null when there is no face', () => {
    assert.equal(extractFeatures(null), null);
    assert.equal(extractFeatures([]), null);
});

test('produces a fixed-length vector', () => {
    assert.equal(extractFeatures(makeFace()).length, FEATURE_COUNT);
});

test('is unaffected by where the face is in the frame', () => {
    const face = makeFace();
    const shifted = face.map((p) => ({ ...p, x: p.x + 0.12, y: p.y - 0.07 }));
    assertClose(extractFeatures(shifted), extractFeatures(face));
});

test('is unaffected by distance from the camera', () => {
    const face = makeFace();
    const scaled = face.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * 1.8, y: 0.5 + (p.y - 0.5) * 1.8 }));
    assertClose(extractFeatures(scaled), extractFeatures(face));
});

test('changes when the head tilts', () => {
    const face = makeFace();
    const nose = face[1];
    const angle = (15 * Math.PI) / 180;
    const tilted = face.map((p) => {
        const dx = p.x - nose.x;
        const dy = p.y - nose.y;
        return { ...p, x: nose.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: nose.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
    });
    const original = extractFeatures(face);
    const rotated = extractFeatures(tilted);
    assert.ok(rotated.some((value, i) => Math.abs(value - original[i]) > 1e-3));
});

test('standardizer gives zero mean and unit variance', () => {
    const samples = [[1, 10], [2, 20], [3, 30], [4, 40]];
    const scaler = fitStandardizer(samples);
    const standardized = samples.map((row) => standardize(row, scaler));

    for (let j = 0; j < 2; j++) {
        const column = standardized.map((row) => row[j]);
        const mean = column.reduce((a, b) => a + b, 0) / column.length;
        const variance = column.reduce((a, b) => a + (b - mean) ** 2, 0) / column.length;
        assert.ok(Math.abs(mean) < 1e-9);
        assert.ok(Math.abs(variance - 1) < 1e-9);
    }
});

test('standardizer handles constant features without NaN', () => {
    const scaler = fitStandardizer([[5, 1], [5, 2], [5, 3]]);
    const result = standardize([5, 2], scaler);
    assert.ok(result.every(Number.isFinite));
    assert.equal(result[0], 0);
});
