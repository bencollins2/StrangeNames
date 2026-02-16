/**
 * Off-screen beacon indicators — arrows at screen edges pointing
 * toward beacons that aren't currently visible, like enemy indicators
 * in a flight sim.
 */

import * as THREE from 'three';

const EDGE_PADDING = 40; // px from screen edge
const INDICATOR_SIZE = 28;

// Colors matching beacon colors from wordcloud.js
const BEACON_COLORS = {
  'x-': '#6666ff',
  'x+': '#ff6666',
  'y+': '#66ff66',
  'y-': '#ffaa33',
  'z+': '#ff66ff',
  'z-': '#66ffff',
};

export class BeaconIndicators {
  constructor(beacons) {
    this.beacons = beacons;
    this.container = document.getElementById('hud');
    this.indicators = [];

    // Key labels matching the 1-6 order
    const keyLabels = ['1', '2', '3', '4', '5', '6'];

    for (let i = 0; i < beacons.length; i++) {
      const beacon = beacons[i];
      const el = document.createElement('div');
      el.className = 'beacon-indicator';
      el.style.cssText = `
        position: absolute;
        pointer-events: none;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        white-space: nowrap;
        transition: opacity 0.15s;
      `;

      const arrow = document.createElement('span');
      arrow.className = 'indicator-arrow';
      arrow.textContent = '▸';
      arrow.style.cssText = `
        font-size: ${INDICATOR_SIZE}px;
        color: ${BEACON_COLORS[beacon.axis] || '#888'};
        line-height: 1;
        text-shadow: 0 0 6px ${BEACON_COLORS[beacon.axis] || '#888'}44;
      `;

      const label = document.createElement('span');
      label.className = 'indicator-label';
      label.textContent = `${keyLabels[i]}: ${beacon.word}`;
      label.style.cssText = `
        color: ${BEACON_COLORS[beacon.axis] || '#888'};
        opacity: 0.8;
      `;

      el.appendChild(arrow);
      el.appendChild(label);
      this.container.appendChild(el);

      this.indicators.push({
        el,
        arrow,
        label,
        beacon,
        pos3D: new THREE.Vector3(beacon.x, beacon.y, beacon.z),
      });
    }
  }

  update(camera) {
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;

    for (const ind of this.indicators) {
      // Project beacon position to screen coordinates
      const projected = ind.pos3D.clone().project(camera);

      // projected.x and .y are in [-1, 1] NDC space
      // projected.z > 1 means behind camera
      const behind = projected.z > 1;

      // Convert to screen pixels
      let sx = (projected.x * halfW) + halfW;
      let sy = (-projected.y * halfH) + halfH;

      // If behind camera, flip to opposite side
      if (behind) {
        sx = window.innerWidth - sx;
        sy = window.innerHeight - sy;
      }

      // Check if on-screen (with some margin)
      const margin = 60;
      const onScreen = !behind &&
        sx > margin && sx < window.innerWidth - margin &&
        sy > margin && sy < window.innerHeight - margin;

      if (onScreen) {
        // Beacon is visible — hide indicator
        ind.el.style.opacity = '0';
      } else {
        ind.el.style.opacity = '1';

        // Clamp to screen edges
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        // Direction from center to projected point
        let dx = sx - cx;
        let dy = sy - cy;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          dx /= len;
          dy /= len;
        }

        // Find where this ray intersects the screen edge
        const edgeX = halfW - EDGE_PADDING;
        const edgeY = halfH - EDGE_PADDING;

        let t = Infinity;
        if (dx !== 0) t = Math.min(t, edgeX / Math.abs(dx));
        if (dy !== 0) t = Math.min(t, edgeY / Math.abs(dy));

        const finalX = cx + dx * t;
        const finalY = cy + dy * t;

        // Position the indicator
        ind.el.style.left = `${finalX}px`;
        ind.el.style.top = `${finalY}px`;
        ind.el.style.transform = `translate(-50%, -50%)`;

        // Rotate arrow to point in the right direction
        const angle = Math.atan2(dy, dx);
        ind.arrow.style.transform = `rotate(${angle}rad)`;

        // Fade based on distance — closer beacons have stronger indicators
        const dist = ind.pos3D.distanceTo(camera.position);
        const maxDist = 400;
        const fade = Math.max(0.3, 1 - dist / maxDist);
        ind.el.style.opacity = String(fade);
      }
    }
  }

  dispose() {
    for (const ind of this.indicators) {
      ind.el.remove();
    }
    this.indicators = [];
  }
}
