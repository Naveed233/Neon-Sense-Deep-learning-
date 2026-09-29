import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DifficultyController } from '../js/difficulty.js';
import { Game } from '../js/game.js';

const FRAME_MS = 1000 / 60;
const silentAudio = { start() {}, move() {}, jump() {}, duck() {}, levelUp() {}, crash() {} };

// A running game with one hand-placed obstacle and random spawning disabled.
function setup(obstacle) {
    const crashes = [];
    const game = new Game(null, {
        difficulty: new DifficultyController(),
        audio: silentAudio,
        onCrash: (score) => crashes.push(score),
    });
    game.start();
    game.spawnTimer = Infinity;
    game.obstacles = [{ dangerAt: null, threatened: false, reactionMs: null, ...obstacle }];
    return { game, crashes };
}

function runFrames(game, count) {
    for (let i = 0; i < count && game.running; i++) game.update(FRAME_MS);
}

test('a wall in the player lane ends the run', () => {
    const { game, crashes } = setup({ type: 'WALL', lane: 0, z: 100 });
    runFrames(game, 60);
    assert.equal(game.running, false);
    assert.equal(crashes.length, 1);
});

test('changing lanes avoids a wall', () => {
    const { game, crashes } = setup({ type: 'WALL', lane: 0, z: 150 });
    game.handleGesture('RIGHT');
    runFrames(game, 60);
    assert.equal(crashes.length, 0);
});

test('jumping clears a low barrier', () => {
    const { game, crashes } = setup({ type: 'LOW', lane: 0, z: 150 });
    game.handleGesture('JUMP');
    runFrames(game, 60);
    assert.equal(crashes.length, 0);
});

test('not jumping hits a low barrier', () => {
    const { game, crashes } = setup({ type: 'LOW', lane: 0, z: 150 });
    runFrames(game, 60);
    assert.equal(crashes.length, 1);
});

test('ducking clears an overhead bar', () => {
    const { game, crashes } = setup({ type: 'HIGH', lane: 0, z: 150 });
    game.handleGesture('DUCK');
    runFrames(game, 60);
    assert.equal(crashes.length, 0);
});

test('passing an obstacle scores points', () => {
    const { game } = setup({ type: 'WALL', lane: 1, z: 50 });
    runFrames(game, 30);
    assert.equal(game.score, 10);
    assert.equal(game.obstacles.length, 0);
});

test('game speed does not depend on frame rate', () => {
    const at60 = setup({ type: 'WALL', lane: 1, z: 900 }).game;
    const at120 = setup({ type: 'WALL', lane: 1, z: 900 }).game;
    for (let i = 0; i < 60; i++) at60.update(1000 / 60);
    for (let i = 0; i < 120; i++) at120.update(1000 / 120);
    assert.ok(Math.abs(at60.obstacles[0].z - at120.obstacles[0].z) < 1);
});
