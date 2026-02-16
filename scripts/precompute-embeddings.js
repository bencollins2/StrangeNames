import { readFile, writeFile, mkdir } from 'fs/promises';
import { pipeline } from '@huggingface/transformers';

const WORDLIST_PATH = 'data/wordlist.txt';
const VOCAB_PATH = 'public/vocab.json';
const EMBEDDINGS_PATH = 'public/embeddings.bin';
const BATCH_SIZE = 64;

// Try mpnet first (768 dims), fall back to MiniLM (384 dims)
const MODELS = [
  { name: 'Xenova/all-mpnet-base-v2', dims: 768 },
  { name: 'Xenova/all-MiniLM-L6-v2', dims: 384 },
];

async function loadModel() {
  for (const model of MODELS) {
    try {
      console.log(`Loading model: ${model.name}...`);
      const extractor = await pipeline('feature-extraction', model.name);
      console.log(`Model loaded: ${model.name} (${model.dims} dims)`);
      return { extractor, ...model };
    } catch (err) {
      console.warn(`Failed to load ${model.name}: ${err.message}`);
      console.log('Trying fallback model...');
    }
  }
  throw new Error('All models failed to load');
}

async function main() {
  // Load word list
  const raw = await readFile(WORDLIST_PATH, 'utf-8');
  const words = raw.trim().split('\n');
  console.log(`Loaded ${words.length} words from ${WORDLIST_PATH}`);

  // Ensure output directory
  await mkdir('public', { recursive: true });

  // Load model
  const { extractor, name: modelName, dims } = await loadModel();

  // Allocate the full embedding buffer
  const totalFloats = words.length * dims;
  const embeddings = new Float32Array(totalFloats);

  console.log(`\nEmbedding ${words.length} words in batches of ${BATCH_SIZE}...`);
  console.log(`Output: ${words.length} x ${dims} = ${totalFloats} floats (${(totalFloats * 4 / 1024 / 1024).toFixed(1)} MB)\n`);

  const startTime = Date.now();

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);

    // Embed each word individually (Transformers.js pipeline handles one at a time)
    for (let j = 0; j < batch.length; j++) {
      const wordIdx = i + j;
      const output = await extractor(batch[j], { pooling: 'mean', normalize: true });
      const vec = output.data;
      embeddings.set(vec, wordIdx * dims);
    }

    const processed = Math.min(i + BATCH_SIZE, words.length);

    // Progress every 100 words (or at batch boundaries near multiples of 100)
    if (processed % 100 < BATCH_SIZE || processed === words.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (words.length - processed) / rate;
      const pct = ((processed / words.length) * 100).toFixed(1);
      console.log(
        `  ${processed.toLocaleString()} / ${words.length.toLocaleString()} words ` +
        `(${pct}%) - ${rate.toFixed(1)} words/sec - ~${formatTime(remaining)} remaining`
      );
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\nDone! Embedded ${words.length} words in ${formatTime(totalTime)}`);

  // Save vocab.json
  await writeFile(VOCAB_PATH, JSON.stringify(words));
  console.log(`Saved ${VOCAB_PATH}`);

  // Save embeddings.bin
  await writeFile(EMBEDDINGS_PATH, Buffer.from(embeddings.buffer));
  console.log(`Saved ${EMBEDDINGS_PATH}`);

  // Report
  const vocabSize = (await readFile(VOCAB_PATH)).length;
  const embSize = (await readFile(EMBEDDINGS_PATH)).length;
  console.log(`\n--- Summary ---`);
  console.log(`Model: ${modelName}`);
  console.log(`Dimensions: ${dims}`);
  console.log(`Words: ${words.length}`);
  console.log(`vocab.json: ${(vocabSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`embeddings.bin: ${(embSize / 1024 / 1024).toFixed(2)} MB`);
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
