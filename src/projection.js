/**
 * Project words into 3D space using 6 axis-words.
 *
 * Each word gets positioned based on cosine similarity
 * to the positive/negative end of each axis.
 *
 * Works with the indexed binary embedding format:
 *   { words: string[], vectors: Float32Array, dims: number }
 */

import { cosineSimilarity, getVector } from './embeddings.js';

// Regex: only pure lowercase alpha, 3-15 chars
const WORD_RE = /^[a-z]{3,15}$/;

/**
 * Quick quality check — filters out proper nouns, abbreviations,
 * hyphenated tokens, numbers, and very short/long words.
 */
function isQualityWord(word) {
  return WORD_RE.test(word);
}

/**
 * Select the most relevant words for a given set of axes.
 *
 * For each vocabulary word, compute its magnitude in the axis space
 * (sqrt of sum of squared axis diffs), and return the topK words
 * with the highest magnitude. This ensures different axis choices
 * show different words.
 *
 * @param {{ words: string[], vectors: Float32Array, dims: number }} vocabData
 * @param {{ xPos: Float32Array, xNeg: Float32Array, yPos: Float32Array, yNeg: Float32Array, zPos: Float32Array, zNeg: Float32Array }} axisVectors
 * @param {Set<string>} axisWords - the 6 axis word strings to exclude
 * @param {number} topK - how many words to keep (default 7000)
 * @returns {{ indices: number[], magnitudes: Float32Array }}
 */
export function selectWordsForAxes(vocabData, axisVectors, axisWords, topK = 7000) {
  const { words, vectors, dims } = vocabData;
  const n = words.length;

  // Compute magnitude for every word (skip junk and axis words)
  const mags = new Float32Array(n);
  let filtered = 0;
  for (let i = 0; i < n; i++) {
    if (axisWords.has(words[i]) || !isQualityWord(words[i])) {
      mags[i] = -1;
      filtered++;
      continue;
    }
    const vec = getVector(i, vectors, dims);
    const dx = cosineSimilarity(vec, axisVectors.xPos) - cosineSimilarity(vec, axisVectors.xNeg);
    const dy = cosineSimilarity(vec, axisVectors.yPos) - cosineSimilarity(vec, axisVectors.yNeg);
    const dz = cosineSimilarity(vec, axisVectors.zPos) - cosineSimilarity(vec, axisVectors.zNeg);
    mags[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  console.log(`Quality filter: kept ${n - filtered} of ${n} words`);

  // Build index array and sort by magnitude descending
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => mags[b] - mags[a]);

  // Take top K (skip any with mag <= 0, i.e. filtered words)
  const selected = [];
  for (let i = 0; i < indices.length && selected.length < topK; i++) {
    if (mags[indices[i]] > 0) {
      selected.push(indices[i]);
    }
  }

  return { indices: selected, magnitudes: mags };
}

/**
 * Given vocabulary data, axis vectors, and selected word indices,
 * compute 3D positions for the selected words.
 *
 * @param {{ words: string[], vectors: Float32Array, dims: number }} vocabData
 * @param {{ xPos: Float32Array, xNeg: Float32Array, yPos: Float32Array, yNeg: Float32Array, zPos: Float32Array, zNeg: Float32Array }} axisVectors
 * @param {number[]} selectedIndices - indices of words to project
 * @param {number} scale - multiplier for final positions
 * @returns {Array<{word: string, x: number, y: number, z: number, magnitude: number}>}
 */
export function projectWords(vocabData, axisVectors, selectedIndices, scale = 50) {
  const { words, vectors, dims } = vocabData;

  // First pass: compute raw positions
  const raw = [];
  for (const idx of selectedIndices) {
    const vec = getVector(idx, vectors, dims);
    const x = cosineSimilarity(vec, axisVectors.xPos) - cosineSimilarity(vec, axisVectors.xNeg);
    const y = cosineSimilarity(vec, axisVectors.yPos) - cosineSimilarity(vec, axisVectors.yNeg);
    const z = cosineSimilarity(vec, axisVectors.zPos) - cosineSimilarity(vec, axisVectors.zNeg);

    raw.push({ word: words[idx], x, y, z });
  }

  // Compute per-axis standard deviation for normalization
  function stddev(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) || 1;
  }

  const sdX = stddev(raw.map(w => w.x));
  const sdY = stddev(raw.map(w => w.y));
  const sdZ = stddev(raw.map(w => w.z));

  // Second pass: normalize so each axis has similar spread, then scale
  const results = raw.map(w => {
    const nx = (w.x / sdX) * scale;
    const ny = (w.y / sdY) * scale;
    const nz = (w.z / sdZ) * scale;
    const mag = Math.sqrt((w.x / sdX) ** 2 + (w.y / sdY) ** 2 + (w.z / sdZ) ** 2);
    return { word: w.word, x: nx, y: ny, z: nz, magnitude: mag };
  });

  console.log(`Axis spread (stddev): x=${sdX.toFixed(4)} y=${sdY.toFixed(4)} z=${sdZ.toFixed(4)}`);

  return results;
}

/**
 * Get axis beacon positions based on the actual extent of projected words.
 * Places beacons just beyond the furthest word on each axis.
 */
export function getBeaconPositions(axes, projectedWords) {
  let maxX = 0, minX = 0, maxY = 0, minY = 0, maxZ = 0, minZ = 0;

  for (const w of projectedWords) {
    if (w.x > maxX) maxX = w.x;
    if (w.x < minX) minX = w.x;
    if (w.y > maxY) maxY = w.y;
    if (w.y < minY) minY = w.y;
    if (w.z > maxZ) maxZ = w.z;
    if (w.z < minZ) minZ = w.z;
  }

  // Place beacons 20% beyond the actual extremes
  // Order matches the UI: left, right, up, down, forward, backward (keys 1-6)
  const pad = 1.2;
  return [
    { word: axes.xNeg, x: minX * pad, y: 0, z: 0, axis: 'x-' },
    { word: axes.xPos, x: maxX * pad, y: 0, z: 0, axis: 'x+' },
    { word: axes.yPos, x: 0, y: maxY * pad, z: 0, axis: 'y+' },
    { word: axes.yNeg, x: 0, y: minY * pad, z: 0, axis: 'y-' },
    { word: axes.zPos, x: 0, y: 0, z: maxZ * pad, axis: 'z+' },
    { word: axes.zNeg, x: 0, y: 0, z: minZ * pad, axis: 'z-' },
  ];
}
