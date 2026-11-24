// Metric source anchors for the one nonrepeating facade in this pass. The
// building outline and total height belong to the saved geographic source.
// Equal office-floor spacing between lobby and crown is a reconstruction,
// not surveyed floor elevations. See geo/skyline-facade-sources.json.
export const BOK_FACADE = Object.freeze({
  osm: 752099946,
  material: 'building.bok',
  height: 132,
  occupiedFloors: 27,
  lobbyHeight: 10.668,
  crownHeight: 12.192,
  width: 14.4,
  columns: 12,
});

export function skylineFacadeProfile(building) {
  return building && (building.osm === BOK_FACADE.osm || building.id === BOK_FACADE.osm)
    ? BOK_FACADE : null;
}

export function facadeFloorBands(style) {
  if (style !== 'bok') return Array.from({ length: 14 }, (_, i) => ({ bottom: i * 3.5, top: (i + 1) * 3.5, occupied: true }));
  const roof = BOK_FACADE.height - BOK_FACADE.crownHeight;
  const pitch = (roof - BOK_FACADE.lobbyHeight) / (BOK_FACADE.occupiedFloors - 1);
  return [
    { bottom: 0, top: BOK_FACADE.lobbyHeight, occupied: true, lobby: true },
    ...Array.from({ length: BOK_FACADE.occupiedFloors - 1 }, (_, i) => ({
      bottom: BOK_FACADE.lobbyHeight + i * pitch,
      top: BOK_FACADE.lobbyHeight + (i + 1) * pitch,
      occupied: true,
    })),
    { bottom: roof, top: BOK_FACADE.height, occupied: false, crown: true },
  ];
}
