/**
 * Shadow Boxing Tracker — app.js
 * MediaPipe Pose JS port of shadow_boxing_cv.py
 *
 * Algorithm mirrors the Python version:
 *  - Velocity > threshold (normalised by shoulder width)
 *  - Arm extension > threshold
 *  - Extension delta > 0.16 (arm moving forward)
 *  - Elbow angle > threshold (arm reasonably straight)
 *  - 280 ms cooldown per hand
 */

'use strict';

// ── MediaPipe Pose landmark indices (mirrors mp_pose.PoseLandmark) ──────────
const LM = {
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13,
  RIGHT_ELBOW:    14,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
};

// ── Tunable thresholds (can be changed via sliders) ─────────────────────────
let THRESH = {
  velocity:      3.2,   // normalised units / second
  extension:     1.22,  // wrist-to-shoulder / shoulder-width
  extDelta:      0.16,  // minimum extension increase per frame
  elbowAngle:    145,   // degrees — must be > this to count as straight
  cooldown:      0.28,  // seconds between punches per hand
  comboWindow:   1.2,   // seconds within which consecutive = combo
};

// ── Math helpers ─────────────────────────────────────────────────────────────
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angle(a, b, c) {
  // angle at vertex b
  const bax = a.x - b.x, bay = a.y - b.y;
  const bcx = c.x - b.x, bcy = c.y - b.y;
  const nba = Math.hypot(bax, bay);
  const nbc = Math.hypot(bcx, bcy);
  if (nba < 1e-9 || nbc < 1e-9) return 0;
  const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (nba * nbc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Convert normalised landmark (0-1) to pixel coords
function lmPx(lm, w, h) {
  return { x: lm.x * w, y: lm.y * h };
}

// ── Hand tracker state (mirrors Python HandTracker dataclass) ────────────────
function makeHand() {
  return {
    lastPos: null,
    lastT: 0,
    lastExtension: 0,
    cooldownUntil: 0,
    punches: 0,
    lastAngle: 0,
  };
}

// ── Session stats (mirrors Python SessionStats) ──────────────────────────────
function makeStats() {
  return {
    total: 0,
    left: 0,
    right: 0,
    combo: 0,
    bestCombo: 0,
    lastPunchT: 0,
    startedAt: performance.now() / 1000,
  };
}

function registerPunch(stats, side, tNow) {
  stats.total++;
  if (side === 'left') stats.left++; else stats.right++;

  if (stats.lastPunchT && (tNow - stats.lastPunchT) <= THRESH.comboWindow) {
    stats.combo++;
  } else {
    stats.combo = 1;
  }
  stats.bestCombo = Math.max(stats.bestCombo, stats.combo);
  stats.lastPunchT = tNow;
}

function punchesPerMinute(stats, tNow) {
  const elapsed = Math.max(tNow - stats.startedAt, 1e-6);
  return (stats.total / elapsed) * 60;
}

// ── ShadowBoxingAnalyzer (mirrors Python class) ──────────────────────────────
function makeAnalyzer() {
  return {
    hands: { left: makeHand(), right: makeHand() },
    stats: makeStats(),
  };
}

function detectForSide(analyzer, side, shoulder, elbow, wrist, torsoScale, tNow) {
  const hand = analyzer.hands[side];

  const extension = dist(shoulder, wrist) / torsoScale;
  const elbowAngle = angle(shoulder, elbow, wrist);

  if (hand.lastPos === null) {
    hand.lastPos = { ...wrist };
    hand.lastT = tNow;
    hand.lastExtension = extension;
    hand.lastAngle = elbowAngle;
    return false;
  }

  const dt = Math.max(tNow - hand.lastT, 1e-6);
  const velocity = (dist(wrist, hand.lastPos) / torsoScale) / dt;
  const extensionDelta = extension - hand.lastExtension;

  let punched = false;
  if (tNow >= hand.cooldownUntil) {
    if (
      velocity > THRESH.velocity &&
      extension > THRESH.extension &&
      extensionDelta > THRESH.extDelta &&
      elbowAngle > THRESH.elbowAngle
    ) {
      hand.punches++;
      hand.cooldownUntil = tNow + THRESH.cooldown;
      registerPunch(analyzer.stats, side, tNow);
      punched = true;
    }
  }

  hand.lastPos = { ...wrist };
  hand.lastT = tNow;
  hand.lastExtension = extension;
  hand.lastAngle = elbowAngle;
  return punched;
}

function processLandmarks(analyzer, landmarks, w, h) {
  const lms = landmarks;

  // Extract pixel coords
  const lSh = lmPx(lms[LM.LEFT_SHOULDER],  w, h);
  const rSh = lmPx(lms[LM.RIGHT_SHOULDER], w, h);
  const lEl = lmPx(lms[LM.LEFT_ELBOW],     w, h);
  const rEl = lmPx(lms[LM.RIGHT_ELBOW],    w, h);
  const lWr = lmPx(lms[LM.LEFT_WRIST],     w, h);
  const rWr = lmPx(lms[LM.RIGHT_WRIST],    w, h);

  const torsoScale = Math.max(dist(lSh, rSh), 40);
  const tNow = performance.now() / 1000;

  const leftPunch  = detectForSide(analyzer, 'left',  lSh, lEl, lWr, torsoScale, tNow);
  const rightPunch = detectForSide(analyzer, 'right', rSh, rEl, rWr, torsoScale, tNow);

  return {
    leftPunch, rightPunch,
    stats: analyzer.stats,
    points: { lSh, rSh, lEl, rEl, lWr, rWr },
    angles: {
      left:  analyzer.hands.left.lastAngle,
      right: analyzer.hands.right.lastAngle,
    },
  };
}

// ── Canvas drawing ───────────────────────────────────────────────────────────
const POSE_CONNECTIONS = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW,    LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW,    LM.RIGHT_WRIST],
];

