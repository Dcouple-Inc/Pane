import posthog from 'posthog-js';

const DEFAULT_API_KEY = 'phc_uwOqT2KUa4C9Qx5WbEPwQSN9mUCoSGFg1aY0b670ft5';
const DEFAULT_HOST = 'https://us.i.posthog.com';

let initialized = false;

export interface PostHogConfig {
  enabled: boolean;
  posthogApiKey?: string;
  posthogHost?: string;
}

export function initPostHog(config: PostHogConfig): void {
  if (initialized) return;

  const apiKey = config.posthogApiKey || DEFAULT_API_KEY;
  const host = config.posthogHost || DEFAULT_HOST;

  posthog.init(apiKey, {
    api_host: host,
    // Restrict autocapture to interactive elements only — prevents capturing
    // sensitive text content (code, prompts) from non-interactive UI areas
    autocapture: {
      css_selector_allowlist: [
        'button',
        'a',
        '[role="button"]',
        '[role="tab"]',
        '[role="menuitem"]',
        'input[type="checkbox"]',
        'input[type="radio"]',
        'select',
      ],
    },
    capture_pageview: true,
    persistence: 'localStorage',
    opt_out_capturing_by_default: true,
    loaded: (ph) => {
      if (config.enabled) {
        ph.opt_in_capturing();
      }
    },
  });

  initialized = true;
}

export function optIn(): void {
  posthog.opt_in_capturing();
}

export function optOut(): void {
  posthog.opt_out_capturing();
}

/**
 * Capture an event then opt out after a short delay.
 * PostHog JS buffers events, so calling optOut() immediately after capture()
 * can drop the event. This helper temporarily opts in if needed, captures the
 * event, then opts out after a delay to ensure the event is flushed.
 */
export function captureAndOptOut(eventName: string, properties?: Record<string, unknown>): void {
  // If currently opted out (e.g., first-run decline), temporarily opt in
  // so the event actually gets captured and sent
  const wasOptedOut = posthog.has_opted_out_capturing();
  if (wasOptedOut) {
    posthog.opt_in_capturing();
  }

  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    console.error('[PostHog] Failed to capture event:', error);
  }

  setTimeout(() => {
    posthog.opt_out_capturing();
  }, 500);
}

export function capture(eventName: string, properties?: Record<string, unknown>): void {
  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    console.error('[PostHog] Failed to capture event:', error);
  }
}

export { posthog };
