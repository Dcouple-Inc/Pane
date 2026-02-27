import DOMPurify from 'dompurify';

// Configure DOMPurify for safe HTML output
const config = {
  ALLOWED_TAGS: ['span', 'br', 'p', 'div', 'b', 'i', 'em', 'strong', 'code', 'pre'],
  ALLOWED_ATTR: ['class', 'style'],
  ALLOWED_STYLE_PROPS: ['color', 'background-color', 'font-weight'],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

/**
 * Regular expression to match ANSI escape sequences
 * Matches:
 * - CSI sequences: ESC [ ... (letter or @-~)
 * - OSC sequences: ESC ] ... (BEL or ESC \)
 * - Other escape sequences: ESC (letter)
 * - Also matches standalone control characters like BEL
 */
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /(?:\x1B[@-Z\\-_]|\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[()][AB012]|\x07|\x1B\[[\?]?[0-9;]*[a-zA-Z])/g;

/**
 * Strip ANSI escape sequences from a string
 * This removes terminal control codes like colors, cursor movement, etc.
 * @param text - The string potentially containing ANSI escape sequences
 * @returns The string with all ANSI sequences removed
 */
export function stripAnsi(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }
  return text.replace(ANSI_REGEX, '');
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param dirty - The potentially unsafe HTML string
 * @returns The sanitized HTML string
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, config);
}

/**
 * Sanitize and format git output for safe display
 * @param output - The raw git output
 * @returns The sanitized and formatted output
 */
export function sanitizeGitOutput(output: string): string {
  // First escape any HTML entities in the raw output
  const escaped = output
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  // Then apply any formatting (this is now safe since we've escaped the content)
  return escaped;
}