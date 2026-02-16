/**
 * Process GloVe vectors into a compact JSON file for the app.
 *
 * Usage: node scripts/process-glove.js [path-to-glove.txt] [max-words]
 *
 * Reads GloVe text format, keeps the top N most common words
 * (GloVe files are ordered by frequency), outputs JSON.
 */

import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import path from 'path';

const inputPath = process.argv[2] || '/tmp/glove.6B.50d.txt';
const maxWords = parseInt(process.argv[3] || '10000');
const outputPath = path.join(process.cwd(), 'public', 'embeddings.json');

// Words to skip — numbers, punctuation-heavy, too short
function isGoodWord(word) {
  if (word.length < 2) return false;
  if (/^\d+$/.test(word)) return false;
  if (/^[^a-z]+$/.test(word)) return false;
  if (/[^a-z'-]/.test(word)) return false;
  return true;
}

async function processGlove() {
  console.log(`Reading ${inputPath}, keeping top ${maxWords} words...`);

  const rl = createInterface({
    input: createReadStream(inputPath),
    crlfDelay: Infinity,
  });

  const words = {};
  let count = 0;

  for await (const line of rl) {
    if (count >= maxWords) break;

    const parts = line.split(' ');
    const word = parts[0];

    if (!isGoodWord(word)) continue;

    const vector = parts.slice(1).map(Number);
    words[word] = vector;
    count++;

    if (count % 1000 === 0) {
      console.log(`  ${count} words processed...`);
    }
  }

  console.log(`Writing ${count} words to ${outputPath}...`);
  await writeFile(outputPath, JSON.stringify(words));

  const stats = await import('fs').then(fs => fs.statSync(outputPath));
  console.log(`Done! File size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
}

processGlove().catch(console.error);
