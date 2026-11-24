import * as THREE from 'three';

export function makeScreenMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Devon crown programmable LED panels',
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uNight: { value: 0 }, uEnabled: { value: 0 } }
    ]),
    vertexShader: `
      varying vec2 vPanel;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vPanel = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uNight;
      uniform float uEnabled;
      varying vec2 vPanel;
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main() {
        if (uEnabled < .5) discard;
        #include <logdepthbuf_fragment>
        vec2 p = vPanel;
        // One continuous architectural lantern. The very slow white balance
        // shift remains legible at skyline scale; no subpixel LED dots or
        // crossed color bands compete with the actual facade geometry.
        float cycle = .5 + .5 * sin(uTime * .025);
        float wash = clamp(.24 + .44 * cycle + .10 * (p.y - .5), 0., 1.);
        vec3 warmWhite = vec3(1.0, .86, .69);
        vec3 coolWhite = vec3(.78, .89, 1.0);
        vec3 color = mix(warmWhite, coolWhite, wash);
        float brightness = mix(.55, 1.35, uNight);
        color *= brightness * (.97 + .03 * smoothstep(0., 1., p.y));
        // Analytic coverage softens the triangle's silhouette without
        // introducing discontinuities inside the illuminated face.
        float edge = min(min(p.x - .5 + .5 * p.y, .5 + .5 * p.y - p.x), 1. - p.y);
        float coverage = smoothstep(0., max(fwidth(edge) * 1.15, .0005), edge);
        gl_FragColor = vec4(color, .96 * coverage);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: true,
    toneMapped: true,
    side: THREE.DoubleSide
  });
}

export function triangleScreen(apex,topA,topB,material) {
  const normal=new THREE.Vector3().crossVectors(topA.clone().sub(apex),topB.clone().sub(apex)).normalize();
  if(normal.x*apex.x+normal.z*apex.z<0)normal.negate();
  const p=[apex,topA,topB].map(v=>v.clone().addScaledVector(normal,.08));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.flatMap(v=>v.toArray()),3));g.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,0,1,1,1],2));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,material);mesh.name='Independent triangular crown display surface';mesh.userData.glassNormalOffset=.08;mesh.renderOrder=2;return mesh;
}
