/**
 * Модуль для проверки видимости объектов вдоль трассы.
 * Позволяет выявлять участки, где объект (например, дорожный знак) не виден из-за препятствий.
 * 
 * @packageDocumentation
 */

import { DiagnosticSeverity, DwgType } from 'albatros/enums';
import { SegmentFrustum } from '../utils/frustum';
import { modelIntersectsSegment } from '../utils/intersect';
import { AlignmentWrapper, MoveDirection } from './alignmentWrapper';

/**
 * Перечисление сторон относительно трассы.
 */
enum Side {
    /**
     * Левая сторона трассы.
     */
    LEFT = "LEFT",
    /**
     * Правая сторона трассы.
     */
    RIGHT = "RIGHT",
    /**
     * Обе стороны трассы.
     */
    BOTH = "BOTH",
}

/**
 * Правило проверки видимости объектов.
 * Определяет параметры, при которых объект должен быть виден.
 */
interface ObjectsVisibilityRule {
    /**
     * Фильтр для выбора слоёв трасс.
     * Используется для поиска объектов типа `DwgAlignment`.
     */
    alignmentFilter: string;

    /**
     * Фильтр для выбора слоёв объектов, видимость которых проверяется.
     * Обычно объекты типа `DwgModel3d`, например, дорожные знаки.
     */
    objectFilter: string;

    /**
     * Направление движения вдоль трассы при проверке видимости.
     */
    direction: MoveDirection;

    /**
     * Сторона трассы, для которой производится проверка.
     */
    side: Side;

    /**
     * Смещение точки наблюдения от оси трассы (в метрах).
     */
    viewPointOffset: number;

    /**
     * Высота точки наблюдения над уровнем трассы (в метрах).
     */
    viewPointElevation: number;

    /**
     * Шаг продвижения точки наблюдения вдоль трассы (в метрах).
     */
    viewPointStep: number;

    /**
     * Максимальная дистанция видимости (в метрах).
     * Если объект дальше — он считается невидимым.
     */
    viewDistance: number;
}

/**
 * Диагностика видимости объекта.
 * Расширяет стандартный интерфейс `Diagnostic` контекстными данными.
 */
interface ObjectVisibilityDiagnostic extends Diagnostic {
    /**
     * Контекст приложения.
     */
    ctx: Context;

    /**
     * Обёртка трассы, вдоль которой производится проверка.
     */
    alignment: AlignmentWrapper;

    /**
     * Проверяемый 3D-объект (например, дорожный знак).
     */
    object: WeakRef<DwgModel3d>;

    /**
     * Правило, по которому выполнялась проверка.
     */
    rule: ObjectsVisibilityRule;

    /**
     * Набор препятствующих объектов, мешающих видимости.
     */
    obstacles: WeakSet<DwgModel3d>;

    /**
     * Начало участка, на котором видимость нарушена (в метрах от начала трассы).
     */
    rangeStart: number;

    /**
     * Конец участка, на котором видимость нарушена (в метрах от начала трассы).
     */
    rangeEnd: number;
}

/**
 * Вычисляет центр масс 3D-модели на основе её мешей и вершин.
 * Результат записывается в переданный вектор `target`.
 *
 * @param target - Вектор, в который будет записан центр модели.
 * @param model - 3D-модель, для которой вычисляется центр.
 * @returns `true`, если центр был успешно вычислен; `false`, если модель пуста.
 */
function modelCenter(target: vec3, model: DwgModel3d): boolean {
    let success = false;

    let x = 0;
    let y = 0;
    let z = 0;
    let n = 0;

    const meshes = model.meshes;
    for (const id in meshes) {
        const mesh = meshes[id];
        const geometry = mesh.geometry;
        if (geometry === undefined) {
            continue;
        }
        success = true;

        const { vertices, indices } = geometry;
        for (let i = 0; i < indices.length; ++i) {
            const i3 = indices[i] * 3;
            x += vertices[i3];
            y += vertices[i3 + 1];
            z += vertices[i3 + 2];
            ++n;
        }
    }
    if (n === 0) {
        return false;
    }
    Math3d.vec3.make(target, x / n, y / n, z / n);
    Math3d.mat4.mulv3(target, model.matrix, target);
    return success;
}

/**
 * Коэффициент замедления анимации при активации диагностики.
 * Используется для визуализации проблемных участков.
 */
let slowdown = 1.0;

/**
 * Активирует визуализацию диагностики.
 * При активации запускается анимация движения вдоль трассы с выделением препятствий.
 *
 * @param diagnostic - Диагностика, которую нужно активировать.
 * @param active - Флаг повторной активации сообщения
 */
