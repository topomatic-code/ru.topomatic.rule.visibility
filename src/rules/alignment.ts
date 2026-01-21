/**
 * Модуль для проверки видимости вдоль трассы с учетом препятствий.
 *
 * Реализует диагностическое правило, которое анализирует, на каких участках трассы
 * обеспечивается или нарушается видимость между контрольными точками с учетом 3D-препятствий.
 *
 * @packageDocumentation
 */

import { DiagnosticSeverity, DwgType } from 'albatros/enums';
import { binarySearch } from '../utils/binarySearch';
import { SegmentFrustum } from '../utils/frustum';
import { modelIntersectsSegment } from '../utils/intersect';
import { AlignmentWrapper, MoveDirection } from './alignmentWrapper';

/**
 * Правило для проверки видимости вдоль трассы.
 *
 * Определяет параметры, по которым выполняется анализ видимости:
 * - фильтры для слоев трасс и препятствий;
 * - смещения и высоты точек обзора и наблюдаемого объекта;
 * - направление движения;
 * - дистанция и шаги просчета.
 */
interface AlignmentVisibilityRule {
    /**
     * Фильтр для выбора слоев, содержащих трассы.
     * Используется для поиска объектов трасс в чертеже.
     */
    alignmentFilter: string;

    /**
     * Фильтр для выбора слоев, содержащих препятствия.
     * Определяет, какие 3D-объекты считаются препятствиями для видимости.
     */
    obstacleFilter: string;

    /**
     * Горизонтальное смещение точки наблюдения от оси трассы (в метрах).
     */
    viewPointOffset: number;

    /**
     * Высота точки наблюдения над уровнем трассы (в метрах).
     */
    viewPointElevation: number;

    /**
     * Горизонтальное смещение наблюдаемого объекта от оси трассы (в метрах).
     */
    objectOffset: number;

    /**
     * Высота наблюдаемого объекта над уровнем трассы (в метрах).
     */
    objectElevation: number;

    /**
     * Направление движения вдоль трассы.
     */
    direction: MoveDirection;

    /**
     * Максимальная дистанция видимости (в метрах).
     * Если расстояние между точками превышает это значение, видимость не проверяется.
     */
    viewDistance: number;

    /**
     * Шаг просчета положения точки наблюдения (в метрах).
     */
    viewPointStep: number;

    /**
     * Шаг просчета положения наблюдаемого объекта (в метрах).
     */
    objectStep: number;
}

/**
 * Ключевой кадр анимации видимости.
 * 
 * Представляет пару: [положение точки наблюдения, положение объекта]
 */
type AlignmentVisibilityDiagnosticKeyFrame = [number, number];

/**
 * Диагностика видимости вдоль трассы.
 * 
 * Расширяет базовый интерфейс Diagnostic, добавляя контекст и данные для визуализации.
 */
interface AlignmentVisibilityDiagnostic extends Diagnostic {
    /**
     * Контекст приложения.
     */
    ctx: Context;

    /**
     * Обёртка вокруг объекта трассы, предоставляющая удобные методы доступа.
     */
    alignment: AlignmentWrapper;

    /**
     * Правило, по которому была сгенерирована данная диагностика.
     */
    rule: AlignmentVisibilityRule;

    /**
     * Множество препятствий, обнаруженных на проблемном участке.
     */
    obstacles: WeakSet<DwgModel3d>;

    /**
     * Последовательность ключевых кадров для анимации просмотра.
     */
    keyFrames: AlignmentVisibilityDiagnosticKeyFrame[];
}

/**
 * Коэффициент замедления анимации при активации диагностики.
 * 
 * Уменьшается при активации, чтобы сделать анимацию медленнее, и сбрасывается при деактивации.
 */
let slowdown = 1.0;

/**
 * Активирует анимацию диагностики видимости.
 * 
 * При активации запускается анимация движения вдоль трассы с показом проблемных участков.
 * При повторной активации сбрасывается замедление анимации.
 * 
 * @param diagnostic - Диагностика, которую нужно активировать/деактивировать.
 * @param active - Флаг повторной активации сообщения
 */
