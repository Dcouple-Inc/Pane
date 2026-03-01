// Performance utilities for Pane

/**
 * Checks if the document is visible (not minimized or in background tab)
 */
export const isDocumentVisible = () => {
  return document.visibilityState === 'visible';
};

/**
 * Creates a throttled version of a function that only executes at most once per interval
 */
export const throttle = <T extends (...args: never[]) => unknown>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      func(...args);
    } else {
      // Schedule a call for the remaining time
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func(...args);
      }, delay - timeSinceLastCall);
    }
  };
};

/**
 * Reduces animation frame rate when document is not visible
 */
export const createVisibilityAwareInterval = (
  callback: () => void,
  activeInterval: number,
  inactiveInterval?: number
): (() => void) => {
  let intervalId: NodeJS.Timeout | null = null;

  const updateInterval = () => {
    if (intervalId) {
      clearInterval(intervalId);
    }

    const interval = isDocumentVisible() ? activeInterval : (inactiveInterval || activeInterval * 10);
    intervalId = setInterval(callback, interval);
  };

  // Initial setup
  updateInterval();

  // Listen for visibility changes
  const handleVisibilityChange = () => updateInterval();
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Return cleanup function
  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};