function activateDiagnostic(diagnostic: Diagnostic, active: boolean) {
    // Управление замедлением: уменьшаем вдвое при активации, но не ниже 0.01; сбрасываем при деактивации
    slowdown = active ? Math.max(slowdown * 0.5, 0.01) : 1.0;

    const visibilityDiagnostic = diagnostic as ObjectVisibilityDiagnostic;
    const { ctx, alignment, object, rule, rangeStart, rangeEnd, obstacles } = visibilityDiagnostic;

    const cadview = ctx.cadview;
    if (!cadview) return;

    const obj = object.deref();
    if (!obj) return;

    const objectCenter: vec3 = [0, 0, 0];
    if (!modelCenter(objectCenter, obj)) return;

    const distance = rangeEnd - rangeStart;
    const speed = 17 * slowdown; // 17 м/с с учётом slowdown
    const duration = Math.max(Math.abs(distance) / speed, 1.0);

    cadview.layer.clearSelected();
    cadview.layer.selectObjects(
        (obj) => obstacles.has(obj) || obj === alignment || obj === object,
        true
    );

    const position: vec3 = [0.0, 0.0, 0.0];
    const direction: vec3 = [0.0, 0.0, 0.0];
    cadview.animate(duration, (t: number) => {
        t = Math.min(t, 1.0);
        const vps = t * distance + rangeStart;
        position[0] = vps;
        position[1] = rule.viewPointOffset;
        alignment.toWCS(position as unknown as vec2, position as unknown as vec2);
        position[2] = alignment.elevationAt(vps) + rule.viewPointElevation;
        Math3d.vec3.sub(direction, objectCenter, position);
        Math3d.vec3.normalize(direction);
        cadview.lookAt(position, direction, undefined, false, objectCenter);
        cadview.invalidate();
    });
}

/**
 * Экспорт правила диагностики проверки видимости объектов.
 * Создаёт правило `rule:visibility:objects`, которое можно использовать в системе диагностики.
 */