function activateDiagnostic(diagnostic: Diagnostic, active: boolean) {
    // Обновление slowdown: уменьшаем вдвое при активации, но не ниже порога
    slowdown = active ? Math.max(slowdown * 0.5, 0.01) : 1.0;

    const visibilityDiagnostic = diagnostic as AlignmentVisibilityDiagnostic;
    const { cadview } = visibilityDiagnostic.ctx;
    if (!cadview) return;

    const alignment = visibilityDiagnostic.alignment;

    const { rule, keyFrames } = visibilityDiagnostic;
    const obstacles = visibilityDiagnostic.obstacles;

    // Параметры анимации
    const speed = 17 * slowdown; // Скорость 17 м/с с учётом замедления
    const startStation = keyFrames[0][0];
    const totalLength = keyFrames[keyFrames.length - 1][0] - startStation;
    const duration = Math.abs(totalLength) / speed;

    // Выделение объектов: сама ось и препятствия
    cadview.layer.clearSelected();
    cadview.layer.selectObjects((obj) => obstacles.has(obj) || obj === alignment, true);


    const position: vec3 = [0.0, 0.0, 0.0];
    const pivot: vec3 = [0.0, 0.0, 0.0];
    const direction: vec3 = [0.0, 0.0, 0.0];

    // Запуск анимации
    cadview.animate(duration, (t: number) => {
        t = Math.min(t, 1.0); // Ограничение значения t значением 1.0

        const station = t * totalLength + startStation;

        // Бинарный поиск нужного ключевого кадра
        let index = binarySearch(keyFrames, [station, 0.0], (a, b) => a[0] - b[0]);
        if (index < 0) index = ~index;
        if (index >= keyFrames.length) index = keyFrames.length - 1;

        // Определение позиции объекта (objectStation)
        const objectStation = index > 0 ? keyFrames[index - 1][1] : keyFrames[0][1];

        position[0] = station;
        position[1] = rule.viewPointOffset;
        alignment.toWCS(position as unknown as vec2, position as unknown as vec2);
        position[2] = alignment.elevationAt(station) + rule.viewPointElevation;

        pivot[0] = objectStation;
        pivot[1] = rule.objectOffset,
        alignment.toWCS(pivot as unknown as vec2, pivot as unknown as vec2);
        pivot[2] = alignment.elevationAt(objectStation) + rule.objectElevation;

        Math3d.vec3.sub(direction, pivot, position);
        Math3d.vec3.normalize(direction, direction);

        cadview.lookAt(position, direction, undefined, false, pivot);
        cadview.invalidate();
    });
}

/**
 * Экспортирует правило диагностики видимости вдоль трассы.
 * 
 * Создаёт и возвращает объект правила с методами `createRule` и `execute`.
 * Правило используется в системе диагностики приложения.
 */
