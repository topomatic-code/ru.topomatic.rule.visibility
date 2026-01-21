import properties from './properties';
import alignmentVisibility from './rules/alignment';
import objectsVisibility from './rules/objects';

export default {
    ...properties,
    ...alignmentVisibility,
    ...objectsVisibility,
}
