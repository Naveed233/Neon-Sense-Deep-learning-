# NeuroRunner

An endless runner you play with your face. Tilt your head to switch lanes, duck to slide under barriers, blink to jump. There is no pre-trained gesture model behind it — the game trains a small neural network on *you*, in the browser, in about a minute, before every session.

Everything runs client-side: face tracking, model training, inference, and the game itself. No backend, no accounts, and no video ever leaves your machine.

## How it works

1. **Face tracking.** MediaPipe Face Landmarker reads 478 facial landmarks from your webcam every frame.
2. **Feature extraction.** Each frame is reduced to a ~20-value feature vector: key points (nose, eyes, chin, forehead) expressed relative to the nose and normalized by face width, plus eye-openness distances for blink detection. This makes the features stable regardless of where you sit or how far you are from the camera.
3. **Calibration = training.** You record five poses — idle, left, right, duck, jump — about 40 frames each. A small TensorFlow.js network (two hidden layers, softmax over the five gestures) is trained on those samples directly in the page. Training takes a couple of seconds per gesture.
4. **Live classification.** During play the model classifies your face every frame. Instead of hand-tuned angle thresholds, the decision is the model's own softmax output, and a 70% confidence gate filters out uncertain predictions so noise doesn't twitch the runner. The current prediction and confidence are always visible in the HUD.
5. **Adaptive difficulty.** A small controller estimates your skill from two live signals — reaction time (how quickly you clear a threat once it's in range, tracked as an exponential moving average) and your current dodge streak. The estimate drives obstacle speed and spawn frequency, and drops when you crash so the game backs off. It persists across retries, so it keeps tracking you between runs.

The whole loop — detection, inference, physics, rendering — runs once per animation frame. The game renders at a 320x240 internal resolution upscaled with crisp pixels, which keeps drawing cheap; there is an FPS counter in the HUD if you want to check it holds 30+ on your machine.

## Run it locally

The browser only exposes the camera to secure contexts, so opening the HTML file directly (`file://`) will not work. Serve it over localhost instead.

With Python (preinstalled on macOS):

```
cd NeuroRunner
python3 -m http.server 8000
```

Then open http://localhost:8000 in Chrome and allow camera access when prompted.

Any static file server works the same way, for example `npx serve`.

Notes:

- Chrome or Edge recommended; MediaPipe's GPU path is most reliable there.
- You need an internet connection on first load — TensorFlow.js, MediaPipe and the face model are pulled from CDNs.
- On macOS, if the camera view stays black, check System Settings > Privacy & Security > Camera and make sure your browser is allowed.

## Playing

1. Click INITIALIZE AI SYSTEM and allow the camera.
2. Record all five gestures. Hold each pose while it records — exaggerate them, especially left/right tilt.
3. Test before starting: the small pixel runner under the camera preview mirrors what the model sees. If it doesn't copy you reliably, re-record the gestures it confuses (re-recording adds more training data).
4. Start the game. Pink walls: change lane. Low green barriers: jump. Green overhead bars: duck.
5. After a crash, RETRY RUN restarts instantly and keeps your calibration; REBOOT starts over from scratch.

Arrow keys also work during play, which is useful for checking whether a problem is in the game or in the gesture detection.

## Project structure

```
index.html            markup and script loading order
css/style.css         all styling
js/vision-loader.js   imports MediaPipe (ES module) and exposes it globally
js/state.js           shared config, game state, DOM references
js/audio.js           procedural sound effects (Web Audio oscillators)
js/renderer.js        pixel-art scene + runner renderer, shared by game and calibration
js/ai.js              camera, face tracking, feature extraction, model training
js/avatar.js          calibration screen: webcam preview overlay + mirroring avatar
js/game.js            game logic, obstacles, collision, adaptive difficulty
js/main.js            the per-frame loop tying it all together
```

The scripts are plain (non-module) scripts sharing global scope, loaded in dependency order — deliberately simple, no build step. `js/vision-loader.js` is the one ES module because MediaPipe only ships that way.

## Background

This project started at a Vibe Coders Tokyo event hosted at Google's Shibuya office, themed around Gemma and local LLM models. The idea came out of a conversation there about self-driving vehicles adapting and evolving through deep learning patterns — NeuroRunner is a browser-sized take on the same principle: a system that learns its user instead of shipping with fixed rules.

The game was built against this design brief:

- Use MediaPipe Face Landmarker to extract facial landmarks.
- Train a lightweight TensorFlow.js neural network during the calibration phase using the player's own gestures (left, right, jump, duck, idle).
- Perform real-time gesture classification instead of relying on fixed thresholds.
- Display the model's confidence score and use it to filter uncertain predictions.
- Adapt game difficulty with a lightweight model that adjusts obstacle frequency and speed based on player performance, reaction time and success rate.
- All inference and training run locally in the browser with no backend, maintaining at least 30 FPS during gameplay.

Thanks to Vibe Coders Tokyo for hosting, and to the presenters Ju-yeong Ji and Alastair Tse.

## License

MIT
