import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {campusPosition, createCampusModel} from './campus-model.js';
import {createCanvasRenderer} from './campus-canvas-renderer.js';
import {positionMarkers} from './map-markers.js';

const overviewDirection = new THREE.Vector3(90, 225, 285).normalize();
const north = new THREE.Vector3(0, 1, 0);

function createRenderer() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', {antialias: true, powerPreference: 'high-performance'});
  if (!context) return createCanvasRenderer();
  const renderer = new THREE.WebGLRenderer({canvas, context});
  renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio || 1, 1.5), 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  return renderer;
}

export function createDetailedCampus({element, buildings, context, destinations, markers, onSelect, onBearing}) {
  const renderer = createRenderer();
  const {scene, models, pickMeshes, blockers, accessRing} = createCampusModel({buildings, context, destinations});
  const extent = new THREE.Box3();
  for (const mesh of pickMeshes) extent.expandByObject(mesh);
  const overviewTarget = extent.getCenter(new THREE.Vector3()).setY(3);
  const overviewRight = north.clone().cross(overviewDirection).normalize();
  const overviewUp = overviewDirection.clone().cross(overviewRight);
  const campusCorners = buildings.features.filter(({properties}) => properties.kind === 'destination')
    .flatMap(({geometry, properties}) => geometry.coordinates[0].slice(0, -1)
      .flatMap((point) => [campusPosition(point), campusPosition(point, properties.heightMeters + 3)]))
    .map((point) => point.sub(overviewTarget));
  const canvas = renderer.domElement;
  canvas.className = 'campus-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  element.append(canvas);

  const camera = new THREE.PerspectiveCamera(43, 1, .5, 3500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .14;
  controls.screenSpacePanning = false;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.minDistance = 12;
  controls.maxDistance = 2200;
  controls.minPolarAngle = .22;
  controls.maxPolarAngle = Math.PI / 2;
  controls.cursor.copy(overviewTarget);
  controls.maxTargetRadius = 530;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const raycaster = new THREE.Raycaster();
  const lineOfSight = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let width = 1;
  let height = 1;
  let frame = 0;
  let flight;
  let active;
  let low = false;

  function overview() {
    const slope = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let distance = 120;
    for (const point of campusCorners) {
      const horizontal = Math.abs(point.dot(overviewRight)) / (slope * camera.aspect * .86);
      const vertical = Math.abs(point.dot(overviewUp)) / (slope * .84);
      distance = Math.max(distance, point.dot(overviewDirection) + Math.max(horizontal, vertical));
    }
    return {target: overviewTarget, position: overviewTarget.clone().addScaledVector(overviewDirection, distance)};
  }

  function facade(destination, lowView) {
    const model = models.get(destination.id);
    const center = campusPosition(destination.labelCoordinates, model.height * .38);
    const direction = (model.entrance?.outward ?? overviewDirection).clone();
    direction.y = 0;
    direction.normalize();
    const target = center.clone();
    if (model.access) {
      target.x = THREE.MathUtils.lerp(center.x, model.access.x, .38);
      target.z = THREE.MathUtils.lerp(center.z, model.access.z, .38);
    }
    const bounds = new THREE.Box3().setFromObject(model.body);
    const size = bounds.getSize(new THREE.Vector3());
    if (lowView && model.entrance) {
      const start = model.entrance.position.clone().setY(2.8);
      const desired = THREE.MathUtils.clamp(Math.max(size.x, size.z) * .83, 24, 44);
      let chosen = null;
      for (const angle of [.27, -.27, .53, -.53, .80, -.80, 1.04, -1.04, 0]) {
        const heading = direction.clone().applyAxisAngle(north, angle);
        lineOfSight.set(start, heading);
        const obstruction = lineOfSight.intersectObjects(blockers, false).find(({object}) => object !== model.body);
        const distance = Math.min(desired, (obstruction?.distance ?? Infinity) - 2.4);
        if (!chosen || distance > chosen.distance) chosen = {heading, distance};
        if (distance === desired) break;
      }
      return {target: start.clone().setY(2.3), position: start.clone().addScaledVector(chosen.heading, Math.max(12, chosen.distance))};
    }
    const distance = (lowView ? Math.max(size.x, size.z) * .88 : Math.max(size.x, size.z) * 1.24)
      * Math.max(1, .82 / camera.aspect);
    direction.applyAxisAngle(north, lowView ? .23 : .43);
    const position = target.clone().addScaledVector(direction, Math.max(lowView ? 28 : 46, distance));
    position.y = lowView ? 5.1 : Math.max(24, distance * .48);
    return {target, position};
  }

  function eyeLevel() {
    const target = controls.target.clone();
    target.y = 1.5;
    const horizontal = camera.position.clone().sub(controls.target);
    horizontal.y = 0;
    horizontal.normalize();
    const anchor = active ?? destinations.reduce((nearest, destination) => {
      const distance = (item) => campusPosition(item.labelCoordinates).distanceToSquared(controls.target);
      return distance(destination) < distance(nearest) ? destination : nearest;
    });
    return anchor ? facade(anchor, true) : {target, position: target.clone().addScaledVector(horizontal, 70).setY(2.8)};
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function placeMarkers() {
    positionMarkers(markers, (coordinates, elevation) => {
      const point = campusPosition(coordinates, elevation).project(camera);
      if (point.z > 1 || point.z < -1) return null;
      return {x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2};
    }, width, height);
  }

  function render(now) {
    frame = 0;
    if (flight) {
      const t = Math.min(1, (now - flight.start) / flight.duration);
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(flight.from, flight.position, eased);
      controls.target.lerpVectors(flight.previousTarget, flight.target, eased);
      if (t === 1) flight = undefined;
      else requestRender();
    }
    controls.update();
    camera.updateMatrixWorld();
    renderer.render(scene, camera, Boolean(frame));
    placeMarkers();
    const bearing = 180 - THREE.MathUtils.radToDeg(controls.getAzimuthalAngle());
    onBearing(bearing);
  }

  function moveTo({target, position}, duration = 720) {
    if (motion.matches || !duration) {
      flight = undefined;
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
    } else {
      flight = {target, position, duration, start: performance.now(), from: camera.position.clone(),
        previousTarget: controls.target.clone()};
    }
    requestRender();
  }

  function resize() {
    width = Math.max(1, element.clientWidth);
    height = Math.max(1, element.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    requestRender();
  }

  controls.addEventListener('start', () => { flight = undefined; });
  controls.addEventListener('change', requestRender);
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  resize();
  moveTo(overview(), 0);

  const pointers = new Set();
  let press;
  canvas.addEventListener('pointerdown', (event) => {
    pointers.add(event.pointerId);
    press = pointers.size === 1 && event.button === 0 ? {x: event.clientX, y: event.clientY, id: event.pointerId} : null;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (press && Math.hypot(press.x - event.clientX, press.y - event.clientY) > 5) press = null;
  });
  canvas.addEventListener('pointerup', (event) => {
    pointers.delete(event.pointerId);
    if (press?.id !== event.pointerId) return;
    press = null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(2 * (event.clientX - rect.left) / width - 1, 1 - 2 * (event.clientY - rect.top) / height);
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects(pickMeshes, false);
    if (hit) onSelect(hit.object.userData.destinationId);
  });
  canvas.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId);
    press = null;
  });

  return {
    refresh: requestRender,
    focusLocation({coordinates, accuracy}) {
      low = false;
      const target = campusPosition(coordinates);
      const distance = THREE.MathUtils.clamp(accuracy * 3, 120, 600);
      moveTo({target, position: target.clone().addScaledVector(overviewDirection, distance)});
    },
    select(destination) {
      if (active) models.get(active.id).outline.visible = false;
      active = destination;
      const model = active && models.get(active.id);
      accessRing.visible = Boolean(model?.access);
      if (accessRing.visible) accessRing.position.copy(model.access).setY(.16);
      if (model) {
        model.outline.visible = true;
        moveTo(facade(active, low));
      } else {
        low = false;
        moveTo(overview());
      }
    },
    zoom(delta) {
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * 2 ** -delta, controls.minDistance, controls.maxDistance);
      moveTo({target: controls.target.clone(), position: controls.target.clone().add(offset.setLength(distance))}, 230);
    },
    rotate(delta) {
      const target = controls.target.clone();
      const offset = camera.position.clone().sub(target).applyAxisAngle(north, -THREE.MathUtils.degToRad(delta));
      moveTo({target, position: target.clone().add(offset)}, 300);
    },
    north() {
      const target = controls.target.clone();
      const offset = camera.position.clone().sub(target);
      const horizontalDistance = Math.hypot(offset.x, offset.z);
      moveTo({target, position: target.clone().add(new THREE.Vector3(0, offset.y, horizontalDistance))}, 370);
    },
    street() {
      low = !low;
      moveTo(active ? facade(active, low) : low ? eyeLevel() : overview());
      return low;
    },
  };
}
