"""Stable JSON/gzip serialization and content identity for streamed assets."""
import gzip
import hashlib
import io
import json


def write_json(path, value, compressed=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf-8')
    path.write_bytes(data)
    result = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    if compressed:
        buffer = io.BytesIO()
        # Empty filename and fixed time keep headers independent of checkout
        # location, build staging directory, system clock and source mtimes.
        with gzip.GzipFile(fileobj=buffer, filename='', mode='wb', mtime=0, compresslevel=6) as archive:
            archive.write(data)
        packed = buffer.getvalue()
        path.with_name(path.name + '.gz').write_bytes(packed)
        result.update(gzipBytes=len(packed), gzipSha256=hashlib.sha256(packed).hexdigest())
    return result