export default {
    /**
     * Правило проверки видимости объектов вдоль трассы.
     *
     * @param ctx - Контекст приложения.
     * @returns Объект правила диагностики.
     */
    'rule:visibility:objects': (ctx: Context): DiagnosticRule<ObjectsVisibilityRule> => {
        return {
            /**
             * Создаёт и возвращает стандартные параметры правила.
             *
             * @returns Объект правила по умолчанию.
             */
            async createRule() {
                return {
                    alignmentFilter: '$type_1 = SmdxElement',
                    objectFilter: '$type_3 = SmdxRoadSignItem',
                    direction: MoveDirection.FORWARD,
                    side: Side.BOTH,
                    viewPointOffset: 0,
                    viewPointElevation: 1.2,
                    viewPointStep: 1,
                    viewDistance: 300,
                };
            },

            /**
             * Выполняет проверку видимости объектов согласно заданному правилу.
             *
             * @param app - Приложение, в котором выполняется проверка.
             * @param rule - Правило проверки.
             * @param diagnostics - Коллекция диагностики для добавления результатов.
             * @param _progress - Прогресс выполнения (не используется).
             */
            async execute(app: Application, rule: ObjectsVisibilityRule, diagnostics: DiagnosticCollection, _progress: WorkerProgress) {
                const drawing = app.model as Drawing;
                if (drawing === undefined) {
                    return;
                }
                const cadview = ctx.cadview;
                if (cadview === undefined) {
                    return;
                }
                const drawingLayer = cadview.layer.drawing;
                if (drawingLayer === undefined) {
                    return;
                }

                const modelName = drawing.layers.layer0?.modelName ?? '';
                const messages: Record<string, (Diagnostic | ObjectVisibilityDiagnostic)[]> = {};

                // Получение трасс
                const alignments = drawing.filterEntities(rule.alignmentFilter, obj => obj.type === DwgType.alignment, false).map(align => new AlignmentWrapper(align as DwgAlignment, rule.direction));
                if (alignments.length === 0) {
                    messages[modelName] = [{
                        message: ctx.tr('Не найдены подходящие слои трасс'),
                        severity: DiagnosticSeverity.Warning,
                        tooltip: ctx.tr('Не удалось найти слои трасс, удовлетворяющие заданному фильтру'),
                        ctx,
                    }];
                }
                // Получение объектов
                const objects = drawing.filterEntities(rule.objectFilter, obj => obj.type === DwgType.model3d, false) as DwgModel3d[];
                if (objects.length === 0) {
                    messages[modelName] = [{
                        message: ctx.tr('Не найдены подходящие слои объектов'),
                        severity: DiagnosticSeverity.Warning,
                        tooltip: ctx.tr('Не удалось найти слои объектов, удовлетворяющие заданному фильтру'),
                        ctx,
                    }];
                }

                const inverseMatrices = new WeakMap<DwgModel3d, mat4>;

                const objectCenter: vec3 = [0.0, 0.0, 0.0];
                const stationOffset: vec2 = [0.0, 0.0];
                const viewPoint: vec3 = [0.0, 0.0, 0.0];
                const viewDirection: vec2 = [0.0, 0.0];
                const direction: vec3 = [0.0, 0.0, 0.0];
                const tg: vec3 = [0.0, 0.0, 0.0];

                // Основной цикл: перебор объектов и трасс
                for (const object of objects) {
                    if (!modelCenter(objectCenter, object)) {
                        continue;
                    }
                    for (const alignment of alignments) {
                        alignment.fromWCS(stationOffset, objectCenter as unknown as vec2);
                        const objectOffset = stationOffset[1];
                        const objectStation = stationOffset[0];
                        if ((rule.side === Side.LEFT && objectOffset > 0) || (rule.side === Side.RIGHT && objectOffset < 0)) {
                            continue;
                        }

                        const modelName = alignment.modelName;
                        let collection = messages[modelName];
                        if (collection === undefined) {
                            messages[modelName] = collection = [];
                        }
                        let rangeStart = -1;
                        let rangeEnd = -1;
                        let obstaclesAtRange = new WeakSet<DwgModel3d>();
                        const length = alignment.length;

                        // Проверка вдоль трассы с шагом
                        for (let station = 0; station <= length; station += rule.viewPointStep) {
                            alignment.tangentAt(tg, station);
                            Math3d.vec2.normalize(tg as unknown as vec2);
                            alignment.toWCS(viewPoint as unknown as vec2, [station, rule.viewPointOffset]) as unknown as vec3;
                            viewPoint[2] = alignment.elevationAt(station) + rule.viewPointElevation;

                            Math3d.vec3.sub(direction, objectCenter, viewPoint);
                            const distance = Math3d.vec3.len(direction);
                            let outOfView = distance > rule.viewDistance;

                            // Проверка угла обзора
                            if (!outOfView) {
                                Math3d.vec2.normalize(viewDirection, direction as unknown as vec2);
                                const cos = Math3d.vec2.dot(tg as unknown as vec2, viewDirection);
                                outOfView = cos < 0;
                            }

                            // Проверка направления (по ходу движения)
                            if (!outOfView) {
                                outOfView = objectStation < station;
                            }

                            let obstacles: Generator<DwgModel3d>;
                            let obstacle: IteratorResult<DwgModel3d>;
                            if (!outOfView) {
                                Math3d.vec3.mul(direction, direction, 1.0 / distance);
                                const frustum = new SegmentFrustum(viewPoint, objectCenter);

                                obstacles = drawingLayer.selectableObjects(frustum, (obj) => {
                                    if (obj === object || obj.type !== DwgType.model3d) {
                                        return false;
                                    }

                                    const model = obj as DwgModel3d;
                                    let inverse = inverseMatrices.get(model);
                                    if (inverse === undefined) {
                                        inverse = Math3d.mat4.inverse(Math3d.mat4.alloc(), model.matrix);
                                        inverseMatrices.set(model, inverse);
                                    }

                                    return modelIntersectsSegment(model, inverse, viewPoint, objectCenter);
                                }) as Generator<DwgModel3d>;

                                obstacle = obstacles.next();
                            }

                            // Фиксация нарушений видимости
                            if (outOfView || obstacle!.done) {
                                if (rangeStart >= 0) {
                                    collection.push({
                                        message: ctx.tr('На участке от {0} до {1} видимость объекта не обеспечена', alignment.toPK(rangeStart), alignment.toPK(station)),
                                        severity: DiagnosticSeverity.Error,
                                        source: `${alignment.source}, ${object.layer?.layer?.name}/${object.layer?.name}`,
                                        tooltip: ctx.tr('Препятствия мешают видимости'),
                                        activation: activateDiagnostic,

                                        ctx,
                                        alignment,
                                        object: new WeakRef(object),
                                        rule,
                                        rangeStart,
                                        rangeEnd,
                                        obstacles: obstaclesAtRange,
                                    });
                                    rangeStart = -1;
                                    rangeEnd = -1;
                                    obstaclesAtRange = new WeakSet();
                                }
                            } else {
                                if (rangeStart < 0) {
                                    rangeStart = station;
                                }
                                rangeEnd = station;
                                obstaclesAtRange.add(obstacle!.value);
                                for (const obstacle of obstacles!) {
                                    obstaclesAtRange.add(obstacle);
                                }
                            }
                        }

                        // Завершение последнего участка
                        if (rangeStart >= 0) {
                            collection.push({
                                message: ctx.tr('На участке от {0} до {1} видимость объекта не обеспечена', alignment.toPK(rangeStart), alignment.toPK(alignment.length)),
                                severity: DiagnosticSeverity.Error,
                                source: `${alignment.source}, ${object.layer?.layer?.name}/${object.layer?.name}`,
                                tooltip: ctx.tr('Препятствия мешают видимости'),
                                activation: activateDiagnostic,

                                ctx,
                                alignment,
                                object: new WeakRef(object),
                                rule,
                                rangeStart,
                                rangeEnd,
                                obstacles: obstaclesAtRange,
                            });
                        }
                    }
                }

                // Сохранение результатов диагностики
                for (const uri in messages) {
                    diagnostics.set(uri, messages[uri]);
                }
            }
        };
    },
};
