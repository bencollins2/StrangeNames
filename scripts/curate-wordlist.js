import { createReadStream } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { createInterface } from 'readline';
import { dirname } from 'path';

const GLOVE_PATH = '/tmp/glove.6B.50d.txt';
const OUTPUT_PATH = 'data/wordlist.txt';
const TARGET_COUNT = 50_000;

function isCleanWord(word) {
  // Skip single characters
  if (word.length <= 1) return false;

  // Skip if all digits
  if (/^\d+$/.test(word)) return false;

  // Skip if has non-ASCII characters
  if (/[^\x20-\x7E]/.test(word)) return false;

  // Skip if it's just punctuation/symbols (no letters at all)
  if (!/[a-zA-Z]/.test(word)) return false;

  return true;
}

async function main() {
  // Ensure output directory exists
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });

  const rl = createInterface({
    input: createReadStream(GLOVE_PATH),
    crlfDelay: Infinity,
  });

  const words = [];
  let linesRead = 0;

  for await (const line of rl) {
    linesRead++;
    // First token on each line is the word
    const spaceIdx = line.indexOf(' ');
    const word = spaceIdx === -1 ? line : line.substring(0, spaceIdx);

    if (isCleanWord(word)) {
      words.push(word);
      if (words.length >= TARGET_COUNT) break;
    }
  }

  console.log(`Read ${linesRead} lines from GloVe file`);
  console.log(`Collected ${words.length} clean words`);

  await writeFile(OUTPUT_PATH, words.join('\n') + '\n');
  console.log(`Saved to ${OUTPUT_PATH}`);

  // Show some stats
  console.log(`First 10 words: ${words.slice(0, 10).join(', ')}`);
  console.log(`Last 10 words: ${words.slice(-10).join(', ')}`);
}

main().catch(console.error);
