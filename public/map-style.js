const hasKind = (kind) => ['==', ['get', 'kind'], kind];
const fill = (id, color, outline = color) => ({
  id, source: 'context', type: 'fill', filter: hasKind(id),
  paint: {'fill-color': color, 'fill-outline-color': outline},
});
const line = (id, kind, color, widths) => ({
  id, source: 'context', type: 'line', filter: hasKind(kind),
  layout: {'line-cap': 'round', 'line-join': 'round'},
  paint: {
    'line-color': color,
    'line-width': ['interpolate', ['exponential', 2], ['zoom'], 16, widths[0], 19, widths[1]],
  },
});

export const colors = {
  background: '#e7e7da', campus: '#ebeadc', green: '#ccd7b5', court: '#a7bb9e',
  parking: '#d5d9cb', paving: '#eee9d8', avenue: '#b1b8ae', road: '#c2c7bb',
  walk: '#f9f4e6', track: '#ac795e', 'parking-line': '#e9ecdf', context: '#d3ccb8', bridge: '#c9cbb1',
  destination: '#88a182', selected: '#486d50',
  tree: ['#889d76', '#9aaf85', '#a9b792'],
};

export function mapStyle(buildings, context) {
  const avenueCenter = line('avenue-center', 'avenue', '#e7e6d5', [.5, 3]);
  avenueCenter.paint['line-dasharray'] = [3, 4];
  return {
    version: 8,
    light: {anchor: 'map', position: [1.1, 205, 43], intensity: .45, color: '#fff4df'},
    sources: {buildings: {type: 'geojson', data: buildings}, context: {type: 'geojson', data: context}},
    layers: [
      {id: 'background', type: 'background', paint: {'background-color': colors.background}},
      fill('campus', colors.campus, '#d8dcc6'),
      fill('green', colors.green, '#c4cfaa'),
      fill('court', colors.court, '#95ab91'),
      fill('parking', colors.parking),
      fill('paving', colors.paving),
      line('avenue-edge', 'avenue', '#d0d1c6', [8, 65]),
      line('avenue', 'avenue', colors.avenue, [6, 52]),
      avenueCenter,
      line('road-edge', 'road', '#d4d5c7', [3.8, 31]),
      line('road', 'road', colors.road, [2.6, 21]),
      line('walk', 'walk', colors.walk, [1.1, 9]),
      line('track', 'track', colors.track, [2, 17]),
      line('parking-line', 'parking-line', colors['parking-line'], [.2, 1.8]),
      {
        id: 'trees', type: 'fill-extrusion', source: 'context', filter: hasKind('tree'),
        paint: {
          'fill-extrusion-height': ['get', 'heightMeters'],
          'fill-extrusion-color': ['match', ['get', 'shade'], 0, colors.tree[0], 1, colors.tree[1], colors.tree[2]],
        },
      },
      {
        id: 'building-volumes', type: 'fill-extrusion', source: 'buildings',
        paint: {
          'fill-extrusion-color': [
            'case', ['boolean', ['feature-state', 'selected'], false], colors.selected,
            ['match', ['get', 'kind'], 'destination', colors.destination, 'bridge', colors.bridge, colors.context],
          ],
          'fill-extrusion-height': ['get', 'heightMeters'],
          'fill-extrusion-base': ['case', hasKind('bridge'), 3, 0],
        },
      },
    ],
  };
}