export default {
    /**
     * Создаёт правило диагностики видимости.
     * 
     * @param ctx - Контекст выполнения правила.
     * @returns Объект правила диагностики.
     */
    'rule:visibility:alignment': (ctx: Context): DiagnosticRule<AlignmentVisibilityRule> => {
        return {
            /**
             * Асинхронно создаёт и возвращает начальные параметры правила.
             * 
             * @returns Объект с параметрами правила по умолчанию.
             */
            async createRule() {
                return {
                    alignmentFilter: '$type_1 = SmdxElement',
                    obstacleFilter: '$type_1 = SmdxElement',
                    viewPointOffset: 0,
                    viewPointElevation: 1.2,
                    objectOffset: 0,
                    objectElevation: 0.2,
                    direction: MoveDirection.FORWARD,
                    viewDistance: 300,
                    viewPointStep: 1,
                    objectStep: 1,
                };
            },

            /**
             * Выполняет логику диагностики: анализирует видимость вдоль трассы.
             * 
             * Проходит по трассе с заданным шагом, проверяя, виден ли объект на расстоянии.
             * Если встречается препятствие, фиксируется ошибка.
             * 
             * @param app - Экземпляр приложения.
             * @param rule - Параметры правила.
             * @param diagnostics - Коллекция для сохранения результатов диагностики.
             * @param progress - Объект для отслеживания прогресса выполнения.
             */
            async execute(app: Application, rule: AlignmentVisibilityRule, diagnostics: DiagnosticCollection, progress: WorkerProgress) {
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
                const messages: Record<string, (Diagnostic | AlignmentVisibilityDiagnostic)[]> = {};

                // Получение трасс
                const alignments = drawing.filterEntities(rule.alignmentFilter, obj => obj.type === DwgType.alignment, false).map(align => new AlignmentWrapper(align as DwgAlignment, rule.direction));
                // Получение слоёв препятствий
                const obstacleLayers = drawing.filterLayers(rule.obstacleFilter, false);
                if (obstacleLayers.size === 0) {
                    messages[modelName] = [{
                        message: ctx.tr('Не найдены подходящие объекты препятствий'),
                        severity: DiagnosticSeverity.Warning,
                        tooltip: ctx.tr('Не удалось найти слои препятствий, удовлетворяющие заданному фильтру'),
                        ctx,
                    }];
                }

                const inverseMatrices = new WeakMap<DwgModel3d, mat4>;

                progress.indeterminate = false;
                let t0 = Date.now();

                const viewPoint: vec3 = [0.0, 0.0, 0.0];
                const objectPoint: vec3 = [0.0, 0.0, 0.0];
                const direction: vec3 = [0.0, 0.0, 0.0];

                // Перебор всех трасс
                for (const alignment of alignments) {
                    const modelName = alignment.modelName;
                    let collection = messages[modelName];
                    if (collection === undefined) {
                        messages[modelName] = collection = [];
                    }
                    const length = alignment.length;
                    let rangeStart = -1;
                    let rangeKeyFrames = new Array<AlignmentVisibilityDiagnosticKeyFrame>();
                    let obstaclesAtStation = new WeakSet<DwgModel3d>();

                    // Проход по пикетам трассы
                    for (let station = 0; station <= length; station += rule.viewPointStep) {
                        if (Date.now() - t0 > 1000) {
                            t0 = Date.now();
                            const percents = station / length * 100;
                            progress.label = percents.toFixed(2);
                            progress.percents = percents;
                            progress.details = ctx.tr('Расчет видимости на пикете {0}', alignment.toPK(station));
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 0);
                            });
                        }

                        alignment.toWCS(viewPoint as unknown as vec2, [station, rule.viewPointOffset]) as unknown as vec3;
                        viewPoint[2] = alignment.elevationAt(station) + rule.viewPointElevation;
                        let objectStation: number;
                        let hasObstacles = false;

                        // Поиск препятствий на пути к объекту
                        for (objectStation = station + rule.objectStep; objectStation <= length; objectStation += rule.objectStep) {
                            alignment.toWCS(objectPoint as unknown as vec2, [objectStation, rule.objectOffset]) as unknown as vec3;
                            objectPoint[2] = alignment.elevationAt(objectStation) + rule.objectElevation;

                            Math3d.vec3.sub(direction, objectPoint, viewPoint);
                            const distance = Math3d.vec3.len(direction);
                            if (distance > rule.viewDistance) {
                                break;
                            }
                            Math3d.vec3.mul(direction, direction, 1.0 / distance);
                            const frustum = new SegmentFrustum(viewPoint, objectPoint);

                            // Поиск 3D-объектов, пересекающих сегмент
                            const obstacles = drawingLayer.selectableObjects(frustum, (obj) => {
                                if (obj.type !== DwgType.model3d || !obstacleLayers.has(obj.layer)) {
                                    return false;
                                }

                                const model = obj as DwgModel3d;
                                let inverse = inverseMatrices.get(model);
                                if (inverse === undefined) {
                                    inverse = Math3d.mat4.inverse(Math3d.mat4.alloc(), model.matrix);
                                    inverseMatrices.set(model, inverse);
                                }

                                return modelIntersectsSegment(model, inverse, viewPoint, objectPoint);
                            }) as Generator<DwgModel3d>;

                            const obstacle = obstacles.next();
                            if (!obstacle.done) {
                                hasObstacles = true;
                                obstaclesAtStation.add(obstacle.value);
                                for (const obstacle of obstacles) {
                                    obstaclesAtStation.add(obstacle);
                                }
                                break;
                            }
                        }

                        // Формирование диагностических сообщений
                        if (!hasObstacles) {
                            if (rangeStart >= 0) {
                                collection.push({
                                    message: ctx.tr('На участке от {0} до {1} видимость не обеспечена', alignment.toPK(rangeStart), alignment.toPK(station)),
                                    severity: DiagnosticSeverity.Error,
                                    source: alignment.source,
                                    tooltip: ctx.tr('Препятствия мешают видимости'),
                                    activation: activateDiagnostic,
                                    ctx,
                                    alignment,
                                    rule,
                                    keyFrames: rangeKeyFrames,
                                    obstacles: obstaclesAtStation,
                                });
                                rangeStart = -1;
                                rangeKeyFrames = new Array<AlignmentVisibilityDiagnosticKeyFrame>();
                                obstaclesAtStation = new WeakSet<DwgModel3d>();
                            }
                        } else {
                            if (rangeStart < 0) {
                                rangeStart = station;
                            }
                            if ((rangeKeyFrames.length > 1) && (Math.abs(rangeKeyFrames[rangeKeyFrames.length - 1][1] - rangeKeyFrames[rangeKeyFrames.length - 2][1]) < 0.01)) {
                                rangeKeyFrames[rangeKeyFrames.length - 1][0] = station;
                                rangeKeyFrames[rangeKeyFrames.length - 1][1] = objectStation;
                            } else {
                                rangeKeyFrames.push([station, objectStation]);
                            }
                        }
                    }

                    // Завершение последнего диапазона
                    if (rangeStart >= 0) {
                        collection.push({
                            message: ctx.tr('На участке от {0} до {1} видимость не обеспечена', alignment.toPK(rangeStart), alignment.toPK(length)),
                            severity: DiagnosticSeverity.Error,
                            source: alignment.source,
                            tooltip: ctx.tr('Препятствия мешают видимости'),
                            activation: activateDiagnostic,
                            ctx,
                            alignment,
                            rule,
                            keyFrames: rangeKeyFrames,
                            obstacles: obstaclesAtStation,
                        });
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
