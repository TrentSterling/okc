// Packed geometry shares one transferred buffer. Views keep every canonical byte
// without a second full-city allocation; legacy base64 still supports audits.
export function typedData(value, Type) {
  if (value instanceof Type) return value;
  if (ArrayBuffer.isView(value)) return new Type(value.buffer, value.byteOffset, value.byteLength / Type.BYTES_PER_ELEMENT);
  if (value instanceof ArrayBuffer) return new Type(value);
  if (typeof value !== 'string') throw new TypeError('Expected packed or base64 city geometry.');
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Type(bytes.buffer);
}

function view(buffer, range, Type) {
  const [offset, length] = range || [];
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 ||
      offset + length > buffer.byteLength || offset % Type.BYTES_PER_ELEMENT || length % Type.BYTES_PER_ELEMENT) {
    throw new Error('Invalid packed city geometry range.');
  }
  return new Type(buffer, offset, length / Type.BYTES_PER_ELEMENT);
}

export function unpackWorld(layout, buffer) {
  return {...layout,
    chunks: layout.chunks.map(({vRange, iRange, ...chunk}) => ({...chunk,
      v: view(buffer, vRange, Float32Array),
      i: view(buffer, iRange, chunk.indexType === 32 ? Uint32Array : Uint16Array)})),
    instances: layout.instances.map(({mRange, ...chunk}) => ({...chunk, m: view(buffer, mRange, Float32Array)})),
  };
}

// Run by the offline packer. Matches BufferGeometry's box and bounding sphere
// over interleaved Float32 positions, avoiding another browser vertex scan.
export function vertexBounds(vertices, stride = 8) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += stride) for (let axis = 0; axis < 3; axis++) {
    const value = vertices[i + axis];
    if (!Number.isFinite(value)) throw new Error('Non-finite packed city vertex.');
    min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
  }
  const center = min.map((value, axis) => (value + max[axis]) * .5);
  let radiusSquared = 0;
  for (let i = 0; i < vertices.length; i += stride) {
    const x = vertices[i] - center[0], y = vertices[i + 1] - center[1], z = vertices[i + 2] - center[2];
    radiusSquared = Math.max(radiusSquared, x * x + y * y + z * z);
  }
  return {min, max, center, radius: Math.sqrt(radiusSquared)};
}
