/**
 * Axis Gauge — 3 paired gradient bars showing camera position along each axis.
 *
 * Each bar:  leftLabel ───────●──── rightLabel
 *
 * Layout:
 *   x: xNeg (left, #6666ff) → xPos (right, #ff6666)
 *   y: yNeg (left, #ffaa33) → yPos (right, #66ff66)
 *   z: zPos (left, #ff66ff) → zNeg (right, #66ffff)  [inverted mapping]
 */

// Axis config: [leftLabel key, rightLabel key, leftColor, rightColor, invert]
const AXIS_CONFIG = [
  { leftKey: 'xNeg', rightKey: 'xPos', leftColor: '#6666ff', rightColor: '#ff6666', component: 'x', invert: false },
  { leftKey: 'yNeg', rightKey: 'yPos', leftColor: '#ffaa33', rightColor: '#66ff66', component: 'y', invert: false },
  { leftKey: 'zPos', rightKey: 'zNeg', leftColor: '#ff66ff', rightColor: '#66ffff', component: 'z', invert: true },
];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lerpColor(c1, c2, t) {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createAxisGauges(container) {
  const rows = [];
  let bounds = { minX: -100, maxX: 100, minY: -100, maxY: 100, minZ: -100, maxZ: 100 };
  let currentT = [0.5, 0.5, 0.5]; // smoothed positions

  for (const cfg of AXIS_CONFIG) {
    // Row container
    const row = document.createElement('div');
    row.className = 'axis-gauge-row';

    // Left label
    const leftLabel = document.createElement('span');
    leftLabel.className = 'axis-gauge-label axis-gauge-label-left';
    leftLabel.style.color = cfg.leftColor;
    row.appendChild(leftLabel);

    // Track wrapper (for positioning the dot)
    const trackWrap = document.createElement('div');
    trackWrap.className = 'axis-gauge-track-wrap';

    // Track bar
    const track = document.createElement('div');
    track.className = 'axis-gauge-track';
    track.style.background = `linear-gradient(to right, ${cfg.leftColor}, ${cfg.rightColor})`;
    trackWrap.appendChild(track);

    // Indicator dot
    const dot = document.createElement('div');
    dot.className = 'axis-gauge-dot';
    dot.style.left = '50%';
    trackWrap.appendChild(dot);

    row.appendChild(trackWrap);

    // Right label
    const rightLabel = document.createElement('span');
    rightLabel.className = 'axis-gauge-label axis-gauge-label-right';
    rightLabel.style.color = cfg.rightColor;
    row.appendChild(rightLabel);

    container.appendChild(row);

    rows.push({ row, leftLabel, rightLabel, track, dot, trackWrap, cfg });
  }

  function setAxes(axes) {
    for (const r of rows) {
      r.leftLabel.textContent = axes[r.cfg.leftKey] || '';
      r.rightLabel.textContent = axes[r.cfg.rightKey] || '';
    }
  }

  function setBounds(minX, maxX, minY, maxY, minZ, maxZ) {
    bounds = { minX, maxX, minY, maxY, minZ, maxZ };
  }

  function update(cameraPosition) {
    const components = [
      { val: cameraPosition.x, min: bounds.minX, max: bounds.maxX },
      { val: cameraPosition.y, min: bounds.minY, max: bounds.maxY },
      { val: cameraPosition.z, min: bounds.minZ, max: bounds.maxZ },
    ];

    for (let i = 0; i < 3; i++) {
      const { val, min, max } = components[i];
      const range = max - min;
      let t = range === 0 ? 0.5 : (val - min) / range;
      if (rows[i].cfg.invert) t = 1 - t;
      t = clamp(t, 0, 1);

      // Smooth with lerp
      currentT[i] += (t - currentT[i]) * 0.15;
      const smoothT = clamp(currentT[i], 0, 1);

      // Position the dot
      rows[i].dot.style.left = `${smoothT * 100}%`;

      // Color the dot as a blend of the two endpoint colors
      const blendColor = lerpColor(rows[i].cfg.leftColor, rows[i].cfg.rightColor, smoothT);
      rows[i].dot.style.background = blendColor;
      rows[i].dot.style.boxShadow = `0 0 6px ${blendColor}, 0 0 2px ${blendColor}`;

      // Brighten labels when indicator is near them
      const leftProximity = 1 - smoothT;  // 1 when at left, 0 when at right
      const rightProximity = smoothT;
      rows[i].leftLabel.style.opacity = 0.35 + leftProximity * 0.65;
      rows[i].rightLabel.style.opacity = 0.35 + rightProximity * 0.65;
    }
  }

  function show() {
    container.style.display = 'flex';
  }

  function hide() {
    container.style.display = 'none';
  }

  return { setAxes, setBounds, update, show, hide };
}
