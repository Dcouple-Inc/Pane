/**
 * General-purpose array utility functions.
 *
 * Provides reusable helpers for common array operations like cycling through
 * indices with wrap-around behavior.
 *
 * @module arrayUtils
 */

/**
 * Computes the next index when cycling through an array with wrap-around.
 *
 * @param currentIndex - The current position (-1 if none selected)
 * @param arrayLength - Total number of items in the array
 * @param direction - 'next' to move forward, 'prev' to move backward
 * @returns The next valid index, or -1 if array is empty
 *
 * @example
 * // Basic forward cycling
 * cycleIndex(0, 3, 'next')  // → 1
 * cycleIndex(2, 3, 'next')  // → 0 (wraps around)
 *
 * @example
 * // Backward cycling
 * cycleIndex(0, 3, 'prev')  // → 2 (wraps around)
 * cycleIndex(2, 3, 'prev')  // → 1
 *
 * @example
 * // No current selection
 * cycleIndex(-1, 3, 'next') // → 0 (starts at beginning)
 * cycleIndex(-1, 3, 'prev') // → 0 (starts at beginning)
 */
export function cycleIndex(
  currentIndex: number,
  arrayLength: number,
  direction: 'next' | 'prev'
): number {
  if (arrayLength === 0) return -1;
  if (currentIndex === -1) return 0;

  return direction === 'next'
    ? (currentIndex + 1) % arrayLength
    : (currentIndex - 1 + arrayLength) % arrayLength;
}
