/**
 * Platform detection utilities.
 * Centralized helpers for detecting OS and getting platform-specific values.
 */

/**
 * Check if the current platform is macOS.
 */
export function isMac(): boolean {
  return navigator.platform.toUpperCase().includes('MAC');
}

/**
 * Check if the current platform is Windows.
 */
export function isWindows(): boolean {
  return navigator.platform.toLowerCase().includes('win');
}

/**
 * Get the modifier key name for the current platform.
 * Returns "Cmd" on macOS, "Ctrl" on other platforms.
 */
export function getModifierKeyName(): string {
  return isMac() ? 'Cmd' : 'Ctrl';
}
