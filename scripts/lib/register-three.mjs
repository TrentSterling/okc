import {register} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export function registerThree(root) {
  register(new URL('./three-loader.mjs', import.meta.url), {
    data: {threeURL: pathToFileURL(path.join(root, 'dist/vendor/three.module.js')).href},
  });
}
