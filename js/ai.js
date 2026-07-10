// Camera access, MediaPipe face tracking, and the per-player gesture model.
// The model is a small TensorFlow.js network trained in the browser during
// calibration — there is no pre-trained gesture classifier and no backend.

// Robust camera access across secure contexts and older getUserMedia APIs.
function getCameraStream() {
    const constraints = { video: { width: 640, height: 480 } };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        return navigator.mediaDevices.getUserMedia(constraints);
    }

    const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                   navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (legacy) {
        return new Promise((resolve, reject) => legacy.call(navigator, constraints, resolve, reject));
    }

    const diag = `Camera API unavailable.\n\n` +
        `isSecureContext: ${window.isSecureContext}\n` +
        `location: ${location.href}\n` +
        `mediaDevices present: ${!!navigator.mediaDevices}\n\n` +
        `If isSecureContext is false, open the page via http://localhost:8000 ` +
        `in Chrome (not file://, not an embedded preview).`;
    return Promise.reject(new Error(diag));
}

async function initSystem() {
    document.getElementById('screen-title').classList.add('hidden');
    document.getElementById('screen-calib').classList.remove('hidden');

    try {
        // Wait for the MediaPipe ES module to finish loading (the button may
        // be clicked before the CDN import resolves)
        let waited = 0;
        while (!window.mediapipeReady && waited < 10000) {
            await new Promise(r => setTimeout(r, 100));
            waited += 100;
        }
        if (!window.FaceLandmarker) {
            throw new Error("MediaPipe library not loaded. Check your internet connection or CDN.");
        }

        const stream = await getCameraStream();
        video.srcObject = stream;
        video.muted = true;
        await new Promise((resolve) => {
            if (video.readyState >= 2) return resolve();
            video.onloadedmetadata = () => resolve();
        });
        try { await video.play(); } catch (playErr) { console.warn('video.play() blocked:', playErr); }

        const track = stream.getVideoTracks()[0];
        console.log('Camera track:', track.label, 'state:', track.readyState, 'muted:', track.muted, track.getSettings());

        // Resolve the WASM runtime, then create the FaceLandmarker
        const filesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        faceLandmarker = await FaceLandmarker.createFromOptions(
            filesetResolver,
            {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numFaces: 1
            }
        );

        document.getElementById('calib-status').innerText = "SYSTEM ONLINE. START CALIBRATION.";

    } catch (e) {
        console.error(e);
        alert("System Error: " + e.message + "\n\nMake sure you are serving over http://localhost (not file://).");
    }
}

// Convert raw landmarks into a small, scale- and position-invariant feature
// vector: key points relative to the nose, normalized by face width, plus
// eye openness for blink detection.
function extractFeatures(results) {
    if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) return null;
    const landmarks = results.faceLandmarks[0];
    const origin = landmarks[1];
    const scale = Math.abs(landmarks[234].x - landmarks[454].x);
    const keyIndices = [1, 33, 263, 133, 362, 152, 200, 10, 199];
    let features = [];
    keyIndices.forEach(idx => {
        features.push((landmarks[idx].x - origin.x) / scale);
        features.push((landmarks[idx].y - origin.y) / scale);
    });
    features.push(Math.abs(landmarks[159].y - landmarks[145].y)); // left eye openness
    features.push(Math.abs(landmarks[386].y - landmarks[374].y)); // right eye openness
    return features;
}

async function startRecording(gesture) {
    if (!faceLandmarker) { document.getElementById('calib-status').innerText = "AI NOT READY YET..."; return; }
    activeGesture = gesture;
    isRecording = true;

    document.querySelectorAll('.calib-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-gesture="${gesture}"]`).classList.add('active');
    document.getElementById('calib-status').innerText = `RECORDING ${gesture}... HOLD POSITION!`;

    // Sample the shared feature stream produced by the main loop
    // (a single detector instance, no contention)
    let samples = 0;
    const recordingInterval = setInterval(() => {
        if (latestFeats) {
            calibrationData.push(latestFeats);
            calibrationLabels.push(CONFIG.gestures.indexOf(gesture));
            samples++;
        }
        if (samples >= 40) {
            clearInterval(recordingInterval);
            stopRecording();
        }
    }, 33);
}

async function stopRecording() {
    isRecording = false;
    trainedGestures.add(activeGesture);
    document.getElementById('calib-status').innerText = `SAVED ${activeGesture}!`;

    await trainModel();

    if (trainedGestures.size === CONFIG.gestures.length) {
        document.getElementById('start-game-btn').disabled = false;
        document.getElementById('calib-status').innerText = "ALL GESTURES LOCKED. TEST THEM: THE RUNNER MUST MIRROR YOU. THEN START!";
    }
}

async function trainModel() {
    if (calibrationData.length === 0) return;
    const inputDim = calibrationData[0].length;
    const outputDim = CONFIG.gestures.length;

    model = tf.sequential();
    model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [inputDim] }));
    model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
    model.add(tf.layers.dense({ units: outputDim, activation: 'softmax' }));
    model.compile({ optimizer: tf.train.sgd(0.01), loss: 'categoricalCrossentropy' });

    const xs = tf.tensor2d(calibrationData);
    const ys = tf.oneHot(tf.tensor1d(calibrationLabels, 'int32'), outputDim);
    await model.fit(xs, ys, { epochs: 50, verbose: 0 });
    xs.dispose();
    ys.dispose();
}
