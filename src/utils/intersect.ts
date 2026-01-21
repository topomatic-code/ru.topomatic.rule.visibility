const _v1: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v2: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v3: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v4: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v5: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v6: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v7: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v8: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v9: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v10: vec3 /*@__PURE__*/ = [0, 0, 0];
const _v11: vec3 /*@__PURE__*/ = [0, 0, 0];

const EPS = 1e-3;
const EPS2 = 1e-7;

function segmentIntersectsTriangle(sa: vec3, sb: vec3, ta: vec3, tb: vec3, tc: vec3): boolean {
    const mdx = sa[0] - sb[0];
    const mdy = sa[1] - sb[1];
    const mdz = sa[2] - sb[2];

    const l2 = mdx * mdx + mdy * mdy + mdz * mdz;
    if (l2 < EPS2) { // TODO: use point in triangle
        return false;
    }
    const l = Math.sqrt(l2);

    _v1[0] = mdx / l;
    _v1[1] = mdy / l;
    _v1[2] = mdz / l;

    Math3d.vec3.sub(_v2, tb, ta);
    Math3d.vec3.sub(_v3, tc, ta);
    Math3d.vec3.cross(_v4, _v2, _v3);
    const idet = Math3d.vec3.dot(_v1, _v4);
    if (idet < EPS) {
        return false;
    }

    const det = 1 / Math3d.vec3.dot(_v1, _v4);
    _v5[0] = sa[0] - ta[0];
    _v5[1] = sa[1] - ta[1];
    _v5[2] = sa[2] - ta[2];

    const t = det * Math3d.vec3.dot(_v5, _v4);
    if (t < -EPS || t > l + EPS) {
        return false;
    }

    const u = det * Math3d.vec3.dot(_v5, Math3d.vec3.cross(_v6, _v3, _v1));
    if (u < -EPS || u > 1 + EPS) {
        return false;
    }

    const v = det * Math3d.vec3.dot(_v5, Math3d.vec3.cross(_v6, _v1, _v2));
    if (v < -EPS || v > 1 + EPS || u + v > 1 + EPS) {
        return false;
    }

    return true;
}

export function modelIntersectsSegment(model: DwgModel3d, inverse: mat4, a: vec3, b: vec3): boolean {
    Math3d.mat4.mulv3(_v7, inverse, a);
    Math3d.mat4.mulv3(_v8, inverse, b);
    const meshes = model.meshes;
    for (const id in meshes) {
        const mesh = meshes[id];

        const geometry = mesh.geometry;
        if (geometry === undefined) {
            continue;
        }

        const spatial = geometry.spatial;
        if (spatial === undefined) {
            continue;
        }

        const vertices = geometry.vertices;
        const indices = geometry.indices;

        let intersects = false;

        spatial.walkSegment(_v7, _v8, (triangle) => {
            if (intersects) {
                return;
            }

            const t3 = triangle * 3;

            const ai3 = indices[t3] * 3;
            _v9[0] = vertices[ai3];
            _v9[1] = vertices[ai3 + 1];
            _v9[2] = vertices[ai3 + 2];

            const bi3 = indices[t3 + 1] * 3;
            _v10[0] = vertices[bi3];
            _v10[1] = vertices[bi3 + 1];
            _v10[2] = vertices[bi3 + 2];

            const ci3 = indices[t3 + 2] * 3;
            _v11[0] = vertices[ci3];
            _v11[1] = vertices[ci3 + 1];
            _v11[2] = vertices[ci3 + 2];

            intersects = segmentIntersectsTriangle(_v7, _v8, _v9, _v10, _v11);
        });

        if (intersects) {
            return true;
        }
    }

    return false;
}
