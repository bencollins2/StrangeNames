# StrangeNames — Linguistic Math Games

## Core Idea

Games that let players do interesting manipulations in vector word embedding space. "Math with words" — where the arithmetic feels surprising, funny, or revelatory.

---

## The Classic Example

The famous word2vec result: **king - man + woman = queen**

What if we built games around this kind of thing?

---

## Raw Game Ideas

### 1. "Word Algebra"
- Give the player an equation like `? - cold + hot = ?`
- They guess what goes in the blanks
- Score based on how close their guess is to the actual embedding result

### 2. "Strange Names" (namesake?)
- Combine concepts to generate novel names for things that don't exist yet
- `sushi + breakfast = ?` → what do you call that?
- Players compete to name the unnamed

### 3. "Midpoint"
- What word lives exactly between two other words in embedding space?
- `ocean ↔ sky = ?` (horizon? blue? vast?)
- Players guess, closest to the actual midpoint wins

### 4. "Odd One Out" (embedding edition)
- Show 4 words, one is furthest from the centroid
- But the "odd one out" is based on embedding distance, not human intuition
- Reveals surprising relationships

### 5. "Analogy Roulette"
- `A is to B as C is to ???`
- Classic analogy format but sourced from real embedding relationships
- Some will be intuitive, some will be wild

### 6. "Vector Voyage"
- Start at one word, reach a target word
- Each turn you "add" or "subtract" a concept
- Fewest moves wins
- Like a word navigation puzzle in embedding space

### 7. "Blend"
- Average two word vectors, show the nearest real words to the result
- Players guess what the blend will produce before seeing the answer
- `jazz + math = ?` → ???

### 8. "Opposites Attract"
- Find the word whose vector is most opposite (negative) to a given word
- Is it what you'd expect? Often not.

### 9. "Cluster Detective"
- Show a cluster of words from embedding space
- Player guesses what hidden concept ties them together
- The connection is geometric, not always semantic in the obvious way

### 10. "Dimensional Slice"
- Pick a "dimension" (like gender, formality, size)
- Slide words along that axis
- See what they become — `whisper` moved toward "big" = `shout`?

---

## The Game: "Six Words"

### Core Mechanic

1. **You pick 6 words.** These define your universe.
2. The 6 words become the endpoints of 3 axes:
   - **Forward / Backward** (e.g., `future` / `past`)
   - **Up / Down** (e.g., `heaven` / `hell`)
   - **Left / Right** (e.g., `love` / `hate`)
3. Every other word in the vocabulary gets projected into this personal 3D space based on its embedding relationship to your 6 axis-words.
4. **You fly through the resulting word cloud**, exploring what ended up where.

### Why This Is Interesting

- **You define the coordinate system.** The same vocabulary looks completely different depending on which 6 words you pick. "Love/hate, big/small, old/new" gives you one universe. "Jazz/metal, sweet/sour, earth/sky" gives you a totally different one.
- **The placement is meaningful.** A word's position tells you its relationship to your chosen concepts. If "dog" is high on the heaven/hell axis and left on love/hate — that says something.
- **It's personal.** Your 6 words reflect what *you* find interesting. Two players with different words see different universes from the same data.
- **Surprise is built in.** You'll always find words in unexpected places. "Wait, why is 'mathematics' so close to 'music' in my space?"

### How the Math Works

Given 6 axis-words (A+, A−, B+, B−, C+, C−) and any word W:

```
x = cosine_sim(W, A+) - cosine_sim(W, A−)   // left-right
y = cosine_sim(W, B+) - cosine_sim(W, B−)   // up-down
z = cosine_sim(W, C+) - cosine_sim(W, C−)   // forward-back
```

Each word gets a position in [-1, 1] × [-1, 1] × [-1, 1] based on which axis-word it's more similar to. Simple, fast, interpretable.

### Density / LOD

Not every word needs to render at once. As the player flies through:

- **Near the camera:** Show more words (higher density)
- **Far from camera:** Show fewer, only the most "interesting" (highest magnitude on any axis, or most frequently used words)
- **Density slider:** Let the user control how crowded the space feels
- Could also threshold: only show words above a certain similarity to *any* of the 6 axis-words, so you don't get a blob of noise in the center

### Visual Design

- 6 axis-words are glowing beacons at the edges of the space — destinations you can fly toward
- Words near the origin are "neutral" — not strongly aligned with any axis
- Word size scales with how strongly positioned it is (high magnitude = bigger text)
- Color gradient based on dominant axis (e.g., red-blue for left-right, green-yellow for up-down)
- Fog/fade at distance — words materialize as you approach
- Particle trails as you fly

### UX Flow

1. **Landing page:** "Pick 6 words to build your universe"
   - 3 pairs of text inputs, labeled as axes
   - Maybe suggest starter sets: "Try: love/hate, life/death, science/art"
2. **Loading:** "Building your word space..." (compute positions for N words)
3. **Flight mode:** WASD/arrow keys + mouse look, fly through the cloud
4. **HUD:** Shows your 6 axis-words as a compass, current position, nearby words
5. **Interaction:** Click a word to see its exact coordinates, similarity scores

### Possible Gameplay Layers (later)

- **Treasure hunt:** Find a specific hidden word in the space
- **Guess the axes:** Show someone a word cloud, they guess what 6 words defined it
- **Challenge mode:** "Using these 6 words, find the word closest to the origin" (most neutral word)
- **Compare:** Two players pick different 6-words, see how the same vocabulary rearranges

---

## Tech Stack

| Layer | Tool | Why |
|-------|------|-----|
| 3D rendering | **Three.js** | Industry standard for WebGL |
| Embeddings | **Precomputed GloVe** (50d or 100d) | Free, no API needed, ~10-20k curated words |
| Projection | **Custom** (cosine sim to 6 axis-words) | No UMAP needed — the 6 words *are* the projection |
| Build tool | **Vite** | Fast, minimal |
| UI | Vanilla JS or lightweight framework | Overlay HUD |

**Key insight:** We don't need UMAP or t-SNE at all. The user's 6 words *define* the 3D projection directly. This is simpler and more meaningful than a generic dimensionality reduction.

### Embedding Data

- **GloVe 6B 50d** — 400k words, 50 dimensions, ~70MB as text
- Curate down to ~10-20k interesting words (remove junk, rare words, numbers)
- Precompute and ship as compressed JSON or binary
- Cosine similarity against 6 words is fast — can compute 20k positions in milliseconds

---

## Open Questions

- **Word curation:** Which ~10-20k words make the most interesting cloud? Common English? Include names? Adjectives only?
- **Mobile controls?** Gyroscope fly-through could be amazing on phones
- **Multiplayer?** Share your 6-word universe with a link?
- **Sound?** Ambient tones that shift as you move through the space?
- **What's the "game" vs. the "toy"?** Is flying through enough, or does it need objectives?

---

## Next Steps

- [ ] Get GloVe vectors, curate a word list
- [ ] Spike: compute 3D positions from 6 axis-words + render in Three.js
- [ ] Basic fly-through camera (WASD + mouse look)
- [ ] Axis-word beacons at the 6 endpoints
- [ ] Density/LOD: fade words by distance
