// Hand tracking: 21 landmarks per hand from MediaPipe Hand Landmarker, plus a small rule-based
// gesture classifier. Everything runs on this device; the model is fetched once by the main
// process. The classifier is exported for unit tests when loaded under Node.
(function (root) {
  'use strict';

  const DETECT_INTERVAL_MS = 33;      // analyse at most ~30 times per second
  const SMOOTH = 0.5;                 // landmark easing, 1 = no smoothing

  // Landmark indices
  const WRIST = 0, THUMB_MCP = 2, THUMB_TIP = 4, INDEX_MCP = 5, MIDDLE_MCP = 9, PINKY_MCP = 17;
  const FINGERS = [
    { name: 'index', pip: 6, tip: 8 },
    { name: 'middle', pip: 10, tip: 12 },
    { name: 'ring', pip: 14, tip: 16 },
    { name: 'pinky', pip: 18, tip: 20 }
  ];
  // Bones to draw, as pairs of landmark indices
  const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
  ];
  const TIPS = [4, 8, 12, 16, 20];

  /**
   * Work out which fingers are extended and name the gesture.
   * `lm` is 21 normalised landmarks; `aspect` is frame width / height, used so that distances
   * are measured in square units.
   * Returns { gesture, fingers: { thumb, index, middle, ring, pinky }, count }.
   */
  function classify(lm, aspect) {
    const a = aspect || 1;
    const d = (i, j) => Math.hypot((lm[i].x - lm[j].x) * a, lm[i].y - lm[j].y);
    const palm = d(WRIST, MIDDLE_MCP) || 1e-6;

    const fingers = { thumb: d(THUMB_TIP, PINKY_MCP) > d(THUMB_MCP, PINKY_MCP) * 1.25 };
    // A finger is extended when its tip is clearly further from the wrist than its middle joint.
    FINGERS.forEach((f) => { fingers[f.name] = d(f.tip, WRIST) > d(f.pip, WRIST) * 1.15; });

    const up = FINGERS.filter((f) => fingers[f.name]).map((f) => f.name);
    const count = up.length + (fingers.thumb ? 1 : 0);
    // Thumb and index tips touching, with the index tip held away from its own knuckle; in a
    // fist the thumb also rests near the index tip, but that tip is curled into the palm.
    const pinch = d(THUMB_TIP, 8) < palm * 0.3 && d(8, INDEX_MCP) > palm * 0.5;

    let gesture = 'count';
    if (pinch && !fingers.middle) gesture = 'pinch';
    else if (pinch && fingers.middle && fingers.ring && fingers.pinky) gesture = 'ok';
    else if (count === 0) gesture = 'fist';
    else if (up.length === 4) gesture = 'open';
    else if (up.length === 0 && fingers.thumb) gesture = 'thumb';
    else if (up.length === 1 && fingers.index) gesture = 'point';
    else if (up.length === 2 && fingers.index && fingers.middle) gesture = 'peace';
    else if (up.length === 2 && fingers.index && fingers.pinky) gesture = 'rock';
    return { gesture, fingers, count };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { classify, CONNECTIONS, TIPS };
    return;
  }

  const LIB = new URL('../../node_modules/@mediapipe/tasks-vision/', location.href).href;
  let landmarker = null;
  let state = 'off';                  // off | loading | on | error
  let lastTs = 0, lastRun = 0;
  let hands = [];                     // [{ side, lm, gesture, fingers, count, box, center }]
  let failed = false;

  function log(level, message) {
    try { root.api.logWrite(level, 'hands: ' + message); } catch (e) { /* best effort */ }
  }

  async function start() {
    if (state === 'loading' || state === 'on') return state;
    state = 'loading';
    try {
      const vision = await import(LIB + 'vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(LIB + 'wasm');
      const model = new Uint8Array(await root.api.handModel());
      const options = (delegate) => ({
        baseOptions: { modelAssetBuffer: model, delegate },
        runningMode: 'VIDEO',
        numHands: 2
      });
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, options('GPU'));
        log('info', 'started with the GPU delegate');
      } catch (e) {
        log('warn', 'GPU delegate failed (' + e.message + '), falling back to CPU');
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, options('CPU'));
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
    hands = [];
    state = 'off';
  }

  function parse(result, aspect) {
    const all = result.landmarks || [];
    const sides = result.handedness || result.handednesses || [];
    const out = [];
    for (let h = 0; h < all.length; h++) {
      let lm = all[h];
      if (!lm || lm.length < 21) continue;
      // The model labels hands as if the image were a mirror. The camera frame is not mirrored,
      // so the label is flipped here to name the person's own left or right hand.
      const label = sides[h] && sides[h][0] ? sides[h][0].categoryName : '';
      const side = label === 'Left' ? 'right' : label === 'Right' ? 'left' : '';

      const prev = hands.find((p) => p.side === side);
      if (prev) {
        lm = lm.map((p, i) => ({ x: prev.lm[i].x + (p.x - prev.lm[i].x) * SMOOTH, y: prev.lm[i].y + (p.y - prev.lm[i].y) * SMOOTH }));
      }
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const p of lm) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
      const c = classify(lm, aspect);
      out.push({
        side, lm,
        gesture: c.gesture, fingers: c.fingers, count: c.count,
        box: { x0, y0, x1, y1 },
        center: { x: (lm[WRIST].x + lm[INDEX_MCP].x + lm[PINKY_MCP].x) / 3, y: (lm[WRIST].y + lm[INDEX_MCP].y + lm[PINKY_MCP].y) / 3 }
      });
    }
    return out;
  }

  /** Analyse the current video frame if it is time to. Call once per drawn frame. */
  function update(video, now) {
    if (state !== 'on' || !landmarker || !video.videoWidth) return;
    if (now - lastRun < DETECT_INTERVAL_MS) return;
    lastRun = now;
    const ts = Math.max(lastTs + 1, Math.round(now));   // timestamps must strictly increase
    lastTs = ts;
    try {
      hands = parse(landmarker.detectForVideo(video, ts), video.videoWidth / video.videoHeight);
    } catch (e) {
      if (!failed) {
        failed = true;
        log('error', 'detection failed: ' + (e && e.message ? e.message : String(e)));
      }
    }
  }

  root.handTracker = {
    start, stop, update, CONNECTIONS, TIPS,
    get state() { return state; },
    get hands() { return hands; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
