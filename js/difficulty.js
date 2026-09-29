const BASELINE_REACTION_MS = 700;
const FAST_REACTION_MS = 200;
const SLOW_REACTION_MS = 900;
const STREAK_FOR_MAX_SKILL = 25;
const REACTION_SMOOTHING = 0.2;
const SKILL_LEARNING_RATE = 0.1;
const CRASH_PENALTY = 0.6;

/**
 * Online estimate of player skill in [0, 1], built from two signals:
 * how quickly the player gets out of the way of a threat (an exponential
 * moving average of reaction time) and how many obstacles they have cleared
 * in a row. Crashing cuts the estimate, so the game eases off after a failure.
 */
export class DifficultyController {
    constructor() {
        this.streak = 0;
        this.reactionMs = BASELINE_REACTION_MS;
        this.skill = 0.25;
    }

    /** @param {number | null} reactionMs null when the obstacle never threatened the player */
    recordDodge(reactionMs) {
        this.streak++;
        if (reactionMs != null) {
            this.reactionMs += (reactionMs - this.reactionMs) * REACTION_SMOOTHING;
        }
        const reactionScore = clamp01((SLOW_REACTION_MS - this.reactionMs) / (SLOW_REACTION_MS - FAST_REACTION_MS));
        const streakScore = Math.min(1, this.streak / STREAK_FOR_MAX_SKILL);
        const target = 0.5 * reactionScore + 0.5 * streakScore;
        this.skill += (target - this.skill) * SKILL_LEARNING_RATE;
    }

    recordCrash() {
        this.streak = 0;
        this.skill *= CRASH_PENALTY;
    }

    /** Multiplier applied to the current level's obstacle speed. */
    speedMultiplier() {
        return 1 + this.skill * 0.9;
    }

    /** Multiplier applied to the current level's spawn interval (lower = more obstacles). */
    spawnMultiplier() {
        return 1 / (1 + this.skill * 0.8);
    }
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
