// Speaker analysis: face box, head pose and eye contact from MediaPipe Face Landmarker.
// Everything runs on this device. The model file is fetched once by the main process.
(function () {
  'use strict';

  const LIB = new URL('../../node_modules/@mediapipe/tasks-vision/', location.href).href;
  const DETECT_INTERVAL_MS = 33;      // analyse at most ~30 times per second
  const EYE_CONTACT_TAU_S = 20;       // smoothing window for the eye contact percentage
  const POSE_LIMIT_DEG = 15;          // head turned further than this is not "looking at the camera"
  const GAZE_LIMIT = 0.45;            // eye-look blendshape score above this means looking away
  const GAZE_SHAPES = ['eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeLookDownLeft',
    'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeLookDownRight'];
  const DEG = 180 / Math.PI;

  let landmarker = null;
  let state = 'off';                  // off | loading | on | error
  let lastTs = 0, lastRun = 0, lastSeen = 0;
  let face = null;                    // { box, yaw, pitch, roll, looking }
  let eyeContact = null;              // 0..1, null until a face has been seen
  let failed = false;

  function log(level, message) {
    try { window.api.logWrite(level, 'face: ' + message); } catch (e) { /* best effort */ }
  }

  async function start() {
    if (state === 'loading' || state === 'on') return state;
    state = 'loading';
    try {
      const vision = await import(LIB + 'vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(LIB + 'wasm');
      const model = new Uint8Array(await window.api.faceModel());
      const options = (delegate) => ({
        baseOptions: { modelAssetBuffer: model, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      });
      try {
        landmarker = await vision.FaceLandmarker.createFromOptions(fileset, options('GPU'));
        log('info', 'started with the GPU delegate');
      } catch (e) {
        log('warn', 'GPU delegate failed (' + e.message + '), falling back to CPU');
        landmarker = await vision.FaceLandmarker.createFromOptions(fileset, options('CPU'));
      }
      failed = false;
      state = 'on';
    } catch (e) {
      state = 'error';
      log('error', 'could not start: ' + (e && e.message ? e.message : String(e)));
      throw e;
    }
    return state;
  }

  function stop() {
    if (landmarker) {
      try { landmarker.close(); } catch (e) { /* already closed */ }
    }
    landmarker = null;
    face = null;
    eyeContact = null;
    state = 'off';
  }

  // The 4x4 face transform is read as row-major. If the library hands it over column-major the
  // rotation is transposed, which only flips the sign of small angles; magnitudes stay valid.
  function poseFromMatrix(m) {
    if (!m || m.length < 16) return { yaw: 0, pitch: 0, roll: 0 };
    return {
      yaw: Math.atan2(m[2], m[10]) * DEG,
      pitch: Math.asin(Math.max(-1, Math.min(1, -m[6]))) * DEG,
      roll: Math.atan2(m[4], m[5]) * DEG
    };
  }

  function parse(result) {
    const lm = result.faceLandmarks && result.faceLandmarks[0];
    if (!lm || !lm.length) return null;
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (let i = 0; i < lm.length; i++) {
      const p = lm[i];
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const mat = result.facialTransformationMatrixes && result.facialTransformationMatrixes[0];
    const pose = poseFromMatrix(mat && mat.data);
    let gaze = 0;
    const shapes = result.faceBlendshapes && result.faceBlendshapes[0];
    if (shapes && shapes.categories) {
      for (const c of shapes.categories) {
        if (GAZE_SHAPES.indexOf(c.categoryName) >= 0 && c.score > gaze) gaze = c.score;
      }
    }
    const looking = Math.abs(pose.yaw) < POSE_LIMIT_DEG && Math.abs(pose.pitch) < POSE_LIMIT_DEG && gaze < GAZE_LIMIT;
    return { box: { x0, y0, x1, y1 }, yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll, looking };
  }

  /** Analyse the current video frame if it is time to. Call once per drawn frame. */
  function update(video, now) {
    if (state !== 'on' || !landmarker || !video.videoWidth) return;
    if (now - lastRun < DETECT_INTERVAL_MS) return;
    const dt = Math.min(1, (now - lastRun) / 1000);
    lastRun = now;
    const ts = Math.max(lastTs + 1, Math.round(now));   // timestamps must strictly increase
    lastTs = ts;
    try {
      const next = parse(landmarker.detectForVideo(video, ts));
      if (next) {
        if (face) {
          // Ease the box so the frame glides instead of jittering.
          const k = 0.4, a = face.box, b = next.box;
          next.box = { x0: a.x0 + (b.x0 - a.x0) * k, y0: a.y0 + (b.y0 - a.y0) * k, x1: a.x1 + (b.x1 - a.x1) * k, y1: a.y1 + (b.y1 - a.y1) * k };
        }
        face = next;
        lastSeen = now;
        const target = next.looking ? 1 : 0;
        eyeContact = eyeContact === null ? target : eyeContact + (target - eyeContact) * (1 - Math.exp(-dt / EYE_CONTACT_TAU_S));
      } else if (now - lastSeen > 500) {
        face = null;
      }
    } catch (e) {
      if (!failed) {
        failed = true;
        log('error', 'detection failed: ' + (e && e.message ? e.message : String(e)));
      }
    }
  }

  window.faceTracker = {
    start, stop, update,
    get state() { return state; },
    get face() { return face; },
    get eyeContact() { return eyeContact; }
  };
})();
