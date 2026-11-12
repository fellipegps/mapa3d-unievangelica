const metersPerDegree = 111319.49;
const radians = Math.PI / 180;
const earthRadius = metersPerDegree / radians;

function ringRelation(ring, origin, longitudeScale) {
  const points = ring.map(([lng, lat]) => [(lng - origin[0]) * longitudeScale, (lat - origin[1]) * metersPerDegree]);
  let inside = false;
  let distance = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [x, y] = points[i];
    const [previousX, previousY] = points[j];
    const dx = x - previousX;
    const dy = y - previousY;
    if ((y > 0) !== (previousY > 0) && previousX - previousY * dx / dy > 0) inside = !inside;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, -(previousX * dx + previousY * dy) / lengthSquared)) : 0;
    distance = Math.min(distance, Math.hypot(previousX + t * dx, previousY + t * dy));
  }
  return {inside, distance};
}

function polygonRelation(feature, coordinates, longitudeScale) {
  const [outer, ...holes] = feature.geometry.coordinates.map((ring) => ringRelation(ring, coordinates, longitudeScale));
  return {inside: outer.inside && holes.every((hole) => !hole.inside),
    distance: Math.min(outer.distance, ...holes.map((hole) => hole.distance))};
}

export function locateCampusPosition(coordinates, accuracy, buildings, campus) {
  const longitudeScale = metersPerDegree * Math.cos(coordinates[1] * radians);
  const candidates = buildings.map((feature) => ({id: feature.id, ...polygonRelation(feature, coordinates, longitudeScale)}))
    .filter(({inside, distance}) => inside || distance <= accuracy);
  if (candidates.length === 1 && candidates[0].inside && candidates[0].distance > accuracy) {
    return {status: 'inside', ids: [candidates[0].id], nearCampus: true};
  }
  const campusRelation = polygonRelation(campus, coordinates, longitudeScale);
  const nearCampus = campusRelation.inside || campusRelation.distance <= 80;
  if (candidates.length) return {status: 'uncertain', ids: candidates.map(({id}) => id), nearCampus};
  if (campusRelation.inside && campusRelation.distance > accuracy) return {status: 'outdoors', ids: [], nearCampus};
  return {status: campusRelation.distance <= accuracy ? 'uncertain' : 'outside', ids: [], nearCampus};
}

function accuracyRing([longitude, latitude], accuracy) {
  const angularRadius = accuracy / earthRadius;
  const centerLat = latitude * radians;
  const sinCenter = Math.sin(centerLat);
  const cosCenter = Math.cos(centerLat);
  const sinRadius = Math.sin(angularRadius);
  const cosRadius = Math.cos(angularRadius);
  return Array.from({length: 40}, (_, index) => {
    const heading = index * Math.PI / 20;
    const lat = Math.asin(Math.min(1, Math.max(-1, sinCenter * cosRadius + cosCenter * sinRadius * Math.cos(heading))));
    const longitudeOffset = Math.atan2(Math.sin(heading) * sinRadius * cosCenter, cosRadius - sinCenter * Math.sin(lat));
    return [longitude + longitudeOffset / radians, lat / radians];
  });
}

export function trackCampusLocation({button, recenter, panel, status, accuracyLabel, buildings, campus, names, onChange, onCenter}) {
  let watchId, fix;
  let generation = 0;

  function update(message, next) {
    fix = next;
    panel.hidden = !message;
    if (status.textContent !== message) status.textContent = message;
    accuracyLabel.textContent = next ? `Precisão estimada: ±${Math.ceil(next.accuracy)} m` : '';
    accuracyLabel.hidden = !next;
    recenter.hidden = !next;
    recenter.textContent = next?.nearCampus ? 'Centralizar' : 'Ver no satélite';
    onChange(next);
  }

  function stop() {
    generation++;
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    watchId = undefined;
    button.setAttribute('aria-pressed', 'false');
  }

  function start() {
    if (!window.isSecureContext) {
      update('Para usar sua localização, abra o mapa em HTTPS ou no localhost do dispositivo.');
      return;
    }
    if (!navigator.geolocation) {
      update('A localização do dispositivo não está disponível neste navegador.');
      return;
    }
    const request = ++generation;
    let centerOnFirstFix = true;
    button.setAttribute('aria-pressed', 'true');
    update('Buscando sua localização…');
    try {
      watchId = navigator.geolocation.watchPosition(({coords}) => {
        if (request !== generation) return;
        const {longitude, latitude, accuracy} = coords;
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(accuracy)
          || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || accuracy < 0) {
          update('O dispositivo ainda não forneceu uma posição válida.');
          return;
        }
        const coordinates = [longitude, latitude];
        const result = locateCampusPosition(coordinates, accuracy, buildings, campus);
        const name = names.get(result.ids[0]);
        const messages = {
          inside: `Provável bloco: ${name}`,
          uncertain: result.ids.length === 1 ? `Perto de ${name} · bloco incerto` : 'Sinal insuficiente para identificar o bloco.',
          outdoors: 'Área externa do campus.',
          outside: 'Fora da área mapeada do campus.',
        };
        const next = {...result, coordinates, accuracy, ring: accuracyRing(coordinates, accuracy)};
        update(messages[result.status], next);
        if (centerOnFirstFix && next.nearCampus) onCenter(next);
        centerOnFirstFix = false;
      }, (error) => {
        if (request !== generation) return;
        if (error.code === 1) {
          stop();
          update('Localização bloqueada. Permita o acesso nas configurações do site e tente novamente.');
        } else {
          update('Sem sinal de localização no momento. Aguardando uma nova posição…');
        }
      }, {enableHighAccuracy: true, maximumAge: 3000, timeout: 15000});
    } catch {
      stop();
      update('Não foi possível iniciar a localização neste navegador.');
    }
  }

  button.addEventListener('click', () => {
    if (watchId === undefined) start();
    else {
      stop();
      update('');
    }
  });
  recenter.addEventListener('click', () => { if (fix) onCenter(fix); });
  window.addEventListener('pagehide', () => {
    if (watchId === undefined) return;
    stop();
    update('');
  });
}
