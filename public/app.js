import {icon} from './icons.js';
import {createCampusMap} from './campus-map.js';
import {createSatelliteMap} from './campus-satellite.js';
import {trackCampusLocation} from './campus-location.js';

const get = (id) => document.getElementById(id);
const directory = get('directory');
const detail = get('detail');
const markersElement = get('markers');
const about = get('about');
const mapMessage = get('map-message');
const search = get('destination-search');
const count = get('destination-count');
const embeddedData = get('campus-data');
const campusData = embeddedData && JSON.parse(embeddedData.textContent);

document.querySelectorAll('[data-icon]').forEach((node) => { node.innerHTML = icon(node.dataset.icon); });
get('about-button').addEventListener('click', () => about.showModal());

async function readData(file) {
  if (campusData) return campusData[file];
  const response = await fetch(new URL('./data/' + file, document.baseURI));
  if (!response.ok) throw new Error('Falha ao carregar ' + file);
  return response.json();
}

function sourceLinks(list, ids, sources) {
  list.replaceChildren(...[...new Set(ids)].map((id) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.textContent = sources[id].label;
    link.href = sources[id].url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    li.append(link);
    return li;
  }));
}

function renderPhoto(destination) {
  const photo = destination.entry.photo;
  const figure = get('entry-photo');
  const note = get('photo-note');
  const img = get('photo-image');
  const link = get('photo-credit');
  figure.hidden = !photo;
  note.hidden = Boolean(photo) || (!destination.entry.coordinates && !destination.photoNote);
  note.textContent = destination.photoNote || 'Foto da entrada indisponível.';
  img.onerror = () => { figure.hidden = true; note.hidden = false; };
  if (photo) {
    img.src = photo.path;
    img.alt = photo.alt;
    link.textContent = photo.credit;
    link.href = photo.sourceUrl;
  } else {
    img.removeAttribute('src');
    img.alt = '';
  }
}

