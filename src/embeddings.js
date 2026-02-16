/**
 * Embedding manager — handles vocabulary loading, model loading,
 * and live embedding of user words via Transformers.js.
 *
 * Vocabulary comes as two pre-computed files:
 *   - vocab.json: array of ~50k word strings
 *   - embeddings.bin: Float32Array binary (row-major, 50k x DIMS)
 *
 * The transformer model runs in-browser to embed the user's 6 axis
 * words in real-time.
 */

import { pipeline } from '@huggingface/transformers';

let _pipeline = null;

/**
 * Load pre-computed vocabulary embeddings from binary files.
 *
 * @returns {{ words: string[], vectors: Float32Array, dims: number }}
 */
export async function loadVocabulary(progressCallback) {
  // Fetch vocab word list
  const vocabResp = await fetch('/vocab.json');
  if (!vocabResp.ok) {
    throw new Error(
      'Could not load vocab.json. The pre-computed vocabulary has not been generated yet.\n' +
      'Run the embedding pipeline script first: npm run build-embeddings'
    );
  }
  const words = await vocabResp.json();

  if (progressCallback) progressCallback(0.3);

  // Fetch binary embedding vectors
  const binResp = await fetch('/embeddings.bin');
  if (!binResp.ok) {
    throw new Error(
      'Could not load embeddings.bin. The pre-computed embeddings have not been generated yet.\n' +
      'Run the embedding pipeline script first: npm run build-embeddings'
    );
  }
  const buf = await binResp.arrayBuffer();
  const vectors = new Float32Array(buf);

  if (progressCallback) progressCallback(0.9);

  // Detect dimensions from file size
  const dims = vectors.length / words.length;
  if (!Number.isInteger(dims)) {
    throw new Error(
      `Dimension mismatch: ${vectors.length} floats / ${words.length} words = ${dims} (not an integer). ` +
      'The vocab.json and embeddings.bin files may be out of sync.'
    );
  }

  console.log(`Loaded vocabulary: ${words.length} words, ${dims} dimensions`);

  if (progressCallback) progressCallback(1);

  return { words, vectors, dims };
}

/**
 * Load the Transformers.js feature-extraction model.
 * Tries all-mpnet-base-v2 first, falls back to all-MiniLM-L6-v2.
 *
 * @param {(progress: number) => void} progressCallback - called with 0-1 progress
 */
export async function loadModel(progressCallback) {
  const models = [
    'Xenova/all-mpnet-base-v2',
    'Xenova/all-MiniLM-L6-v2',
  ];

  for (const modelName of models) {
    try {
      console.log(`Loading model: ${modelName}`);
      _pipeline = await pipeline('feature-extraction', modelName, {
        progress_callback: (data) => {
          // Transformers.js progress events have { status, progress, ... }
          if (data.status === 'progress' && typeof data.progress === 'number') {
            if (progressCallback) progressCallback(data.progress / 100);
          }
        },
      });
      console.log(`Model loaded: ${modelName}`);
      if (progressCallback) progressCallback(1);
      return;
    } catch (err) {
      console.warn(`Failed to load ${modelName}:`, err);
      if (modelName === models[models.length - 1]) {
        throw new Error(
          `Could not load any transformer model. Tried: ${models.join(', ')}. ` +
          'Check your network connection and try again.'
        );
      }
    }
  }
}

/**
 * Embed an array of words using the loaded transformer model.
 * Returns one Float32Array per word (mean-pooled sentence embedding).
 *
 * @param {string[]} words
 * @returns {Promise<Float32Array[]>}
 */
export async function embedWords(words) {
  if (!_pipeline) {
    throw new Error('Model not loaded. Call loadModel() first.');
  }

  const results = [];
  for (const word of words) {
    const output = await _pipeline(word, { pooling: 'mean', normalize: true });
    // output.data is a flat Float32Array; output.dims tells us the shape
    results.push(new Float32Array(output.data));
  }
  return results;
}

/**
 * Cosine similarity between two vectors (Float32Array or number[]).
 *
 * @param {Float32Array|number[]} a
 * @param {Float32Array|number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

/**
 * Get the embedding vector for a word at a given index in the flat vectors array.
 *
 * @param {number} index - word index in the vocabulary
 * @param {Float32Array} vectors - flat row-major embedding data
 * @param {number} dims - embedding dimensionality
 * @returns {Float32Array} - slice view into the vectors array
 */
export function getVector(index, vectors, dims) {
  const start = index * dims;
  return vectors.subarray(start, start + dims);
}
