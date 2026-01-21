const EPS = 1e-3;
const INF = Number.MAX_VALUE;

export class SegmentFrustum implements ViewFrustum {
    public constructor(
        private _a: vec3,
        private _b: vec3,
    ) {}

    public intersectBox(box: box3): boolean {
        return Math3d.box3.containSegment(box, this._a, this._b);
    }

    public intersectSegment(a: vec3, b: vec3): boolean {
        const length = Math3d.vec3.distance(a, b);
        if (length < EPS) {
            return this.containsPoint(a);
        }

        const direction = Math3d.vec3.sub([0, 0, 0], b, a);
        Math3d.vec3.mul(direction, direction, 1 / length);
        const segment = Math3d.ray3.make([0, 0, 0, 0, 0, 0], a, direction);

        const ray: ray3 = [0, 0, 0, 0, 0, 0];
        this.ray(ray);
        const t = Math3d.ray3.closestPointToRay(segment, ray);
        if (0 < t || t > length) {
            return false;
        }

        const p = Math3d.ray3.at([0, 0, 0], segment, t);
        return this.containsPoint(p);
    }

    public containsPoint(point: vec3): boolean {
        const ray: ray3 = [0, 0, 0, 0, 0, 0];
        this.ray(ray);
        const distance = Math3d.ray3.distanceToPoint(ray, point);
        return distance < EPS;
    }

    public box(target: box3): void {
        Math3d.box3.make(target, this._a, this._b);
    }

    public transformed(matrix: mat4): ViewFrustum {
        const a = Math3d.mat4.mulv3([0, 0, 0], matrix, this._a);
        const b = Math3d.mat4.mulv3([0, 0, 0], matrix, this._b);
        return new SegmentFrustum(a, b);
    }

    public tolerance(_obj: sphere3, _viewport: vec2): number {
        return INF;
    }

    public ray(target: ray3): void {
        const direction = Math3d.vec3.sub([0, 0, 0], this._b, this._a);
        const distance = Math3d.vec3.len(direction);
        if (distance < EPS) {
            return;
        }
        Math3d.vec3.mul(direction, direction, 1 / distance);
        Math3d.ray3.make(target, this._a, direction);
    }

    public clipLine(_targetA: vec3, _targetB: vec3, _line: ray3): boolean {
        return false;
    }

    public clipRay(_targetA: vec3, _targetB: vec3, _ray: ray3): boolean {
        return false;
    }

    public clipSegment(_targetA: vec3, _targetB: vec3, _a: vec3, _b: vec3): boolean {
        return false;
    }
}
