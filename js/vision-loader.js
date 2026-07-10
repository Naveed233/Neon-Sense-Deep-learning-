// MediaPipe Tasks Vision ships as an ES module, so it is imported here and the
// two classes the game needs are exposed as globals for the classic scripts.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

window.FaceLandmarker = FaceLandmarker;
window.FilesetResolver = FilesetResolver;
window.mediapipeReady = true;