function drawSkeleton(ctx, landmarks, w, h) {
  // Connections
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.85)';

  for (const [a, b] of POSE_CONNECTIONS) {
    const pa = lmPx(landmarks[a], w, h);
    const pb = lmPx(landmarks[b], w, h);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // Landmark dots
  const keyLMs = Object.values(LM);
  for (const idx of keyLMs) {
    const p = lmPx(landmarks[idx], w, h);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(200, 200, 200, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 180, 255, 1)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawArmLines(ctx, pts) {
  // Left arm line: shoulder → wrist (cyan)
  ctx.beginPath();
  ctx.moveTo(pts.lSh.x, pts.lSh.y);
  ctx.lineTo(pts.lWr.x, pts.lWr.y);
  ctx.strokeStyle = 'rgba(56, 232, 120, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Right arm line: shoulder → wrist (yellow)
  ctx.beginPath();
  ctx.moveTo(pts.rSh.x, pts.rSh.y);
  ctx.lineTo(pts.rWr.x, pts.rWr.y);
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawAngles(ctx, pts, angles) {
  ctx.font = 'bold 16px Outfit, sans-serif';
  ctx.fillStyle = '#4ade80';
  ctx.fillText(`${Math.round(angles.left)}°`,  pts.lEl.x + 8, pts.lEl.y - 8);
  ctx.fillText(`${Math.round(angles.right)}°`, pts.rEl.x + 8, pts.rEl.y - 8);
}

// ── UI Update ────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function pulseEl(element) {
  element.classList.remove('stat-pulse');
  void element.offsetWidth; // reflow
  element.classList.add('stat-pulse');
  setTimeout(() => element.classList.remove('stat-pulse'), 400);
}

let prevTotal = 0;

function updateStats(stats, fps, angles, tNow) {
  el('stat-total').textContent  = stats.total;
  el('stat-left').textContent   = stats.left;
  el('stat-right').textContent  = stats.right;
  el('stat-combo').textContent  = stats.combo;
  el('stat-best').textContent   = stats.bestCombo;
  el('stat-ppm').textContent    = punchesPerMinute(stats, tNow).toFixed(1);
  el('stat-fps').textContent    = Math.round(fps);
  el('angle-left').textContent  = Math.round(angles.left);
  el('angle-right').textContent = Math.round(angles.right);

  if (stats.total !== prevTotal) {
    pulseEl(el('stat-total'));
    prevTotal = stats.total;
  }
}

// Event label + flash
let eventTimeout = null;

function showEvent(text, type) {
  const label = el('event-label');
  const flash = el('punch-flash');

  label.textContent = text;
  label.className = 'event-label show';

  flash.className = `punch-flash flash-${type}`;

  clearTimeout(eventTimeout);
  eventTimeout = setTimeout(() => {
    label.className = 'event-label';
    flash.className = 'punch-flash';
  }, 600);
}

// FPS tracking
let lastFrameTime = performance.now();
let fps = 0;

// ── Main App ─────────────────────────────────────────────────────────────────
let analyzer = makeAnalyzer();
let poseRunning = false;
let camera = null;

const videoEl  = el('video');
const canvasEl = el('canvas');
const ctx      = canvasEl.getContext('2d');

function onResults(results) {
  const now = performance.now();
  fps = 1000 / Math.max(now - lastFrameTime, 1);
  lastFrameTime = now;

  const W = canvasEl.width;
  const H = canvasEl.height;

  // Draw mirrored video frame
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(results.image, -W, 0, W, H);
  ctx.restore();

  // Dark vignette overlay
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  const tNow = performance.now() / 1000;

  if (results.poseLandmarks) {
    el('pose-indicator').className = 'pose-indicator on';
    el('status-text').textContent = 'Tracking — throw some punches!';

    // Mirror landmarks horizontally (video is flipped)
    const mLMs = results.poseLandmarks.map(lm => ({ ...lm, x: 1 - lm.x }));

    drawSkeleton(ctx, mLMs, W, H);

    const out = processLandmarks(analyzer, mLMs, W, H);

    drawArmLines(ctx, out.points);
    drawAngles(ctx, out.points, out.angles);

    let eventText = '';
    let flashType = '';
    if (out.leftPunch && out.rightPunch) {
      eventText = '⚡ DOUBLE';  flashType = 'double';
    } else if (out.leftPunch) {
      eventText = '← LEFT STRAIGHT'; flashType = 'left';
    } else if (out.rightPunch) {
      eventText = 'RIGHT STRAIGHT →'; flashType = 'right';
    }

    if (eventText) showEvent(eventText, flashType);

    updateStats(out.stats, fps, out.angles, tNow);

  } else {
    el('pose-indicator').className = 'pose-indicator search';
    el('status-text').textContent = 'Searching for pose… step back so your full upper body is visible';
    updateStats(analyzer.stats, fps, { left: 0, right: 0 }, tNow);
  }
}

function startCamera() {
  if (poseRunning) return;
  poseRunning = true;

  el('status-text').textContent = 'Loading MediaPipe model…';
  el('btn-start').disabled = true;
  el('btn-start').textContent = '⏳ Loading…';

  const pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.6,
    minTrackingConfidence:  0.6,
  });

  pose.onResults(onResults);

  // Fit canvas to window
  function resize() {
    const section = document.getElementById('video-section');
    const W = section.clientWidth;
    const H = section.clientHeight - 36; // minus status bar
    canvasEl.width  = W;
    canvasEl.height = H;
  }
  resize();
  window.addEventListener('resize', resize);

  camera = new Camera(videoEl, {
    onFrame: async () => {
      await pose.send({ image: videoEl });
    },
    width: 1280,
    height: 720,
  });

  camera.start().then(() => {
    // Hide overlay
    el('overlay').classList.add('hidden');
    el('btn-start').textContent = '⏹ Stop';
    el('btn-start').disabled = false;
    el('btn-start').onclick = stopCamera;
    el('pose-indicator').className = 'pose-indicator search';
    el('status-text').textContent = 'Camera on — waiting for pose…';
  }).catch(err => {
    poseRunning = false;
    el('btn-start').disabled = false;
    el('btn-start').textContent = '▶ Start Camera';
    el('status-text').textContent = `Camera error: ${err.message}`;
    console.error(err);
  });
}

