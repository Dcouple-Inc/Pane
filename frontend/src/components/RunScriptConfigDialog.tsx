import { Settings, Play, AlertCircle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';

interface RunScriptConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export function RunScriptConfigDialog({
  isOpen,
  onClose,
  onOpenSettings
}: RunScriptConfigDialogProps) {
  if (!isOpen) return null;

  const handleOpenSettings = () => {
    onClose();
    if (onOpenSettings) {
      onOpenSettings();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader title="Configure Run Script" icon={<Play className="w-5 h-5" />} />
      <ModalBody>
        {/* Warning banner */}
        <div className="bg-status-warning/10 border border-status-warning/30 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-text-primary mb-1">No run script configured</p>
              <p className="text-text-secondary">A run script is required to test changes in your application.</p>
            </div>
          </div>
        </div>

        <div className="text-text-secondary space-y-3">
          <p>
            <strong className="text-text-primary">What is a run script?</strong><br />
            A run script contains the commands needed to start your application for testing changes made by Claude Code sessions.
          </p>

          <p>
            <strong className="text-text-primary">How to configure:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-4">
            <li>Click the settings icon next to your project name in the sidebar (visible on hover)</li>
            <li>In the "Run Script" field, enter the command(s) to start your application</li>
            <li>Optionally add a "Build Script" that runs when creating new worktrees</li>
          </ol>

          <div className="bg-status-info/10 border border-status-info/30 rounded-lg p-4 mt-4">
            <p className="text-sm text-text-primary">
              <strong>Recommendation:</strong> Include commands to kill any existing instances of your application to prevent port conflicts when switching between sessions.
            </p>
            <div className="mt-2 font-mono text-xs bg-surface-primary p-2 rounded border border-border-primary">
              <div className="text-text-tertiary"># Example for a Node.js app on port 3000:</div>
              <div className="text-text-secondary">pkill -f "node.*port=3000" || true</div>
              <div className="text-text-secondary">npm run dev</div>
            </div>
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
  );
}
