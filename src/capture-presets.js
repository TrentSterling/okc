// Reproducible views of the live scene. Coordinates follow app.js: +X east,
// +Z south. The same presets drive both the captured PNGs and gallery links.
const BASE_STATE = {
  progress: .63, style: 0, roughness: .055, exposure: 1.05,
  route: .392, direction: 1, lane: -1.75, speed: 0,
  driving: false, cruise: false, sunPlaying: false, camera: 'chase',
  screen: false, legends: false, traffic: false, sound: false,
  quality: 'high', neutral: false
};
const BASE_VIEW = {
  lookYaw: 0, lookPitch: 0,
  orbitYaw: 2.25, orbitPitch: .19, orbitDistance: 650
};
function shot(id, title, description, category, time, state = {}, view = {}) {
  const settings = { ...BASE_STATE, ...state };
  return {
    id, title, description, category, time,
    camera: settings.camera[0].toUpperCase() + settings.camera.slice(1),
    screen: settings.screen,
    style: settings.style === 1 ? 'Illustrated' : 'Physical',
    state: settings,
    view: { ...BASE_VIEW, ...view },
    simTime: 18
  };
}

export const ARCHIVED_SHOT_PRESETS = [
  shot(
    'approach-golden', 'The western approach',
    'Golden light from the same road position used throughout this four-frame time study.',
    'Time study', 'Golden hour',
    { progress: .18, exposure: 1.02 }
  ),
  shot(
    'approach-afterglow', 'Afterglow on the glass',
    'The starting view: the sky is held still and the crown screen is off.',
    'Time study', 'Afterglow'
  ),
  shot(
    'approach-blue', 'The last blue light',
    'The same camera and road position after the warm western sky has faded.',
    'Time study', 'Blue hour',
    { progress: .81, exposure: 1.22 }
  ),
  shot(
    'approach-night', 'Night on the highway',
    'The same framing at night. The crown display is switched on for this frame.',
    'Time study', 'Night',
    { progress: .97, exposure: 1.4, screen: true }
  ),
  shot(
    'orbit-southwest', 'Southwest face',
    'An elevated southwest view of the broad western glazing and its adjoining facet.',
    'Angles', 'Afterglow',
    { camera: 'orbit' },
    { orbitYaw: 2.4, orbitPitch: .10, orbitDistance: 560 }
  ),
  shot(
    'orbit-northwest', 'Northwest face',
    'The opposite western corner under exactly the same afterglow environment.',
    'Angles', 'Afterglow',
    { camera: 'orbit' },
    { orbitYaw: 3.95, orbitPitch: .10, orbitDistance: 560 }
  ),
  shot(
    'orbit-southeast', 'Southeast face',
    'The eastern faces sample a different part of the sky while the sunset stays fixed.',
    'Angles', 'Afterglow',
    { camera: 'orbit' },
    { orbitYaw: .34, orbitPitch: .10, orbitDistance: 560 }
  ),
  shot(
    'orbit-northeast', 'Northeast face',
    'A matching view from the northeastern corner, with the screen still disabled.',
    'Angles', 'Afterglow',
    { camera: 'orbit' },
    { orbitYaw: 5.94, orbitPitch: .10, orbitDistance: 560 }
  ),
  shot(
    'driver-eastbound', 'Eastbound through the windshield',
    'A driver-height approach toward downtown, with a slight glance toward Devon.',
    'Driver views', 'Afterglow',
    { camera: 'driver', route: .43 },
    { lookYaw: .18, lookPitch: .025 }
  ),
  shot(
    'driver-westbound', 'Westbound into the sun',
    'The return direction in golden light, looking past the dashboard toward the western sky.',
    'Driver views', 'Golden hour',
    { camera: 'driver', route: .70, direction: -1, progress: .18, exposure: 1.02 },
    { lookYaw: -.16, lookPitch: .025 }
  ),
  shot(
    'crown-night', 'The crown after dark',
    'A closer full-height view of Devon with the independent animated crown panels enabled.',
    'Angles', 'Night',
    { camera: 'orbit', progress: .97, exposure: 1.4, screen: true },
    { orbitYaw: 2.4, orbitPitch: .10, orbitDistance: 420 }
  ),
  shot(
    'legends-blue', 'A proposed future skyline',
    'Devon beside the conceptual Legends Tower massing. The taller tower is a proposal, not the current skyline.',
    'Proposed skyline', 'Blue hour',
    { camera: 'orbit', progress: .81, exposure: 1.22, legends: true },
    { orbitYaw: 2.25, orbitPitch: .19, orbitDistance: 700 }
  ),
  shot(
    'material-neutral', 'Neutral-light reference',
    'The same approach as the afterglow frame with a neutral environment, direct sun off, and no crown display.',
    'Material studies', 'Neutral',
    { neutral: true }
  ),
  shot(
    'material-illustrated', 'Illustrated reflection',
    'The same approach and sky as the physical afterglow frame, with the illustrated material treatment at full strength.',
    'Material studies', 'Afterglow',
    { style: 1 }
  )
];



