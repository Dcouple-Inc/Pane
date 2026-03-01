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