async function init() {
  const [{destinations, sources, aboutSources}, buildings, context] = await Promise.all([
    readData('destinations.json'), readData('buildings.geojson'), readData('context.geojson'),
  ]);
  const buildingById = new Map(buildings.features.map((feature) => [feature.id, feature]));
  const pins = new Map();
  const cards = new Map();
  const locationDot = get('location-dot');
  const locationArea = get('location-area');
  let active, scene;
  let locationFix;
  let view = '3d';
  let satellite, satelliteSelection, modelSelection;
  const currentScene = () => view === 'satellite' ? satellite : scene;

  function selectInView(destination) {
    currentScene()?.select(destination);
    if (view === 'satellite') satelliteSelection = destination;
    else modelSelection = destination;
  }

  const entryLabel = document.createElement('div');
  entryLabel.className = 'entry-pin';
  entryLabel.hidden = true;
  markersElement.append(entryLabel);
  const accessLegend = document.querySelector('.legend-access');
  const accessLegendLabel = accessLegend.parentElement;
  sourceLinks(get('about-sources'), aboutSources, sources);

  function select(id) {
    const destination = destinations.find((item) => item.id === id);
    if (!destination) return;
    active = destination;
    const confirmed = destination.entry.status === 'confirmed';
    const hasPoint = Boolean(destination.entry.coordinates);
    const status = confirmed ? 'Entrada confirmada' : hasPoint ? 'Entrada a confirmar · ponto demonstrativo' : 'Entrada a confirmar';

    get('detail-icon').innerHTML = icon(destination.icon);
    get('detail-kind').textContent = destination.kind;
    get('detail-name').textContent = destination.name;
    get('access-description').textContent = destination.entry.description;
    get('access-status').textContent = status;
    get('access-card').classList.toggle('confirmed', confirmed);
    entryLabel.classList.toggle('confirmed', confirmed);
    entryLabel.innerHTML = icon('door');
    entryLabel.append(confirmed ? 'Entrada' : 'Acesso a confirmar');
    entryLabel.hidden = !hasPoint;
    accessLegend.classList.toggle('confirmed', confirmed);
    accessLegendLabel.lastChild.textContent = confirmed ? ' Entrada confirmada' : ' Acesso a confirmar';
    const {heightMeters, heightStatus, geometryStatus} = buildingById.get(id).properties;
    const geometryLabel = {osm: 'Contorno OpenStreetMap. ', subdivision: 'Subdivisão ilustrativa de um contorno OpenStreetMap. ', demo: 'Contorno esquemático. '};
    get('detail-data').textContent =
      (geometryLabel[geometryStatus] ?? 'Contorno cartográfico. ') +
      (destination.placementStatus === 'approximate' ? 'Associação do bloco ao volume aproximada. ' : '') +
      'Altura ' + (heightStatus === 'estimated' ? 'estimada' : 'documentada') + ' de ' + heightMeters + ' m.';
    get('sources').open = false;
    sourceLinks(get('detail-sources'), [...destination.sources, ...destination.entry.sources], sources);
    renderPhoto(destination);

    for (const [pinId, pin] of pins) pin.setAttribute('aria-pressed', String(pinId === id));
    detail.hidden = false;
    directory.hidden = true;
    detail.parentElement.scrollTop = 0;
    get('detail-name').focus({preventScroll: true});
    selectInView(destination);
  }

  for (const destination of destinations) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'destination';
    const picture = document.createElement('span');
    picture.className = 'destination-icon';
    picture.innerHTML = icon(destination.icon);
    const title = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = destination.name;
    const kind = document.createElement('small');
    kind.textContent = destination.kind;
    title.append(name, kind);
    const chevron = document.createElement('span');
    chevron.dataset.icon = 'chevron';
    chevron.innerHTML = icon('chevron');
    button.append(picture, title, chevron);
    button.addEventListener('click', () => select(destination.id));
    get('destination-list').append(button);
    cards.set(destination.id, button);

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'map-pin';
    pin.style.visibility = 'hidden';
    pin.setAttribute('aria-label', destination.name);
    pin.title = destination.name;
    pin.setAttribute('aria-pressed', 'false');
    pin.textContent = destination.shortName;
    pin.addEventListener('click', () => select(destination.id));
    pins.set(destination.id, pin);
    markersElement.append(pin);
  }

  const normalize = (value) => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  search.addEventListener('input', () => {
    const query = normalize(search.value);
    const blockCode = /^[a-z]\d?$/.test(query);
    let visible = 0;
    for (const {id, name, kind, shortName, sector} of destinations) {
      const button = cards.get(id);
      const code = normalize(shortName);
      const terms = normalize([name, kind, sector].join(' '));
      button.hidden = blockCode ? code !== query : code !== query && !terms.includes(query);
      if (!button.hidden) visible++;
    }
    count.textContent = visible ? visible + (visible === 1 ? ' destino' : ' destinos') : 'Nenhum destino encontrado';
  });
  count.textContent = destinations.length + ' destinos';

  const mapTools = get('map-tools');
  const compass = get('compass');
  mapTools.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  compass.disabled = true;

  function resetSelection(restoreFocus) {
    const previous = active;
    active = undefined;
    entryLabel.hidden = true;
    accessLegend.classList.remove('confirmed');
    accessLegendLabel.lastChild.textContent = ' Acesso a confirmar';
    pins.forEach((pin) => pin.setAttribute('aria-pressed', 'false'));
    directory.hidden = false;
    detail.hidden = true;
    selectInView(undefined);
    if (view === '3d') resetStreetControl();
    if (restoreFocus && previous) {
      const button = cards.get(previous.id);
      (button.hidden ? search : button).focus({preventScroll: true});
    }
  }

  function resetStreetControl() {
    get('street-control').querySelector('button').setAttribute('aria-pressed', 'false');
    if (get('map-stage').dataset.view === 'architecture') get('view-name').textContent = 'Maquete 3D';
  }

  get('back-button').addEventListener('click', () => resetSelection(true));
  compass.addEventListener('click', () => scene?.north());
  mapTools.addEventListener('click', (event) => {
    switch (event.target.closest('button')?.dataset.action) {
      case 'zoom-in': currentScene()?.zoom(.55); break;
      case 'zoom-out': currentScene()?.zoom(-.55); break;
      case 'left': scene?.rotate(-30); break;
      case 'right': scene?.rotate(30); break;
      case 'reset': resetSelection(false); break;
      case 'street': {
        const low = scene?.street?.();
        get('street-control').querySelector('button').setAttribute('aria-pressed', String(Boolean(low)));
        get('view-name').textContent = low ? 'Nível do campus' : 'Maquete 3D';
        break;
      }
    }
  });

  const roofPins = destinations.map((destination) => ({
    id: destination.id, element: pins.get(destination.id), coordinates: destination.labelCoordinates,
    elevation: buildingById.get(destination.id).properties.heightMeters + 3,
  }));

  function visibleMarkers(mode) {
    if (mode !== view) return [];
    const markers = roofPins.map((pin) => ({...pin, priority: pin.id === active?.id ? 3 : pin.id === 'ginasio' ? 1 : 0}));
    if (active?.entry.coordinates) markers.push({element: entryLabel, coordinates: active.entry.coordinates, elevation: 0, priority: 2});
    if (locationFix && (mode === 'satellite' || locationFix.nearCampus)) {
      markers.push({element: locationDot, coordinates: locationFix.coordinates, elevation: 0, priority: 4, centered: true,
        area: {ring: locationFix.ring, element: locationArea}});
    }
    return markers;
  }

  function syncLocationMarker() {
    locationDot.hidden = !locationFix || (view === '3d' && !locationFix.nearCampus);
    locationDot.style.visibility = 'hidden';
    locationArea.toggleAttribute('hidden', true);
  }

  function showMapMessage(message) {
    if (mapMessage.textContent !== message) mapMessage.textContent = message;
    mapMessage.hidden = !message;
  }

  const result = await createCampusMap({
    element: get('map'), buildings, context, destinations, offline: Boolean(campusData),
    onSelect: select,
    onBearing: (bearing) => { get('north-arrow').style.rotate = -bearing + 'deg'; },
    markers: () => visibleMarkers('3d'),
  });
  scene = result.scene;
  get('map-stage').dataset.view = result.mode;
  if (result.mode === 'architecture') {
    get('view-name').textContent = 'Maquete 3D';
    get('street-control').hidden = false;
  }
  if (result.mode === 'canvas-3d') get('view-name').textContent = 'Vista 3D local';
  mapTools.querySelectorAll('button').forEach((button) => { button.disabled = false; });
  compass.disabled = false;
  if (active) selectInView(active);
  scene.refresh();

  const modelButton = get('view-3d');
  const satelliteButton = get('view-satellite');
  const satelliteElement = get('satellite-map');
  function switchView(mode) {
    if (view === mode) return;
    view = mode;
    const showingSatellite = mode === 'satellite';
    pins.forEach((pin) => { pin.style.visibility = 'hidden'; });
    entryLabel.style.visibility = 'hidden';
    syncLocationMarker();
    showMapMessage('');
    modelButton.setAttribute('aria-pressed', String(!showingSatellite));
    satelliteButton.setAttribute('aria-pressed', String(showingSatellite));
    get('map').hidden = showingSatellite;
    satelliteElement.hidden = !showingSatellite;
    get('rotate-control').hidden = showingSatellite;
    get('street-control').hidden = showingSatellite || result.mode !== 'architecture';
    get('satellite-credit').hidden = !showingSatellite;
    compass.hidden = showingSatellite;

    if (showingSatellite && !satellite) {
      satellite = createSatelliteMap({element: satelliteElement, buildings, onSelect: select, onStatus: showMapMessage,
        markers: () => visibleMarkers('satellite')});
      selectInView(active);
    } else if (active !== (showingSatellite ? satelliteSelection : modelSelection)) {
      selectInView(active);
      if (!showingSatellite && !active) resetStreetControl();
    }
    currentScene().refresh();
  }

  modelButton.disabled = false;
  satelliteButton.disabled = false;
  modelButton.addEventListener('click', () => switchView('3d'));
  satelliteButton.addEventListener('click', () => switchView('satellite'));

  const locationButton = get('location-toggle');
  trackCampusLocation({
    button: locationButton, recenter: get('location-recenter'), panel: get('location-panel'),
    status: get('location-status'), accuracyLabel: get('location-accuracy'),
    buildings: buildings.features.filter(({properties}) => properties.kind === 'destination'),
    campus: context.features.find(({properties}) => properties.kind === 'campus'),
    names: new Map(destinations.map(({id, name}) => [id, name])),
    onChange(fix) {
      locationFix = fix;
      syncLocationMarker();
      if (view === 'satellite') satellite.refreshMarkers();
      else scene.refresh();
    },
    onCenter(fix) {
      if (!fix.nearCampus) switchView('satellite');
      currentScene().focusLocation(fix);
      if (view === '3d') resetStreetControl();
    },
  });
  locationButton.disabled = false;
}

init().catch((error) => {
  console.error(error);
  mapMessage.textContent = 'Não foi possível carregar os dados do campus.';
  mapMessage.hidden = false;
});
