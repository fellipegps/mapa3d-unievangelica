import {colors, mapStyle} from './map-style.js';
import {positionMarkers} from './map-markers.js';

const initialCenter = [-48.94403, -16.29394];
const initialBearing = 170.8;
const initialPitch = 53;
const minimumZoom = 15;
const maximumZoom = 20.4;
const version = '6.17.0';
const localDist = new URL('./vendor/', document.baseURI);
const cdnDist = new URL('https://unpkg.com/maplibre-gl@' + version + '/dist/');
const limitZoom = (zoom) => Math.min(maximumZoom, Math.max(minimumZoom, zoom));
const tightScreen = (element) => element.clientWidth <= 600;
const overviewZoom = (element) => tightScreen(element) ? 16.25 : 17;
const focusZoom = (element) => tightScreen(element) ? 18.7 : 19.1;
const locationZoom = (element, accuracy) => Math.max(overviewZoom(element), focusZoom(element) - Math.max(0, Math.log2(accuracy / 40)));
const meanPosition = (a, b) => a.map((value, i) => (value + b[i]) / 2);

function withTimeout(promise, milliseconds) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tempo de carregamento da vista 3D excedido.')), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function focusCenter(destination) {
  return destination.entry.coordinates
    ? meanPosition(destination.labelCoordinates, destination.entry.coordinates)
    : destination.labelCoordinates;
}

async function loadMapLibre() {
  const localModule = new URL('maplibre-gl.mjs', localDist);
  const localAvailable = await fetch(localModule, {method: 'HEAD'}).then((response) => response.ok);
  const base = localAvailable ? localDist : cdnDist;
  const library = await import(new URL('maplibre-gl.mjs', base).href);
  if (localAvailable) library.setWorkerUrl(new URL('maplibre-gl-worker.mjs', base).href);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('maplibre-gl.css', base).href;
  await new Promise((resolve, reject) => {
    css.onload = resolve;
    css.onerror = () => reject(new Error('Falha ao carregar o estilo do MapLibre.'));
    document.head.append(css);
  });
  return library;
}


