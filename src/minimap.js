/**
 * 3D wireframe minimap showing the user's position within the word space.
 *
 * Creates its own Three.js scene, camera, and renderer (150x150 canvas)
 * overlaid in the bottom-left corner of the screen.
 */

import * as THREE from 'three';

/**
 * Create a small text sprite for axis labels in the minimap.
 */
function createLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 24;

  ctx.font = `bold ${fontSize}px "SF Mono", "Fira Code", "Consolas", monospace`;
  const metrics = ctx.measureText(text);
  const width = Math.ceil(metrics.width) + 8;
  const height = fontSize + 8;

  canvas.width = width;
  canvas.height = height;

  ctx.font = `bold ${fontSize}px "SF Mono", "Fira Code", "Consolas", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  const aspect = width / height;
  const baseSize = 0.35;
  sprite.scale.set(baseSize * aspect, baseSize, 1);

  return sprite;
}

// Axis colors matching beacon colors from wordcloud.js
const AXIS_COLORS = {
  xNeg: '#6666ff',
  xPos: '#ff6666',
  yPos: '#66ff66',
  yNeg: '#ffaa33',
  zPos: '#ff66ff',
  zNeg: '#66ffff',
};

/**
 * Create the minimap. Appends a canvas to the given container element.
 *
 * @param {HTMLElement} container - The DOM element to append the minimap canvas to
 * @returns {object} Minimap control object with setBounds, setAxes, update, show, hide
 */
export function createMinimap(container) {
  const SIZE = 150;

  // --- Own scene ---
  const scene = new THREE.Scene();

  // --- Isometric-ish camera ---
  // Use orthographic for a clean minimap look
  const frustum = 2.2;
  const mmCamera = new THREE.OrthographicCamera(
    -frustum, frustum, frustum, -frustum, 0.1, 100
  );
  // Fixed isometric angle: slightly above and rotated ~45 degrees
  mmCamera.position.set(3, 2.5, 3);
  mmCamera.lookAt(0, 0, 0);

  // --- Renderer ---
  const mmRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  mmRenderer.setSize(SIZE, SIZE);
  mmRenderer.setPixelRatio(window.devicePixelRatio);
  mmRenderer.setClearColor(0x000000, 0);
  container.appendChild(mmRenderer.domElement);

  // Ambient light so everything is visible
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  // --- Wireframe cube (placeholder — updated by setBounds) ---
  let cubeLines = null;

  // --- Axis label sprites ---
  const labels = {};

  // --- Position dot ---
  const dotGeometry = new THREE.SphereGeometry(0.06, 16, 16);
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
  });
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  scene.add(dot);

  // Add a glow around the dot using a point light
  const dotLight = new THREE.PointLight(0xffffff, 0.5, 2);
  dot.add(dotLight);

  // --- Mapping state ---
  // We map world bounds -> a normalized [-1,1] cube in minimap space
  let boundsMin = new THREE.Vector3(-100, -100, -100);
  let boundsMax = new THREE.Vector3(100, 100, 100);

  function worldToMinimap(worldPos) {
    // Map world position to [-1, 1] range in minimap
    const x = ((worldPos.x - boundsMin.x) / (boundsMax.x - boundsMin.x)) * 2 - 1;
    const y = ((worldPos.y - boundsMin.y) / (boundsMax.y - boundsMin.y)) * 2 - 1;
    const z = ((worldPos.z - boundsMin.z) / (boundsMax.z - boundsMin.z)) * 2 - 1;
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Pick a color for the position dot based on nearest axis.
   */
  function getDotColor(minimapPos) {
    const colorEntries = [
      { axis: 'xPos', dir: new THREE.Vector3(1, 0, 0), color: new THREE.Color(AXIS_COLORS.xPos) },
      { axis: 'xNeg', dir: new THREE.Vector3(-1, 0, 0), color: new THREE.Color(AXIS_COLORS.xNeg) },
      { axis: 'yPos', dir: new THREE.Vector3(0, 1, 0), color: new THREE.Color(AXIS_COLORS.yPos) },
      { axis: 'yNeg', dir: new THREE.Vector3(0, -1, 0), color: new THREE.Color(AXIS_COLORS.yNeg) },
      { axis: 'zPos', dir: new THREE.Vector3(0, 0, 1), color: new THREE.Color(AXIS_COLORS.zPos) },
      { axis: 'zNeg', dir: new THREE.Vector3(0, 0, -1), color: new THREE.Color(AXIS_COLORS.zNeg) },
    ];

    // Use the normalized position to blend: weight each axis by how far along its direction we are
    const result = new THREE.Color(0, 0, 0);
    let totalWeight = 0;

    for (const entry of colorEntries) {
      // Dot product of position with axis direction, clamped to [0, 1]
      const weight = Math.max(0, minimapPos.dot(entry.dir));
      result.r += entry.color.r * weight;
      result.g += entry.color.g * weight;
      result.b += entry.color.b * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      result.r /= totalWeight;
      result.g /= totalWeight;
      result.b /= totalWeight;
    } else {
      result.set(0xffffff);
    }

    return result;
  }

  function buildCube() {
    if (cubeLines) scene.remove(cubeLines);

    const box = new THREE.BoxGeometry(2, 2, 2); // normalized [-1,1] cube
    const edges = new THREE.EdgesGeometry(box);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
    });
    cubeLines = new THREE.LineSegments(edges, lineMat);
    scene.add(cubeLines);
    box.dispose();
  }

  buildCube();

  // --- Public API ---
  const minimap = {
    /**
     * Set the bounds of the word space. The wireframe cube maps to these bounds.
     */
    setBounds(minX, maxX, minY, maxY, minZ, maxZ) {
      boundsMin.set(minX, minY, minZ);
      boundsMax.set(maxX, maxY, maxZ);
    },

    /**
     * Set the 6 axis word labels.
     * @param {object} axes - { xPos, xNeg, yPos, yNeg, zPos, zNeg }
     */
    setAxes(axes) {
      // Remove old labels
      for (const key of Object.keys(labels)) {
        if (labels[key]) scene.remove(labels[key]);
      }

      // Face center positions on the [-1,1] cube
      const positions = {
        xPos: new THREE.Vector3(1.15, 0, 0),
        xNeg: new THREE.Vector3(-1.15, 0, 0),
        yPos: new THREE.Vector3(0, 1.15, 0),
        yNeg: new THREE.Vector3(0, -1.15, 0),
        zPos: new THREE.Vector3(0, 0, 1.15),
        zNeg: new THREE.Vector3(0, 0, -1.15),
      };

      for (const [key, word] of Object.entries(axes)) {
        const color = AXIS_COLORS[key] || '#ffffff';
        const sprite = createLabelSprite(word, color);
        sprite.position.copy(positions[key]);
        labels[key] = sprite;
        scene.add(sprite);
      }
    },

    /**
     * Update the minimap each frame. Moves the position dot.
     * @param {THREE.Vector3} cameraPosition - The main camera's world position
     */
    update(cameraPosition) {
      const mapped = worldToMinimap(cameraPosition);

      // Clamp to the cube so the dot doesn't fly off
      mapped.clampScalar(-1.0, 1.0);

      dot.position.copy(mapped);

      // Color the dot based on position
      const color = getDotColor(mapped);
      dotMaterial.color.copy(color);
      dotLight.color.copy(color);

      // Render
      mmRenderer.render(scene, mmCamera);
    },

    /**
     * Show the minimap.
     */
    show() {
      container.style.display = '';
    },

    /**
     * Hide the minimap.
     */
    hide() {
      container.style.display = 'none';
    },
  };

  return minimap;
}
