export enum MoveDirection {
    FORWARD = "FORWARD",
    BACKWARD = "BACKWARD",
}

export class AlignmentWrapper {
    private readonly alignment: WeakRef<DwgAlignment>;
    public readonly length: number;
    public readonly modelName: string;
    public readonly source: string;

    constructor(alignment: DwgAlignment, private readonly direction: MoveDirection) {
        this.alignment = new WeakRef(alignment);
        this.length = alignment.length;
        this.modelName = alignment.layer?.modelName ?? '';
        this.source = `${alignment.layer?.layer?.name}/${alignment.layer?.name}`;
    }

    tangentAt(target: vec3, station: number): vec3 {
        const alignment = this.alignment.deref();
        if (alignment === undefined) {
            return target;
        }
        if (this.direction === MoveDirection.FORWARD) {
            return alignment.tangentAt(target, station);
        } else {
            alignment.tangentAt(target, this.length - station);
            Math3d.vec3.neg(target);
            return target;
        }
    }

    toWCS(target: vec2, stationOffset: vec2): vec2 {
        const alignment = this.alignment.deref();
        if (alignment === undefined) {
            return target;
        }
        if (this.direction === MoveDirection.FORWARD) {
            return alignment.toWCS(target, stationOffset);
        } else {
            return alignment.toWCS(target, [this.length - stationOffset[0], -stationOffset[1]]);
        }
    }

    fromWCS(target: vec2, point: vec2): vec2 {
        const alignment = this.alignment.deref();
        if (alignment === undefined) {
            return target;
        }
        if (this.direction === MoveDirection.FORWARD) {
            return alignment.fromWCS(target, point);
        } else {
            alignment.fromWCS(target, point);
            target[0] = this.length - target[0];
            target[1] = -target[1];
            return target;
        }
    }

    elevationAt(station: number): number {
        const alignment = this.alignment.deref();
        if (alignment === undefined) {
            return 0.0;
        }
        if (this.direction === MoveDirection.FORWARD) {
            return alignment.elevationAt(station);
        } else {
            return alignment.elevationAt(this.length - station);
        }
    }

    toPK(station: number): string {
        const alignment = this.alignment.deref();
        if (alignment === undefined) {
            return "";
        }
        if (this.direction === MoveDirection.FORWARD) {
            return alignment.toPK(station);
        } else {
            return alignment.toPK(this.length - station);
        }
    }
}