function configure3D(library, options) {
  const {element, buildings, context, markers, onBearing, onSelect} = options;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = () => reducedMotion.matches ? 0 : 600;
  const map = new library.Map({
    container: element,
    style: mapStyle(buildings, context),
    center: initialCenter, zoom: overviewZoom(element),
    pitch: initialPitch, bearing: initialBearing,
    minZoom: minimumZoom, maxZoom: maximumZoom, maxPitch: 65,
    maxBounds: [[-48.947, -16.299], [-48.940, -16.289]],
    renderWorldCopies: false, attributionControl: false,
    canvasContextAttributes: {antialias: true},
  });
  let activeId;

  map.on('click', 'building-volumes', (event) => {
    const building = event.features[0];
    if (building.properties.kind === 'destination') onSelect(building.id);
  });
  map.on('mousemove', 'building-volumes', (event) => {
    map.getCanvas().style.cursor = event.features[0]?.properties.kind === 'destination' ? 'pointer' : '';
  });
  map.on('mouseleave', 'building-volumes', () => { map.getCanvas().style.cursor = ''; });
  map.on('rotate', () => onBearing(map.getBearing()));
  onBearing(map.getBearing());

  const resize = new ResizeObserver(() => map.resize());
  resize.observe(element);

  map.on('load', () => {
    if (activeId) map.setFeatureState({source: 'buildings', id: activeId}, {selected: true});
    map.addLayer({
      id: 'roof-markers',
      type: 'custom',
      renderingMode: '3d',
      render(_gl, {defaultProjectionData}) {
        const matrix = defaultProjectionData.mainMatrix;
        const width = element.clientWidth;
        const height = element.clientHeight;
        positionMarkers(markers, (coordinates, elevation) => {
          const {x, y, z} = library.MercatorCoordinate.fromLngLat(coordinates, elevation);
          const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
          if (w <= 0) return null;
          const screenX = (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w;
          const screenY = (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w;
          return {x: (screenX + 1) * width / 2, y: (1 - screenY) * height / 2};
        }, width, height);
      },
    });
  });

  return {
    ready: new Promise((resolve, reject) => {
      map.once('idle', resolve);
      map.once('error', ({error}) => reject(error));
    }),
    destroy() { resize.disconnect(); map.remove(); },
    refresh() { map.triggerRepaint(); },
    focusLocation({coordinates, accuracy}) {
      map.easeTo({center: coordinates, zoom: locationZoom(element, accuracy), pitch: initialPitch,
        offset: [0, 0], duration: duration()});
    },
    select(destination) {
      if (map.getSource('buildings')) {
        if (activeId) map.setFeatureState({source: 'buildings', id: activeId}, {selected: false});
        if (destination) map.setFeatureState({source: 'buildings', id: destination.id}, {selected: true});
      }
      activeId = destination?.id;
      if (destination) {
        map.resize();
        map.easeTo({center: focusCenter(destination), zoom: Math.max(map.getZoom(), focusZoom(element)),
          pitch: 47, duration: duration(), offset: tightScreen(element) ? [-10, 21] : [0, 28]});
      } else {
        this.reset();
      }
    },
    zoom(delta) { map.zoomTo(limitZoom(map.getZoom() + delta), {duration: duration() / 2}); },
    rotate(delta) { map.rotateTo(map.getBearing() + delta, {duration: duration() / 2}); },
    north() { map.rotateTo(0, {duration: duration() / 2}); },
    reset() {
      map.resize();
      map.easeTo({center: initialCenter, zoom: overviewZoom(element), bearing: initialBearing,
        pitch: initialPitch, offset: [0, 0], duration: duration()});
    },
  };
}

function configureCanvas3D({element, buildings, context, markers, onBearing, onSelect}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fallback-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  element.append(canvas);
  const drawing = canvas.getContext('2d');
  let center = initialCenter, zoom = overviewZoom(element), bearing = initialBearing, activeId;
  let width, height, ratio, pixelScale, angle, drag;
  const latitudeScale = Math.cos(initialCenter[1] * Math.PI / 180);
  const pitch = initialPitch * Math.PI / 180;
  const groundScale = Math.cos(pitch);
  const heightScale = Math.sin(pitch);
  const metersPerLongitudeDegree = 111319.49 * latitudeScale;
  const ground = context.features.filter(({properties}) => !properties.heightMeters);
  const volumes = [...context.features.filter(({properties}) => properties.heightMeters), ...buildings.features];
  const hitAreas = [];

  function project([lng, lat], elevation = 0) {
    const x = (lng - center[0]) * pixelScale;
    const y = (center[1] - lat) * pixelScale / latitudeScale;
    const forward = x * Math.sin(angle) + y * Math.cos(angle);
    const up = elevation * pixelScale / metersPerLongitudeDegree;
    return {
      x: width / 2 + x * Math.cos(angle) - y * Math.sin(angle),
      y: height / 2 + forward * groundScale - up * heightScale,
      depth: forward * heightScale + up * groundScale,
    };
  }

  function pathFor(points, closed) {
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);
    for (const {x, y} of points.slice(1)) path.lineTo(x, y);
    if (closed) path.closePath();
    return path;
  }

  function drawVolumes() {
    const faces = [];
    for (const {id, geometry, properties} of volumes) {
      const {kind, shade, heightMeters} = properties;
      const ring = geometry.coordinates[0].slice(0, -1);
      const base = ring.map((point) => project(point, kind === 'bridge' ? 3 : 0));
      const roof = ring.map((point) => project(point, heightMeters));
      const color = kind === 'tree' ? colors.tree[shade] : id === activeId ? colors.selected : colors[kind];
      const destination = kind === 'destination' ? id : undefined;
      const addFace = (points, shadow = 0) => {
        const depth = points.reduce((total, point) => total + point.depth, 0) / points.length;
        faces.push({points, depth, color, shadow, destination});
      };
      const winding = base.reduce((area, point, i) => {
        const next = base[(i + 1) % base.length];
        return area + point.x * next.y - next.x * point.y;
      }, 0);
      for (const [i, point] of base.entries()) {
        const next = (i + 1) % base.length;
        const dx = base[next].x - point.x;
        if (winding * dx >= 0) continue;
        const dy = base[next].y - point.y;
        const shade = .20 + .22 * (1 + dy / Math.hypot(dx, dy)) / 2;
        addFace([point, base[next], roof[next], roof[i]], shade);
      }
      addFace(roof);
    }
    faces.sort((a, b) => a.depth - b.depth);
    for (const {points, color, shadow, destination} of faces) {
      const path = pathFor(points, true);
      drawing.fillStyle = color;
      drawing.fill(path);
      if (shadow) {
        drawing.fillStyle = 'rgba(23, 32, 25, ' + shadow + ')';
        drawing.fill(path);
      }
      hitAreas.push({path, destination});
    }
  }

  function draw() {
    width = element.clientWidth;
    height = element.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    drawing.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawing.fillStyle = colors.background;
    drawing.fillRect(0, 0, width, height);
    pixelScale = 512 * 2 ** zoom / 360;
    angle = -bearing * Math.PI / 180;
    hitAreas.length = 0;

    for (const {geometry, properties} of ground) {
      const {kind} = properties;
      const area = geometry.type === 'Polygon';
      const coordinates = area ? geometry.coordinates[0] : geometry.coordinates;
      const path = pathFor(coordinates.map((coordinate) => project(coordinate)), area);
      if (area) {
        drawing.fillStyle = colors[kind];
        drawing.fill(path);
      } else {
        drawing.strokeStyle = colors[kind];
        drawing.lineWidth = ({avenue: 24, road: 9, walk: 4, track: 12, 'parking-line': .8})[kind] * 2 ** (zoom - 18);
        drawing.lineCap = 'round';
        drawing.lineJoin = 'round';
        drawing.stroke(path);
      }
    }
    drawVolumes();
    positionMarkers(markers, project, width, height);
    onBearing(bearing);
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, start: center, moved: false};
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const screenY = event.clientY - drag.y;
    if (Math.hypot(dx, screenY) > 4) drag.moved = true;
    if (!drag.moved) return;
    const dy = screenY / groundScale;
    center = [drag.start[0] - (dx * Math.cos(angle) + dy * Math.sin(angle)) / pixelScale,
      drag.start[1] + (-dx * Math.sin(angle) + dy * Math.cos(angle)) * latitudeScale / pixelScale];
    draw();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (drag?.id !== event.pointerId) return;
    if (!drag.moved) {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * ratio;
      const y = (event.clientY - rect.top) * ratio;
      const hit = hitAreas.findLast(({path}) => drawing.isPointInPath(path, x, y));
      if (hit?.destination) onSelect(hit.destination);
    }
    drag = undefined;
  });
  canvas.addEventListener('pointercancel', () => { drag = undefined; });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom = limitZoom(zoom + (event.deltaY < 0 ? .3 : -.3));
    draw();
  }, {passive: false});

  const observer = new ResizeObserver(draw);
  observer.observe(element);
  draw();

  return {
    refresh: draw,
    focusLocation({coordinates, accuracy}) {
      center = coordinates;
      zoom = locationZoom(element, accuracy);
      draw();
    },
    select(destination) {
      activeId = destination?.id;
      if (!destination) return this.reset();
      center = focusCenter(destination);
      zoom = Math.max(zoom, focusZoom(element));
      draw();
    },
    zoom(delta) { zoom = limitZoom(zoom + delta); draw(); },
    rotate(delta) { bearing += delta; draw(); },
    north() { bearing = 0; draw(); },
    reset() { center = initialCenter; zoom = overviewZoom(element); bearing = initialBearing; draw(); },
  };
}

export async function createCampusMap(options) {
  try {
    const {createDetailedCampus} = await import('./campus-scene.js');
    return {scene: createDetailedCampus(options), mode: 'architecture'};
  } catch (error) {
    console.warn('Maquete detalhada indisponível. Abrindo o mapa 3D.', error);
    options.element.replaceChildren();
  }
  if (options.offline) return {scene: configureCanvas3D(options), mode: 'canvas-3d'};
  let scene;
  try {
    const library = await withTimeout(loadMapLibre(), 12000);
    scene = configure3D(library, options);
    await withTimeout(scene.ready, 8000);
    return {scene, mode: '3d'};
  } catch (error) {
    console.warn('MapLibre indisponível. Usando a vista 3D local.', error);
    scene?.destroy();
    options.element.replaceChildren();
    return {scene: configureCanvas3D(options), mode: 'canvas-3d'};
  }
}
