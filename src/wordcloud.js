/**
 * Render words as 3D text sprites in the scene.
 *
 * Uses canvas-based sprites for each word — simple, fast,
 * and they always face the camera (billboarding).
 */

import * as THREE from 'three';

// Cache for word textures
const textureCache = new Map();

function createWordTexture(word, color = '#ffffff', fontSize = 32) {
  const key = `${word}_${color}_${fontSize}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  ctx.font = `${fontSize}px "SF Mono", "Fira Code", "Consolas", monospace`;
  const metrics = ctx.measureText(word);
  const width = Math.ceil(metrics.width) + 10;
  const height = fontSize + 10;

  canvas.width = width;
  canvas.height = height;

  // Re-set font after resize
  ctx.font = `${fontSize}px "SF Mono", "Fira Code", "Consolas", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, { texture, width, height });
  return { texture, width, height };
}

/**
 * Create a sprite for a single word.
 */
function createWordSprite(word, x, y, z, { color = '#aaaacc', scale = 1 } = {}) {
  const { texture, width, height } = createWordTexture(word, color);

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);

  // Scale sprite — smaller base size so things aren't overwhelming
  const aspect = width / height;
  const baseSize = 0.8 * scale;
  sprite.scale.set(baseSize * aspect, baseSize, 1);

  sprite.userData = { word, baseOpacity: 0.8 };
  return sprite;
}

/**
 * Build the full word cloud in the scene.
 */
export function buildWordCloud(scene, projectedWords, beacons) {
  const wordGroup = new THREE.Group();
  const beaconGroup = new THREE.Group();

  // Axis beacon colors
  const beaconColors = {
    'x+': '#ff6666', // right = red
    'x-': '#6666ff', // left = blue
    'y+': '#66ff66', // up = green
    'y-': '#ffaa33', // down = orange
    'z+': '#ff66ff', // forward = magenta
    'z-': '#66ffff', // backward = cyan
  };

  // Add beacons — the 6 axis words as glowing landmarks
  for (const beacon of beacons) {
    const color = beaconColors[beacon.axis] || '#ffffff';
    const sprite = createWordSprite(
      beacon.word.toUpperCase(),
      beacon.x, beacon.y, beacon.z,
      { color, scale: 10 }
    );
    sprite.material.opacity = 1.0;
    sprite.material.fog = false; // Always visible, ignore fog
    sprite.userData.isBeacon = true;
    beaconGroup.add(sprite);

    // Add a point light at each beacon for glow effect
    const light = new THREE.PointLight(color, 0.3, 60);
    light.position.set(beacon.x, beacon.y, beacon.z);
    beaconGroup.add(light);
  }

  // Sort words by magnitude — most "interesting" first (furthest from origin)
  const sorted = [...projectedWords].sort((a, b) => b.magnitude - a.magnitude);

  // Compute magnitude range for adaptive normalization
  const magMax = sorted.length > 0 ? sorted[0].magnitude : 1;
  const magP90 = sorted.length > 100 ? sorted[Math.floor(sorted.length * 0.1)].magnitude : magMax;
  console.log(`Word magnitudes: max=${magMax.toFixed(2)}, p90=${magP90.toFixed(2)}, min=${sorted[sorted.length-1]?.magnitude.toFixed(2)}`);

  // Add word sprites — all of them, LOD will handle visibility
  for (const w of sorted) {
    // Normalize using the actual magnitude range (not a fixed divisor)
    const t = Math.min(w.magnitude / magP90, 1);

    // Brighter and slightly larger for words with stronger positions
    const r = Math.round(140 + 115 * t);
    const g = Math.round(140 + 90 * t);
    const b = Math.round(170 + 85 * t);
    const color = `rgb(${r}, ${g}, ${b})`;

    const scale = 0.6 + t * 0.8;

    const sprite = createWordSprite(w.word, w.x, w.y, w.z, { color, scale });
    sprite.userData.baseOpacity = 0.35 + t * 0.55;
    sprite.visible = false; // Start hidden, LOD will show them
    wordGroup.add(sprite);
  }

  scene.add(wordGroup);
  scene.add(beaconGroup);

  return { wordGroup, beaconGroup };
}

/**
 * Update word visibility and opacity based on distance from camera (LOD).
 *
 * Words fade in as you approach and fade out as you move away.
 * Very close words also get slightly transparent so you can see through the cluster.
 */
export function updateWordVisibility(wordGroup, cameraPosition, {
  innerFade = 5,      // below this distance, start fading out (too close)
  nearDistance = 15,   // fully visible from here
  farDistance = 150,   // start fading out
  cullDistance = 250,  // fully hidden
} = {}) {
  for (const sprite of wordGroup.children) {
    const dist = sprite.position.distanceTo(cameraPosition);
    const baseOpacity = sprite.userData.baseOpacity || 0.5;

    if (dist > cullDistance) {
      sprite.visible = false;
    } else if (dist > farDistance) {
      // Fade out with distance
      sprite.visible = true;
      const fade = 1 - (dist - farDistance) / (cullDistance - farDistance);
      sprite.material.opacity = baseOpacity * fade;
    } else if (dist < innerFade) {
      // Too close — fade out so you can see through
      sprite.visible = true;
      sprite.material.opacity = baseOpacity * (dist / innerFade) * 0.5;
    } else if (dist < nearDistance) {
      // Fading in as you approach
      sprite.visible = true;
      const fade = (dist - innerFade) / (nearDistance - innerFade);
      sprite.material.opacity = baseOpacity * (0.5 + fade * 0.5);
    } else {
      // Sweet spot — fully visible
      sprite.visible = true;
      sprite.material.opacity = baseOpacity;
    }
  }
}

/**
 * Find the N nearest words to a position.
 */
export function findNearbyWords(wordGroup, position, count = 5) {
  const distances = [];
  for (const sprite of wordGroup.children) {
    if (!sprite.visible) continue;
    distances.push({
      word: sprite.userData.word,
      distance: sprite.position.distanceTo(position),
    });
  }
  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, count);
}
