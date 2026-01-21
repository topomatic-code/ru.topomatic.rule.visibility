/**
 * Performs a binary search on a sorted array.
 * @param sortedArray The array to search, which must be sorted.
 * @param target The value to find.
 * @param comparator A function that compares two elements. 
 *                   It should return 0 if equal, a negative number if the first is less than the second, 
 *                   and a positive number if the first is greater than the second.
 * @returns The index of the target element if found, otherwise ~lower.
 */
export function binarySearch<T>(
    sortedArray: T[],
    target: T,
    comparator: (a: T, b: T) => number
): number {
    let startIndex = 0;
    let endIndex = sortedArray.length - 1;
    while (startIndex <= endIndex) {
        const midIndex = startIndex + ((endIndex - startIndex) >> 1);
        const midElement = sortedArray[midIndex];
        const comparisonResult = comparator(target, midElement);
        if (comparisonResult === 0) {
            return midIndex;
        } else if (comparisonResult > 0) {
            startIndex = midIndex + 1;
        } else {
            endIndex = midIndex - 1;
        }
    }
    return ~startIndex;
}