// Fixed, geographically anchored views. Focal length is authored rather than
// claimed to be solved from a reference photograph. Negative orbit pitch is
// intentional: several studies are at pedestrian / driver eye height.
function framed(position, target, fov = 44) {
  const dx = position[0] - target[0], dz = position[2] - target[2];
  const radius = Math.hypot(dx, dz);
  return {
    orbitFocus: target, orbitYaw: Math.atan2(dz, dx),
    orbitPitch: Math.asin((position[1] - target[1]) / radius),
    orbitDistance: radius, fov
  };
}
const reno = framed([-650, 2.1, 300], [25, 105, -35], 43);
export const SHOT_PRESETS = [
  shot('v02-opening-view', 'The rebuilt opening view',
    'The default chase camera on mapped Reno Avenue, with Devon and the real downtown arrangement at dusk.',
    'Reconstruction pass', 'Afterglow', { camera: 'chase', progress: .63, exposure: 1.08 }),
  shot('v02-reno-daylight', 'Reno Avenue in daylight',
    'Street-height view from the mapped western approach. Daylight exposes the building shapes, street placement, and facade detail.',
    'Reconstruction pass', 'Daylight', { camera: 'orbit', progress: 0, exposure: .95 }, reno),
  shot('v02-reno-afterglow', 'Reno Avenue afterglow',
    'The same street-height camera at dusk, with the crown display off. Devon reflects the sky and nearby city.',
    'Reconstruction pass', 'Afterglow', { camera: 'orbit', progress: .63, exposure: 1.08 }, reno),
  shot('v02-reno-blue', 'Reno Avenue at blue hour',
    'A fixed-camera comparison as the city lights become visible and the western sky fades.',
    'Reconstruction pass', 'Blue hour', { camera: 'orbit', progress: .81, exposure: 1.15 }, reno),
  shot('v02-reno-night', 'Reno Avenue at night',
    'The same mapped approach after dark, with the separate crown display enabled.',
    'Reconstruction pass', 'Night', { camera: 'orbit', progress: .97, exposure: 1.35, screen: true }, reno),
  shot('v02-devon-daylight', 'Devon from the gardens',
    'A daylight study of the rebuilt tower, crown, curtain wall, and connected podium from the south.',
    'Reconstruction pass', 'Daylight', { camera: 'orbit', progress: 0, exposure: .95 }, framed([-138.8318, 2.1, 251.0086], [0, 126, 0], 57)),
  shot('v02-campus-orbit', 'Devon and the surrounding blocks',
    'An elevated southwest view showing the campus and surrounding buildings on mapped footprints.',
    'Reconstruction pass', 'Golden hour', { camera: 'orbit', progress: .18, exposure: 1 }, framed([-340, 155, 390], [25, 104, -55], 47)),
  shot('v02-western-skyline', 'The western skyline',
    'A longer view of the compact downtown skyline. Footprints and placement come from map data; unrecorded building heights remain estimates.',
    'Reconstruction pass', 'Golden hour', { camera: 'orbit', progress: .18, exposure: 1 }, framed([-1250, 8, 450], [100, 100, -170], 28)),
  shot('v02-crown-afterglow', 'The rebuilt crown',
    'A closer view of the chamfered crown, recessed corners, and silver facade framing. The display is off.',
    'Reconstruction pass', 'Afterglow', { camera: 'orbit', progress: .63, exposure: 1.08 }, framed([-170, 205, 195], [0, 205, 0], 32)),
  shot('v02-driver-eastbound', 'Eastbound along Reno',
    'The driver view on the mapped at-grade corridor, with two through lanes in each direction and a glance toward Devon.',
    'Reconstruction pass', 'Golden hour', { camera: 'driver', route: .392, progress: .18, exposure: 1 }, { lookYaw: .35, lookPitch: .10, fov: 56 })
];
export const SHOT_BY_ID = new Map([...ARCHIVED_SHOT_PRESETS, ...SHOT_PRESETS].map(preset => [preset.id, preset]));
