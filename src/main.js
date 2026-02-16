import './style.css';
import * as THREE from 'three';
import { FlightController } from './flight.js';
import { projectWords, getBeaconPositions, selectWordsForAxes } from './projection.js';
import { buildWordCloud, updateWordVisibility, findNearbyWords } from './wordcloud.js';
import { BeaconIndicators } from './indicators.js';
import { createMinimap } from './minimap.js';
import { createAxisGauges } from './axisgauge.js';
import { loadVocabulary, loadModel, embedWords } from './embeddings.js';

// --- DOM refs ---
const setupEl = document.getElementById('setup');
const loadingEl = document.getElementById('loading');
const hudEl = document.getElementById('hud');
const errorEl = document.getElementById('error');
const launchBtn = document.getElementById('launch');
const nearbyEl = document.getElementById('nearby');
const vocabBar = document.getElementById('vocab-progress-fill');
const modelBar = document.getElementById('model-progress-fill');
const vocabStatus = document.getElementById('vocab-status');
const modelStatus = document.getElementById('model-status');
const loadingProgress = document.getElementById('loading-progress');

// --- State ---
let vocabData = null;   // { words, vectors, dims }
let modelReady = false;
let scene, camera, renderer, flight;
let wordGroup = null;
let beaconIndicators = null;
let minimap = null;
let gauges = null;
const clock = new THREE.Clock();

// --- Load vocabulary and model in parallel on page load ---
function updateProgress(bar, statusEl, pct, label) {
  const percent = Math.round(pct * 100);
  bar.style.width = `${percent}%`;
  statusEl.textContent = `${label} ${percent}%`;
}

async function initResources() {
  loadingProgress.classList.remove('hidden');

  const vocabPromise = loadVocabulary((pct) => {
    updateProgress(vocabBar, vocabStatus, pct, 'Loading vocabulary...');
  }).then((data) => {
    vocabData = data;
    updateProgress(vocabBar, vocabStatus, 1, 'Vocabulary loaded');
    vocabStatus.textContent = `Vocabulary loaded (${data.words.length.toLocaleString()} words, ${data.dims}d)`;
    checkReady();
  }).catch((err) => {
    console.error('Vocabulary load failed:', err);
    vocabStatus.textContent = 'Vocabulary failed to load';
    vocabBar.parentElement.classList.add('progress-error');
    errorEl.textContent = err.message;
  });

  const modelPromise = loadModel((pct) => {
    updateProgress(modelBar, modelStatus, pct, 'Loading AI model...');
  }).then(() => {
    modelReady = true;
    updateProgress(modelBar, modelStatus, 1, 'AI model loaded');
    modelStatus.textContent = 'AI model ready';
    checkReady();
  }).catch((err) => {
    console.error('Model load failed:', err);
    modelStatus.textContent = 'Model failed to load';
    modelBar.parentElement.classList.add('progress-error');
    errorEl.textContent = err.message;
  });

  // Don't block — both run in parallel
  await Promise.allSettled([vocabPromise, modelPromise]);
}

function checkReady() {
  if (vocabData && modelReady) {
    launchBtn.disabled = false;
    launchBtn.classList.add('ready');
  }
}

// Start loading immediately
launchBtn.disabled = true;
initResources();

// --- Setup handler ---
launchBtn.addEventListener('click', async () => {
  if (!vocabData || !modelReady) {
    errorEl.textContent = 'Still loading — please wait...';
    return;
  }

  const axes = {
    xNeg: document.getElementById('left').value.trim().toLowerCase(),
    xPos: document.getElementById('right').value.trim().toLowerCase(),
    yPos: document.getElementById('up').value.trim().toLowerCase(),
    yNeg: document.getElementById('down').value.trim().toLowerCase(),
    zPos: document.getElementById('forward').value.trim().toLowerCase(),
    zNeg: document.getElementById('backward').value.trim().toLowerCase(),
  };

  // Validate all words are filled in
  for (const [key, word] of Object.entries(axes)) {
    if (!word) {
      errorEl.textContent = 'Please fill in all 6 words.';
      return;
    }
  }

  errorEl.textContent = '';
  setupEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');
  loadingEl.querySelector('p').textContent = 'Embedding your axis words...';

  // Give the UI a frame to render the loading screen
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    // Embed the 6 axis words using the live model
    const axisWordList = [axes.xPos, axes.xNeg, axes.yPos, axes.yNeg, axes.zPos, axes.zNeg];
    const axisEmbeddings = await embedWords(axisWordList);

    const axisVectors = {
      xPos: axisEmbeddings[0],
      xNeg: axisEmbeddings[1],
      yPos: axisEmbeddings[2],
      yNeg: axisEmbeddings[3],
      zPos: axisEmbeddings[4],
      zNeg: axisEmbeddings[5],
    };

    loadingEl.querySelector('p').textContent = 'Selecting words for your axes...';
    await new Promise(r => requestAnimationFrame(r));

    // Select the top 12k words most relevant to these axes
    const axisWords = new Set(Object.values(axes));
    const t0 = performance.now();
    const { indices: selectedIndices } = selectWordsForAxes(vocabData, axisVectors, axisWords);
    console.log(`selectWordsForAxes: ${(performance.now() - t0).toFixed(1)}ms, selected ${selectedIndices.length} words`);

    loadingEl.querySelector('p').textContent = 'Building your word space...';
    await new Promise(r => requestAnimationFrame(r));

    // Project selected words into 3D
    startScene(axes, axisVectors, selectedIndices);
  } catch (err) {
    console.error('Launch failed:', err);
    loadingEl.classList.add('hidden');
    setupEl.classList.remove('hidden');
    errorEl.textContent = `Error: ${err.message}`;
  }
});

