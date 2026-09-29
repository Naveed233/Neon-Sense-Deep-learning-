import { GESTURES } from './config.js';
import { fitStandardizer, standardize } from './features.js';

const EPOCHS = 60;
const LEARNING_RATE = 0.01;

/**
 * Small feed-forward network trained in the browser on the player's own
 * calibration samples. `tf` is the TensorFlow.js global loaded in index.html.
 */
export class GestureClassifier {
    constructor() {
        this.samples = [];
        this.labels = [];
        this.model = null;
        this.scaler = null;
    }

    async prepare() {
        if (typeof tf === 'undefined') {
            throw new Error('TensorFlow.js failed to load. Check your connection and reload.');
        }
        // The network is tiny, so the CPU backend is faster than paying for a
        // GPU readback every frame, and it leaves the GPU to MediaPipe.
        await tf.setBackend('cpu');
        await tf.ready();
    }

    get sampleCount() {
        return this.samples.length;
    }

    addSamples(featureRows, gesture) {
        const label = GESTURES.indexOf(gesture);
        for (const row of featureRows) {
            this.samples.push(row);
            this.labels.push(label);
        }
    }

    async train() {
        const scaler = fitStandardizer(this.samples);
        const model = tf.sequential({
            layers: [
                tf.layers.dense({ units: 16, activation: 'relu', inputShape: [this.samples[0].length] }),
                tf.layers.dense({ units: 8, activation: 'relu' }),
                tf.layers.dense({ units: GESTURES.length, activation: 'softmax' }),
            ],
        });
        // model.dispose() doesn't free an optimizer passed in from outside, so
        // its state is released here once training is done.
        const optimizer = tf.train.adam(LEARNING_RATE);
        model.compile({ optimizer, loss: 'categoricalCrossentropy' });

        const xs = tf.tensor2d(this.samples.map((row) => standardize(row, scaler)));
        const ys = tf.tidy(() => tf.oneHot(tf.tensor1d(this.labels, 'int32'), GESTURES.length));
        try {
            await model.fit(xs, ys, { epochs: EPOCHS, shuffle: true, verbose: 0 });
        } finally {
            xs.dispose();
            ys.dispose();
            optimizer.dispose();
        }

        // Swap model and scaler together so predict() never mixes old and new.
        this.model?.dispose();
        this.model = model;
        this.scaler = scaler;
    }

    /** @returns {{gesture: string, confidence: number} | null} */
    predict(features) {
        if (!this.model) return null;
        const probabilities = tf.tidy(() =>
            Array.from(this.model.predict(tf.tensor2d([standardize(features, this.scaler)])).dataSync()),
        );
        let best = 0;
        for (let i = 1; i < probabilities.length; i++) {
            if (probabilities[i] > probabilities[best]) best = i;
        }
        return { gesture: GESTURES[best], confidence: probabilities[best] };
    }
}
