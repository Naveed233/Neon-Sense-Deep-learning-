import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DifficultyController } from '../js/difficulty.js';

test('fast, consistent dodging makes the game harder', () => {
    const difficulty = new DifficultyController();
    const initialSpeed = difficulty.speedMultiplier();
    const initialSpawn = difficulty.spawnMultiplier();

    for (let i = 0; i < 40; i++) difficulty.recordDodge(250);

    assert.ok(difficulty.speedMultiplier() > initialSpeed);
    assert.ok(difficulty.spawnMultiplier() < initialSpawn);
});

test('slow reactions ramp up less than fast ones', () => {
    const fast = new DifficultyController();
    const slow = new DifficultyController();
    for (let i = 0; i < 20; i++) {
        fast.recordDodge(250);
        slow.recordDodge(850);
    }
    assert.ok(fast.skill > slow.skill);
});

test('crashing lowers the skill estimate and resets the streak', () => {
    const difficulty = new DifficultyController();
    for (let i = 0; i < 20; i++) difficulty.recordDodge(300);
    const before = difficulty.skill;

    difficulty.recordCrash();

    assert.ok(difficulty.skill < before);
    assert.equal(difficulty.streak, 0);
});

test('obstacles that never threatened the player do not affect reaction time', () => {
    const difficulty = new DifficultyController();
    const before = difficulty.reactionMs;
    difficulty.recordDodge(null);
    assert.equal(difficulty.reactionMs, before);
    assert.equal(difficulty.streak, 1);
});

test('skill stays within [0, 1]', () => {
    const difficulty = new DifficultyController();
    for (let i = 0; i < 500; i++) {
        if (i % 37 === 0) difficulty.recordCrash();
        else difficulty.recordDodge(i % 3 === 0 ? 50 : 2000);
        assert.ok(difficulty.skill >= 0 && difficulty.skill <= 1);
    }
});
