const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3';
const MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * Webcam capture plus MediaPipe Face Landmarker. MediaPipe is imported lazily
 * so players who skip the camera never download it.
 */
export class FaceTracker {
    constructor(video) {
        this.video = video;
        this.landmarker = null;
        this.landmarks = null;
        this.lastVideoTime = -1;
    }

    get ready() {
        return this.landmarker !== null;
    }

    async start() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Camera access needs a secure page (https:// or http://localhost).');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: false,
        });
        this.video.srcObject = stream;
        await this.video.play();

        const { FaceLandmarker, FilesetResolver } = await import(`${VISION_URL}/vision_bundle.mjs`);
        const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
        const create = (delegate) =>
            FaceLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate },
                runningMode: 'VIDEO',
                numFaces: 1,
            });
        this.landmarker = await create('GPU').catch(() => create('CPU'));
    }

    /**
     * Runs detection if the camera has produced a new frame since the last call.
     * @returns {boolean} whether `landmarks` was updated
     */
    detect(now) {
        if (!this.landmarker || this.video.readyState < 2) return false;
        if (this.video.currentTime === this.lastVideoTime) return false;
        this.lastVideoTime = this.video.currentTime;

        const result = this.landmarker.detectForVideo(this.video, now);
        this.landmarks = result.faceLandmarks?.[0] ?? null;
        return true;
    }
}