// --- Three.js scene ---
function startScene(axes, axisVectors, selectedIndices) {
  const SCALE = 80;

  // Project selected words into 3D
  const projected = projectWords(vocabData, axisVectors, selectedIndices, SCALE);
  const beacons = getBeaconPositions(axes, projected);

  console.log(`Projected ${projected.length} words into 3D space`);

  // Log position ranges for tuning
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;
  for (const w of projected) {
    if (w.x < minX) minX = w.x; if (w.x > maxX) maxX = w.x;
    if (w.y < minY) minY = w.y; if (w.y > maxY) maxY = w.y;
    if (w.z < minZ) minZ = w.z; if (w.z > maxZ) maxZ = w.z;
  }
  console.log(`Position ranges: x=[${minX.toFixed(1)}, ${maxX.toFixed(1)}] y=[${minY.toFixed(1)}, ${maxY.toFixed(1)}] z=[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`);

  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060610);
  scene.fog = new THREE.FogExp2(0x060610, 0.003);

  // Camera — far plane needs to cover the full space
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 5, 30);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // Ambient light
  scene.add(new THREE.AmbientLight(0x333355, 1));

  // Build word cloud
  const clouds = buildWordCloud(scene, projected, beacons);
  wordGroup = clouds.wordGroup;

  // Subtle particle dust
  addStarfield(scene);

  // Beacon indicators (off-screen arrows)
  beaconIndicators = new BeaconIndicators(beacons);

  // Minimap
  minimap = createMinimap(document.getElementById('minimap-container'));
  minimap.setBounds(minX, maxX, minY, maxY, minZ, maxZ);
  minimap.setAxes(axes);

  // Axis gauges
  gauges = createAxisGauges(document.getElementById('gauge-container'));
  gauges.setAxes(axes);
  gauges.setBounds(minX, maxX, minY, maxY, minZ, maxZ);

  // Flight controls
  flight = new FlightController(camera, document.body);
  flight.setBeacons(beacons);

  flight.onLock(() => {
    hudEl.classList.remove('hidden');
    minimap.show();
    gauges.show();
  });

  flight.onUnlock(() => {
    hudEl.classList.add('hidden');
    minimap.hide();
    gauges.hide();
  });

  // Update HUD compass labels with key hints (1-6 matches UI order)
  document.getElementById('hud-left').textContent = `1: \u2190 ${axes.xNeg}`;
  document.getElementById('hud-right').textContent = `2: ${axes.xPos} \u2192`;
  document.getElementById('hud-up').textContent = `3: \u2191 ${axes.yPos}`;
  document.getElementById('hud-down').textContent = `4: \u2193 ${axes.yNeg}`;
  document.getElementById('hud-forward').textContent = `5: \u2197 ${axes.zPos}`;
  document.getElementById('hud-backward').textContent = `6: \u2199 ${axes.zNeg}`;

  // Hide loading, show scene
  loadingEl.classList.add('hidden');

  // Click to start flying
  document.body.addEventListener('click', () => {
    if (!flight.isLocked) {
      flight.lock();
    }
  });

  // Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Start render loop
  animate();
}

function addStarfield(scene) {
  const count = 2000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 800;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x333355,
    size: 0.1,
    transparent: true,
    opacity: 0.4,
  });

  scene.add(new THREE.Points(geometry, material));
}

let nearbyTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Update flight
  flight.update(delta);

  // Update LOD visibility (every frame is fine -- it's cheap)
  if (wordGroup) {
    updateWordVisibility(wordGroup, camera.position);
  }

  // Update beacon indicators
  if (beaconIndicators && flight.isLocked) {
    beaconIndicators.update(camera);
  }

  // Update minimap
  if (minimap) {
    minimap.update(camera.position);
  }

  // Update axis gauges
  if (gauges) {
    gauges.update(camera.position);
  }

  // Update nearby words display (throttled)
  nearbyTimer += delta;
  if (nearbyTimer > 0.3 && wordGroup && flight.isLocked) {
    nearbyTimer = 0;
    const nearby = findNearbyWords(wordGroup, camera.position, 5);
    if (nearby.length > 0) {
      nearbyEl.textContent = nearby.map(w => w.word).join('  \u00b7  ');
    } else {
      nearbyEl.textContent = '';
    }
  }

  renderer.render(scene, camera);
}
