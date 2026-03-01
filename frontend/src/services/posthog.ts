import posthog from 'posthog-js';

const DEFAULT_API_KEY = 'phc_uwOqT2KUa4C9Qx5WbEPwQSN9mUCoSGFg1aY0b670ft5';
const DEFAULT_HOST = 'https://us.i.posthog.com';

let currentApiKey: string | undefined;
let currentHost: string | undefined;

export interface PostHogConfig {
  enabled: boolean;
  posthogApiKey?: string;
  posthogHost?: string;
}

export function initPostHog(config: PostHogConfig): void {
  const apiKey = config.posthogApiKey || DEFAULT_API_KEY;
  const host = config.posthogHost || DEFAULT_HOST;

  // Skip if already initialized with the same key/host
  if (currentApiKey === apiKey && currentHost === host) return;

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

  currentApiKey = apiKey;
  currentHost = host;
}

export function optIn(): void {
  posthog.opt_in_capturing();
}

export function optOut(): void {
  posthog.opt_out_capturing();
}

/**
 * Capture a single event and then opt out of capturing.
 *
 * Sends the event directly via HTTP instead of toggling the SDK's global
 * opt-in state, so no other events (autocapture, pageviews, etc.) can leak
 * during the flush window.
 */
export function captureAndOptOut(eventName: string, properties?: Record<string, unknown>): void {
  const token = posthog.get_property?.('$token') as string | undefined
    || posthog.config?.token
    || DEFAULT_API_KEY;
  const host = posthog.config?.api_host || DEFAULT_HOST;
  const distinctId = posthog.get_distinct_id();

  const payload = {
    api_key: token,
    event: eventName,
    properties: {
      ...properties,
      distinct_id: distinctId,
      token,
      $lib: 'posthog-js',
    },
    timestamp: new Date().toISOString(),
  };

  try {
    fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch((err) => {
      console.error('[PostHog] Failed to send opt-out event:', err);
    });
  } catch (error) {
    console.error('[PostHog] Failed to capture event:', error);
  }

  posthog.opt_out_capturing();
}

export function capture(eventName: string, properties?: Record<string, unknown>): void {
  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    console.error('[PostHog] Failed to capture event:', error);
  }
}

export { posthog };
