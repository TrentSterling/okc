import { rngFor } from './random.js';
import { texturePair, tileNoise, fillPixels, dataColor } from './material-textures.js';

function asphalt(seed, parking = false) {
  const random = rngFor(seed, parking ? 'surface/parking' : 'surface/asphalt');
  const broad = tileNoise(random, 5), medium = tileNoise(random, 31);
  const base = parking ? [101, 102, 97] : [86, 89, 90];
  return texturePair(512, 512, (color, data, width, height) => {
    fillPixels(color, data, width, height, (u, v) => {
      const age = broad(u, v), grain = random() - .5;
      // Four metres per tile puts aggregate at centimetre scale. Broad repair
      // rectangles formerly repeated every16m, reading as floating dark tiles
      // across every lane. Restrained seamless wear has no recognisable motif.
      const shade = (age - .5) * 5 + (medium(u, v) - .5) * 3 + grain * 9;
      return [...base.map(value => value + shade), .5 + grain * .08, .94 + grain * .025];
    });
  });
}

function mineral(seed, id, { size = 256, base = [181, 176, 162], joints = 0, roof = false } = {}) {
  const random = rngFor(seed, `surface/${id}`), broad = tileNoise(random, 5), fine = tileNoise(random, 19);
  return texturePair(size, size, (color, data, width, height) => {
    fillPixels(color, data, width, height, (u, v) => {
      const grain = random() - .5;
      const shade = (broad(u, v) - .5) * 12 + (fine(u, v) - .5) * 3 + grain * 5;
      return [...base.map(value => value + shade), .5 + grain * .08, .91 + grain * .035];
    });
    if (!joints) return;
    const cell = width / joints;
    // Broad paving slabs carry small tone differences, not a checkerboard.
    for (let y = 0; y < joints; y++) for (let x = 0; x < joints; x++) {
      color.fillStyle = random() > .5 ? 'rgba(255,248,230,.025)' : 'rgba(46,42,34,.025)';
      color.fillRect(x * cell, y * cell, cell, cell);
    }
    color.strokeStyle = roof ? 'rgba(29,35,36,.14)' : 'rgba(80,75,61,.21)';
    color.lineWidth = roof ? 1 : .7;
    data.strokeStyle = dataColor(.43, .98); data.lineWidth = color.lineWidth;
    for (const context of [color, data]) {
      context.beginPath();
      for (let i = 0; i <= joints; i++) {
        const p = i * cell;
        context.moveTo(p, 0); context.lineTo(p, height);
        if (!roof || i % 2 === 0) { context.moveTo(0, p); context.lineTo(width, p); }
      }
      context.stroke();
    }
  });
}

function earth(seed, lawn) {
  const random = rngFor(seed, lawn ? 'surface/lawn' : 'surface/earth');
  const broad = tileNoise(random, 4), medium = tileNoise(random, 17);
  const base = lawn ? [95, 113, 66] : [123, 129, 108];
  return texturePair(256, 256, (color, data, width, height) => {
    fillPixels(color, data, width, height, (u, v) => {
      const grain = random() - .5, age = broad(u, v) - .5;
      const shade = age * 17 + (medium(u, v) - .5) * 7 + grain * 8;
      return [base[0] + shade, base[1] + shade, base[2] + shade * .65, .5 + grain * .15, .98];
    });
  });
}

function timber(seed) {
  const random = rngFor(seed, 'surface/timber'), broad = tileNoise(random, 8);
  return texturePair(256, 256, (color, data, width, height) => {
    fillPixels(color, data, width, height, (u, v) => {
      const grain = Math.sin(u * Math.PI * 150 + broad(u, v) * 3) * 2.2;
      const shade = (broad(u, v) - .5) * 10 + grain + (random() - .5) * 3;
      return [122 + shade, 91 + shade * .8, 65 + shade * .6, .5 + grain * .016, .83];
    });
  });
}

export function createSurfaceTextures(seed = 42) {
  return {
    asphalt: asphalt(seed), parking: asphalt(seed, true),
    concrete: mineral(seed, 'concrete'),
    // The baked path/paving UVs cover 18/14 metres per repeat. These 12 slabs
    // therefore read as human-scale paving, independently of detail geometry.
    pavement: mineral(seed, 'pavement', { size: 512, base: [177, 175, 160], joints: 12 }),
    roof: mineral(seed, 'roof', { base: [117, 122, 117], joints: 6, roof: true }),
    lawn: earth(seed, true), earth: earth(seed, false), wood: timber(seed),
  };
}
