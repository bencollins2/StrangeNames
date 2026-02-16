/**
 * Dreamy flight controls — like a person drifting through clouds.
 *
 * Uses PointerLockControls for mouse look, velocity-based movement
 * with high damping for that floaty feel.
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class FlightController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);

    // Movement state
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    // Physics tuning — these control the "feel"
    this.acceleration = 1.2;
    this.damping = 0.94; // High = more floaty (0.9-0.98)
    this.boostMultiplier = 3.0;
    this.maxSpeed = 6.0;

    // Smooth orientation state
    this._orientTarget = null;       // target quaternion to slerp toward
    this._orientProgress = 0;        // 0 to 1
    this._orientDuration = 0.8;      // seconds for smooth turn
    this._orientStart = null;        // starting quaternion

    // Teleport state (Shift + digit keys)
    this._teleportTarget = null;     // target position to lerp toward
    this._teleportStart = null;      // starting position
    this._teleportProgress = 0;      // 0 to 1
    this._teleportDuration = 0.6;    // seconds for smooth teleport
    this._heldDigits = new Set();    // digit keys pressed while shift is held

    // Beacon positions for 1-6 keys (set via setBeacons)
    this.beacons = [];

    // Input state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      boost: false,
    };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  lock() {
    this.controls.lock();
  }

  onLock(fn) {
    this.controls.addEventListener('lock', fn);
  }

  onUnlock(fn) {
    this.controls.addEventListener('unlock', fn);
  }

  /**
   * Set beacon positions so 1-6 keys can orient toward them.
   * @param {Array<{word, x, y, z, axis}>} beacons — in order: x+, x-, y+, y-, z+, z-
   */
  setBeacons(beacons) {
    this.beacons = beacons;
  }

  /**
   * Smoothly orient the camera to look at a world position.
   */
  orientToward(targetPos) {
    // Temporarily unlock PointerLockControls' euler tracking
    // by computing the target quaternion ourselves
    const dir = new THREE.Vector3().subVectors(targetPos, this.camera.position).normalize();
    const targetQuat = new THREE.Quaternion();

    // Create a lookAt matrix to derive the target quaternion
    const lookMatrix = new THREE.Matrix4();
    lookMatrix.lookAt(this.camera.position, targetPos, new THREE.Vector3(0, 1, 0));
    targetQuat.setFromRotationMatrix(lookMatrix);

    this._orientStart = this.camera.quaternion.clone();
    this._orientTarget = targetQuat;
    this._orientProgress = 0;
  }

  /**
   * Teleport the camera smoothly to a target position, facing toward it.
   */
  teleportTo(targetPos) {
    // Stop any ongoing teleport or orientation
    this._orientTarget = null;
    this.velocity.set(0, 0, 0);

    // Arrive slightly back from the target so it's visible ahead of you
    const offset = new THREE.Vector3().subVectors(this.camera.position, targetPos).normalize().multiplyScalar(20);
    const arrivalPos = new THREE.Vector3().addVectors(targetPos, offset);

    this._teleportStart = this.camera.position.clone();
    this._teleportTarget = arrivalPos;
    this._teleportProgress = 0;

    // Also orient toward the destination
    this.orientToward(targetPos);
  }

  _getDigitIndex(code) {
    if (code === 'Digit1') return 0;
    if (code === 'Digit2') return 1;
    if (code === 'Digit3') return 2;
    if (code === 'Digit4') return 3;
    if (code === 'Digit5') return 4;
    if (code === 'Digit6') return 5;
    return -1;
  }

  _onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = true; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = true; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = true; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
      case 'Space': this.keys.up = true; e.preventDefault(); break;
      case 'KeyC': this.keys.down = true; break;
      case 'ShiftLeft': case 'ShiftRight':
        this.keys.boost = true;
        this._heldDigits.clear();
        break;
    }

    // Digit keys: if Shift is held, collect for teleport; otherwise orient
    const idx = this._getDigitIndex(e.code);
    if (idx >= 0 && this.beacons[idx]) {
      if (this.keys.boost) {
        this._heldDigits.add(idx);
      } else {
        this.orientToward(new THREE.Vector3(this.beacons[idx].x, this.beacons[idx].y, this.beacons[idx].z));
      }
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = false; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = false; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = false; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
      case 'Space': this.keys.up = false; break;
      case 'KeyC': this.keys.down = false; break;
      case 'ShiftLeft': case 'ShiftRight':
        this.keys.boost = false;
        // On Shift release, teleport to centroid of collected beacons
        if (this._heldDigits.size > 0) {
          const target = new THREE.Vector3();
          for (const i of this._heldDigits) {
            target.x += this.beacons[i].x;
            target.y += this.beacons[i].y;
            target.z += this.beacons[i].z;
          }
          target.divideScalar(this._heldDigits.size);
          this.teleportTo(target);
          this._heldDigits.clear();
        }
        break;
    }
  }

  update(delta) {
    if (!this.controls.isLocked) return;

    // Handle smooth orientation (1-6 keys)
    if (this._orientTarget) {
      this._orientProgress += delta / this._orientDuration;

      if (this._orientProgress >= 1) {
        // Finished — snap to target and sync PointerLockControls
        this.camera.quaternion.copy(this._orientTarget);
        this._syncControlsFromQuaternion();
        this._orientTarget = null;
        this._orientStart = null;
      } else {
        // Smooth ease-in-out slerp
        const t = this._easeInOut(this._orientProgress);
        this.camera.quaternion.slerpQuaternions(this._orientStart, this._orientTarget, t);
      }
    }

    // Handle smooth teleport (Shift + digit keys)
    if (this._teleportTarget) {
      this._teleportProgress += delta / this._teleportDuration;

      if (this._teleportProgress >= 1) {
        this.camera.position.copy(this._teleportTarget);
        this._teleportTarget = null;
        this._teleportStart = null;
      } else {
        const t = this._easeInOut(this._teleportProgress);
        this.camera.position.lerpVectors(this._teleportStart, this._teleportTarget, t);
      }
    }

    const accel = this.acceleration * (this.keys.boost ? this.boostMultiplier : 1);

    // Get camera's forward and right vectors
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    const right = new THREE.Vector3();
    right.crossVectors(forward, this.camera.up).normalize();

    const up = new THREE.Vector3(0, 1, 0);

    // Apply forces based on input
    if (this.keys.forward) this.velocity.addScaledVector(forward, accel * delta);
    if (this.keys.backward) this.velocity.addScaledVector(forward, -accel * delta);
    if (this.keys.left) this.velocity.addScaledVector(right, -accel * delta);
    if (this.keys.right) this.velocity.addScaledVector(right, accel * delta);
    if (this.keys.up) this.velocity.addScaledVector(up, accel * delta);
    if (this.keys.down) this.velocity.addScaledVector(up, -accel * delta);

    // Clamp speed
    const speed = this.velocity.length();
    if (speed > this.maxSpeed * (this.keys.boost ? this.boostMultiplier : 1)) {
      this.velocity.multiplyScalar(this.maxSpeed / speed);
    }

    // Apply damping — this creates the floaty coast
    this.velocity.multiplyScalar(this.damping);

    // Move the camera
    this.camera.position.addScaledVector(this.velocity, delta * 60);
  }

  _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /**
   * After a programmatic orientation change, sync PointerLockControls'
   * internal euler so mouse look continues smoothly from the new direction.
   */
  _syncControlsFromQuaternion() {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    // PointerLockControls uses camera's parent rotation internally.
    // We need to directly set the camera euler to match.
    this.camera.rotation.set(euler.x, euler.y, euler.z, 'YXZ');
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.controls.dispose();
  }
}
