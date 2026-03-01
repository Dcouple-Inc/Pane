import { formatDistanceToNow as formatDistance } from './timestampUtils';

export function formatDistanceToNow(date: Date): string {
  // Use the timestamp utility but remove the "ago" suffix for backward compatibility
  const result = formatDistance(date);
  return result.replace(' ago', '');
}