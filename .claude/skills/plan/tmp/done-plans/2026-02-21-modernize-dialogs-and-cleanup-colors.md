# Plan: Modernize Dialogs & Clean Up Color Tokens

## Goal

Modernize the remaining dated dialogs (ConfirmDialog, RunScriptConfigDialog, AnalyticsConsentDialog, Welcome) to match the clean Linear-like aesthetic established by the About dialog redesign. Add a `warning` Button variant for amber actions. Remove dead lilac and discord color palettes. Add backdrop-blur to the shared Modal component so all Modal-based dialogs get it for free.

## Why

- ConfirmDialog and RunScriptConfigDialog bypass the Modal component entirely with hardcoded `bg-white dark:bg-gray-800` colors
- AnalyticsConsentDialog and Welcome use heavy gradient headers that clash with the minimal design direction
- Dead lilac and discord palette tokens clutter the design system
- The shared Modal component lacks backdrop-blur, meaning every dialog that uses it misses the modern look
- Archive action needs an amber "warning" button variant instead of red "danger"

## What

### Success Criteria

- [ ] ConfirmDialog uses Modal component with design tokens (no hardcoded gray/white)
- [ ] ConfirmDialog has visible X close button (Modal's default `showCloseButton={true}`)
- [ ] RunScriptConfigDialog uses Modal component with design tokens
- [ ] RunScriptConfigDialog preserves `autoFocus` on primary button
- [ ] AnalyticsConsentDialog gradient header replaced with clean minimal header
- [ ] Welcome.tsx gradient header replaced with clean minimal header
- [ ] Button component has a `warning` variant (amber)
- [ ] Modal backdrop has `backdrop-blur-sm` so all Modal-based dialogs benefit
- [ ] Lilac palette and discord tokens removed from colors.css
- [ ] All callers of ConfirmDialog still work
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

## All Needed Context

### Documentation & References

```yaml
- file: frontend/src/components/AboutDialog.tsx
  why: Target design reference — modern backdrop-blur, rounded-xl, border-border-primary/50

- file: frontend/src/components/ui/Modal.tsx
  why: Shared modal component — ConfirmDialog and RunScriptConfigDialog should use it.
       Modal defaults showCloseButton={true} which renders an X at top-right (line 124-135).
       Modal handles Escape key (line 30-41) and overlay click (line 83-100).

- file: frontend/src/components/ui/Button.tsx
  why: Has variants 'primary' | 'secondary' | 'ghost' | 'danger'. Need to add 'warning' variant.

- file: frontend/src/components/ConfirmDialog.tsx
  why: Component to modernize — currently fully hand-built with hardcoded colors

- file: frontend/src/components/RunScriptConfigDialog.tsx
  why: Component to modernize — hand-built dialog with hardcoded gray/blue colors.
       Has autoFocus on primary button (line 93) — must preserve.
       Has handleOpenSettings function (line 16-21) that calls onClose() then onOpenSettings() — must preserve.

- file: frontend/src/components/AnalyticsConsentDialog.tsx
  why: Uses gradient header that needs simplification

- file: frontend/src/components/Welcome.tsx
  why: Uses identical gradient header pattern as AnalyticsConsentDialog (line 47)

- file: frontend/src/styles/tokens/colors.css
  why: Contains dead lilac palette (lines 36-43) and dead discord tokens (lines 31-33) to remove
```

### Current Codebase Tree (relevant files)

```
frontend/src/
├── components/
│   ├── ui/
│   │   ├── Modal.tsx          # Shared modal — needs backdrop-blur
│   │   └── Button.tsx         # Needs 'warning' variant added
│   ├── ConfirmDialog.tsx      # MODERNIZE — hand-built, hardcoded colors
│   ├── RunScriptConfigDialog.tsx  # MODERNIZE — hand-built, hardcoded colors
│   ├── AnalyticsConsentDialog.tsx # MODERNIZE — gradient header
│   ├── Welcome.tsx            # MODERNIZE — gradient header
│   ├── AboutDialog.tsx        # REFERENCE — target design (not Modal-based, unaffected)
│   ├── SessionListItem.tsx    # Caller of ConfirmDialog (line 562) — uses confirmButtonClass
│   └── UpdateDialog.tsx       # Already uses Modal+tokens (no changes needed)
├── styles/tokens/
│   └── colors.css             # Remove lilac (lines 36-43) and discord (lines 31-33) palettes
```

### Known Gotchas

- ConfirmDialog has a `confirmButtonClass` prop that callers pass raw Tailwind classes. Replace with `variant` prop mapping to Button variants.
- SessionListItem.tsx uses `confirmButtonClass="bg-amber-600 hover:bg-amber-700 text-white"` for archive — use new `variant="warning"` for this.
- ConfirmDialog's Enter key handler calls both `onConfirm()` and `onClose()` — preserve this behavior.
- Modal already handles Escape key and overlay click — ConfirmDialog can drop its own handlers.
- Current ConfirmDialog uses `z-50`; Modal uses `z-modal-backdrop` (10000) — this is an improvement since it ensures the dialog renders above context menus.
- RunScriptConfigDialog has `autoFocus` on the primary button — preserve this.
- RunScriptConfigDialog's `handleOpenSettings` calls `onClose()` before `onOpenSettings()` — preserve this function.
- AnalyticsConsentDialog uses `closeOnOverlayClick={false} closeOnEscape={false}` — preserve this.
- `React.ReactNode` is used in ConfirmDialog interface — ensure proper import (`import type { ReactNode } from 'react'`).

## Implementation Blueprint

### Tasks (in implementation order)

```yaml
Task 1: Add 'warning' variant to Button component
MODIFY frontend/src/components/ui/Button.tsx:
  - Add 'warning' to the variant type: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning'
  - Add warning variant style to both Button and IconButton variants objects:
    warning: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400'
  - Update ButtonProps interface and IconButtonProps to include 'warning'

Task 2: Add backdrop-blur to Modal component
MODIFY frontend/src/components/ui/Modal.tsx:
  - Line 109: Add backdrop-blur-sm to the backdrop div
  - Change: className="fixed inset-0 bg-modal-overlay pointer-events-none"
  - To: className="fixed inset-0 bg-modal-overlay backdrop-blur-sm pointer-events-none"
  - This gives all Modal-based dialogs (UpdateDialog, AnalyticsConsent, Welcome, etc.) the blur effect
  - Note: AboutDialog is NOT Modal-based so it is unaffected (it has its own backdrop-blur)

Task 3: Modernize ConfirmDialog to use Modal + Button
MODIFY frontend/src/components/ConfirmDialog.tsx:
  - Replace entire hand-built dialog with Modal + Button components
  - Use Modal's default showCloseButton={true} so the X button is visible
  - Replace confirmButtonClass with variant prop
  - Keep Enter key handler (Modal handles Escape, Enter-to-confirm is custom)
  - Use proper import: import type { ReactNode } from 'react'

  New interface:
  ```typescript
  interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';  // maps to Button variant, default 'danger'
    icon?: ReactNode;
  }
  ```

  Structure:
  ```tsx
  <Modal isOpen={isOpen} onClose={onClose} size="sm">
    {/* Modal provides X close button by default */}
    <div className="p-6 pt-2">
      <div className="flex items-start gap-3 mb-4">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <h3 className="text-lg font-medium text-text-primary">{title}</h3>
      </div>
      <p className="text-text-secondary whitespace-pre-line leading-relaxed mb-6">
        {message}
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>{cancelText}</Button>
        <Button variant={variant} onClick={handleConfirm} autoFocus>{confirmText}</Button>
      </div>
    </div>
  </Modal>
  ```

  Preserve the Enter key useEffect handler but remove the Escape handler (Modal handles it).

Task 4: Update ConfirmDialog callers
MODIFY frontend/src/components/SessionListItem.tsx:
  - Line 562-571: Replace confirmButtonClass="bg-amber-600 hover:bg-amber-700 text-white"
  - With: variant="warning"
  - Remove the confirmButtonClass prop from JSX

Task 5: Modernize RunScriptConfigDialog to use Modal + Button
MODIFY frontend/src/components/RunScriptConfigDialog.tsx:
  - Replace the hand-built dialog with Modal, ModalHeader, ModalBody, ModalFooter
  - Preserve handleOpenSettings function (closes dialog before opening settings)
  - Preserve autoFocus on the primary "Open Project Settings" button
  - Replace all hardcoded colors with design tokens:
    - bg-yellow-50 dark:bg-yellow-900/20 → bg-status-warning/10
    - border-yellow-200 dark:border-yellow-800 → border-status-warning/30
    - text-yellow-600 dark:text-yellow-500 → text-status-warning
    - text-yellow-800 dark:text-yellow-300 → text-text-primary
    - bg-blue-50 dark:bg-blue-900/20 → bg-status-info/10
    - border-blue-200 dark:border-blue-800 → border-status-info/30
    - text-blue-800 dark:text-blue-300 → text-text-primary
    - bg-white dark:bg-gray-900 → bg-surface-primary
    - border-blue-200 dark:border-blue-700 → border-border-primary
    - text-gray-600 dark:text-gray-400 → text-text-tertiary
    - text-gray-700 dark:text-gray-300 → text-text-secondary
  - Use Button components for Close and Open Project Settings
  - Use ModalHeader with Play icon and title

  Structure:
  ```tsx
  <Modal isOpen={isOpen} onClose={onClose} size="md">
    <ModalHeader title="Configure Run Script" icon={<Play className="w-5 h-5" />} />
    <ModalBody>
      {/* Warning banner */}
      <div className="bg-status-warning/10 border border-status-warning/30 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-text-primary mb-1">No run script configured</p>
            <p className="text-text-secondary">A run script is required to test changes...</p>
          </div>
        </div>
      </div>
      {/* Info content with design tokens */}
      <div className="text-text-secondary space-y-3">
        ...preserved content with token replacements...
      </div>
      {/* Tip box */}
      <div className="bg-status-info/10 border border-status-info/30 rounded-lg p-4 mt-4">
        <p className="text-sm text-text-primary">...</p>
        <div className="mt-2 font-mono text-xs bg-surface-primary p-2 rounded border border-border-primary">
          ...
        </div>
      </div>
    </ModalBody>
    <ModalFooter>
      <Button variant="secondary" onClick={onClose}>Close</Button>
      {onOpenSettings && (
        <Button variant="primary" onClick={handleOpenSettings} icon={<Settings className="w-4 h-4" />} autoFocus>
          Open Project Settings
        </Button>
      )}
    </ModalFooter>
  </Modal>
  ```

Task 6: Simplify AnalyticsConsentDialog header
MODIFY frontend/src/components/AnalyticsConsentDialog.tsx:
  - Line 78: Replace gradient header with clean minimal style
  - Preserve logo size at h-10 w-10
  - Change: bg-gradient-to-r from-interactive to-interactive-active p-6 text-on-interactive rounded-t-lg
  - To: p-6 border-b border-border-primary
  - Update text color from on-interactive (white) to text-text-primary

  New header:
  ```tsx
  <div className="p-6 border-b border-border-primary">
    <div className="flex items-center">
      <img src={foozolLogo} alt="foozol" className="h-10 w-10 mr-3" />
      <h1 className="text-lg font-semibold text-text-primary">Help Improve foozol</h1>
    </div>
  </div>
  ```

Task 7: Simplify Welcome.tsx header
MODIFY frontend/src/components/Welcome.tsx:
  - Line 47: Replace gradient header with same clean minimal style
  - Preserve logo size at h-10 w-10
  - Change: bg-gradient-to-r from-interactive to-interactive-active p-6 text-on-interactive rounded-t-lg
  - To: p-6 border-b border-border-primary
  - Update text/subtitle colors

  New header:
  ```tsx
  <div className="p-6 border-b border-border-primary">
    <div className="flex items-center">
      <img src={foozolLogo} alt="foozol" className="h-10 w-10 mr-3" />
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Welcome to foozol</h1>
        <p className="text-sm text-text-tertiary">Multi-Session Claude Code Manager</p>
      </div>
    </div>
  </div>
  ```

Task 8: Remove dead color palettes from colors.css
MODIFY frontend/src/styles/tokens/colors.css:
  - Delete lines 31-33 (--discord-primary, --discord-hover, --discord-secondary)
  - Delete lines 35-43 (the --lilac-50 through --lilac-700 definitions and the comment)
  - These are defined but never referenced anywhere in the codebase
  - The AboutDialog uses inline hex for Discord colors (#5865F2, #4752C4), not these tokens
```

## Validation Loop

```bash
# Run after all tasks
pnpm typecheck
pnpm lint
```

## Deprecated Code to Remove

- `confirmButtonClass` prop from ConfirmDialog interface and all callers
- Lilac color palette from colors.css (lines 36-43)
- Discord color tokens from colors.css (lines 31-33)
- Hand-built dialog markup in ConfirmDialog (replaced by Modal)
- Hand-built dialog markup in RunScriptConfigDialog (replaced by Modal)
- Gradient headers in AnalyticsConsentDialog and Welcome.tsx

## Anti-Patterns to Avoid

- Don't add new hardcoded Tailwind color classes — always use design tokens
- Don't bypass the Modal component for new dialogs
- Don't add backwards-compatibility shims for the old confirmButtonClass prop
- Don't change logo sizes without justification — preserve h-10 w-10

## Confidence Score: 9/10

High confidence — all changes are well-scoped CSS/component modernization with clear before/after states. The only risk is if there are additional callers of ConfirmDialog not found in the search (grep showed only SessionListItem.tsx).
