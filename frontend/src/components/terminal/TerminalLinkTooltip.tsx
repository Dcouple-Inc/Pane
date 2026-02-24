/**
 * Terminal-specific tooltip for xterm.js link hover.
 *
 * This is a specialized version of ui/Tooltip.tsx for terminal links.
 * We cannot use the standard Tooltip because:
 * 1. xterm.js provides raw MouseEvent coordinates, not React elements to wrap
 * 2. Terminal links are registered via ILinkProvider API, not as React components
 * 3. Position must be calculated from absolute viewport coordinates
 *
 * For standard UI tooltips wrapping React elements, use ui/Tooltip.tsx instead.
 */
import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

export interface TerminalLinkTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  linkText: string;
  hint: string;
}

const GAP = 8;
const MARGIN = 8; // Margin from viewport edges

export const TerminalLinkTooltip: React.FC<TerminalLinkTooltipProps> = ({
  visible,
  x,
  y,
  linkText,
  hint,
}) => {
  const [style, setStyle] = useState<React.CSSProperties>({
    visibility: 'hidden',
    opacity: 0,
  });
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) {
      setStyle({ visibility: 'hidden', opacity: 0 });
      return;
    }

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = y + GAP;
    let left = x;

    // Flip above cursor if too close to bottom
    if (top + rect.height + MARGIN > viewportHeight) {
      top = y - rect.height - GAP;
    }

    // Keep horizontally in viewport
    if (left + rect.width + MARGIN > viewportWidth) {
      left = viewportWidth - rect.width - MARGIN;
    }
    if (left < MARGIN) {
      left = MARGIN;
    }

    setStyle({
      top,
      left,
      visibility: 'visible',
      opacity: 1,
    });
  }, [visible, x, y, linkText, hint]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className={cn(
        'fixed z-[10000] px-3 py-2 text-sm',
        'bg-surface-secondary border border-border-primary rounded-lg shadow-dropdown',
        'pointer-events-none transition-opacity duration-fast'
      )}
      style={style}
      role="tooltip"
    >
      <div className="flex flex-col gap-1">
        <div className="text-text-primary font-medium truncate max-w-md">
          {linkText}
        </div>
        <div className="text-text-tertiary text-xs">
          {hint}
        </div>
      </div>
    </div>,
    document.body
  );
};

TerminalLinkTooltip.displayName = 'TerminalLinkTooltip';