function stopCamera() {
  if (camera) {
    camera.stop();
    camera = null;
  }
  poseRunning = false;
  el('overlay').classList.remove('hidden');
  el('btn-start').textContent = '▶ Start Camera';
  el('btn-start').onclick = startCamera;
  el('pose-indicator').className = 'pose-indicator off';
  el('status-text').textContent = 'Stopped — click Start Camera to resume';

  // Clear canvas
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
}

function resetSession() {
  analyzer = makeAnalyzer();
  prevTotal = 0;
  updateStats(analyzer.stats, fps, { left: 0, right: 0 }, performance.now() / 1000);
  el('status-text').textContent = poseRunning
    ? 'Session reset — keep going! 🥊'
    : 'Session reset — click Start Camera';
}

// ── Sliders ──────────────────────────────────────────────────────────────────
function bindSlider(id, valId, key, decimals = 1) {
  const input = el(id);
  const display = el(valId);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    THRESH[key] = v;
    display.textContent = v.toFixed(decimals);
  });
}

bindSlider('tune-vel', 'vel-val', 'velocity', 1);
bindSlider('tune-ext', 'ext-val', 'extension', 2);
bindSlider('tune-ang', 'ang-val', 'elbowAngle', 0);

// ── Wiring buttons ───────────────────────────────────────────────────────────
el('btn-start').addEventListener('click', startCamera);
el('btn-start-center').addEventListener('click', startCamera);
el('btn-reset').addEventListener('click', resetSession);
