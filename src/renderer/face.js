// Speaker analysis: face box, head pose, eyes (iris position, gaze direction, blinks) and eye
// contact from MediaPipe Face Landmarker.
// Everything runs on this device. The model file is fetched once by the main process.
(function () {
  'use strict';

  const LIB = new URL('../../node_modules/@mediapipe/tasks-vision/', location.href).href;
  const DETECT_INTERVAL_MS = 33;      // analyse at most ~30 times per second
  const EYE_CONTACT_TAU_S = 20;       // smoothing window for the eye contact percentage
  const GAZE_X_LIMIT = 0.3;           // iris further than this from the eye centre (in half eye widths) is a side glance
  const GAZE_Y_LIMIT = 0.35;          // eye-look up/down blendshape score above this is a vertical glance
  const HEAD_TURN_LIMIT = 0.4;        // nose further than this from the face centre (in half face widths) is a turned head
  const BLINK_LIMIT = 0.5;            // eye-blink blendshape score above this counts as closed
  const BLINK_WINDOW_MS = 60000;

  // Landmark indices (478-point mesh; 468-477 are the irises)
  const NOSE_TIP = 1;
  const EYES = [
    { a: 33, b: 133, iris: 468, edge: 469 },     // the eye on the image's left
    { a: 362, b: 263, iris: 473, edge: 474 }     // the eye on the image's right
  ];
  const DEG = 180 / Math.PI;

  let landmarker = null;
  let state = 'off';                  // off | loading | on | error
  let lastTs = 0, lastRun = 0, lastSeen = 0;
  let face = null;                    // { box, yaw, pitch, roll, looking }
  let eyeContact = null;              // 0..1, null until a face has been seen
  let failed = false;
  let closed = false;                 // eyes currently closed, for blink edge detection
  let blinks = [];                    // timestamps of recent blinks
  let trackedSince = 0;

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
    blinks = [];
    closed = false;
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

  function parse(result, aspect) {
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

    const shape = {};
    const shapes = result.faceBlendshapes && result.faceBlendshapes[0];
    if (shapes && shapes.categories) {
      for (const c of shapes.categories) shape[c.categoryName] = c.score;
    }
    const s2 = (name) => ((shape[name + 'Left'] || 0) + (shape[name + 'Right'] || 0)) / 2;

    // Eyes: where each iris sits between its eye corners. 0 is centred, -1 and +1 are the
    // corners. Only available when the model returns the iris landmarks.
    let eyes = null, gazeX = 0;
    if (lm.length > 477) {
      eyes = EYES.map((e) => {
        const mid = (lm[e.a].x + lm[e.b].x) / 2, half = Math.abs(lm[e.b].x - lm[e.a].x) / 2 || 1e-6;
        return {
          x: lm[e.iris].x, y: lm[e.iris].y,
          r: Math.hypot((lm[e.edge].x - lm[e.iris].x) * aspect, lm[e.edge].y - lm[e.iris].y),
          offset: (lm[e.iris].x - mid) / half
        };
      });
      gazeX = (eyes[0].offset + eyes[1].offset) / 2;
    }
    const up = s2('eyeLookUp'), down = s2('eyeLookDown');
    const gazeY = up > down ? -up : down;              // negative is up
    const blink = s2('eyeBlink');

    let gaze = 'center';
    if (blink > BLINK_LIMIT) gaze = 'closed';
    else if (Math.abs(gazeX) > GAZE_X_LIMIT && Math.abs(gazeX) >= Math.abs(gazeY) * 0.6) gaze = gazeX < 0 ? 'left' : 'right';
    else if (Math.abs(gazeY) > GAZE_Y_LIMIT) gaze = gazeY < 0 ? 'up' : 'down';

    // Head turn measured from the landmarks themselves: how far the nose tip sits from the
    // middle of the face. This does not depend on how the pose matrix is laid out.
    const turn = (lm[NOSE_TIP].x - (x0 + x1) / 2) / ((x1 - x0) / 2 || 1e-6);
    const looking = gaze === 'center' && Math.abs(turn) < HEAD_TURN_LIMIT;

    return { box: { x0, y0, x1, y1 }, yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll, looking, eyes, gaze, gazeX, gazeY, blink };
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
      const next = parse(landmarker.detectForVideo(video, ts), video.videoWidth / video.videoHeight);
      if (next) {
        if (face) {
          // Ease the box so the frame glides instead of jittering.
          const k = 0.4, a = face.box, b = next.box;
          next.box = { x0: a.x0 + (b.x0 - a.x0) * k, y0: a.y0 + (b.y0 - a.y0) * k, x1: a.x1 + (b.x1 - a.x1) * k, y1: a.y1 + (b.y1 - a.y1) * k };
        }
        if (!face) trackedSince = now;
        face = next;
        lastSeen = now;

        // Count a blink on the closing edge.
        const isClosed = next.blink > BLINK_LIMIT;
        if (isClosed && !closed) blinks.push(now);
        closed = isClosed;
        while (blinks.length && now - blinks[0] > BLINK_WINDOW_MS) blinks.shift();

        // A blink is not a glance away: keep the previous eye contact value while closed.
        if (isClosed) return;
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
    get eyeContact() { return eyeContact; },
    /** Blinks per minute over the last minute, or null until 10 seconds of tracking exist. */
    get blinkRate() {
      const span = Math.min(BLINK_WINDOW_MS, performance.now() - trackedSince);
      return face && span >= 10000 ? blinks.length * 60000 / span : null;
    }
  };
})();
