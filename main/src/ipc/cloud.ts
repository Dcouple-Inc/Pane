import type { IpcMain } from 'electron';
import type { AppServices } from './types';
import { CloudVmManager } from '../services/cloudVmManager';

let cloudVmManager: CloudVmManager | null = null;

/**
 * Get the CloudVmManager instance (if initialized).
 * Used by index.ts for shutdown cleanup.
 */
export function getCloudVmManager(): CloudVmManager | null {
  return cloudVmManager;
}

export function registerCloudHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { configManager, logger, getMainWindow } = services;

  // Lazy-initialize the CloudVmManager
  function getManager(): CloudVmManager {
    if (!cloudVmManager) {
      cloudVmManager = new CloudVmManager(configManager, logger);

      // Start watching config file for external changes (e.g., from setup scripts)
      configManager.startWatching();

      // Forward state changes to the renderer
      cloudVmManager.on('state-changed', (state) => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('cloud:state-changed', state);
        }
      });
    }
    return cloudVmManager;
  }

  // Get current cloud VM state
  ipcMain.handle('cloud:get-state', async () => {
    try {
      const manager = getManager();
      return { success: true, data: await manager.getState() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Start (power on) the cloud VM
  ipcMain.handle('cloud:start-vm', async () => {
    try {
      const manager = getManager();
      const state = await manager.startVm();
      return { success: true, data: state };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Stop (power off) the cloud VM — disk persists
  ipcMain.handle('cloud:stop-vm', async () => {
    try {
      const manager = getManager();
      const state = await manager.stopVm();
      return { success: true, data: state };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Manually start the IAP tunnel (without starting the VM)
  ipcMain.handle('cloud:start-tunnel', async () => {
    try {
      const manager = getManager();
      await manager.startTunnel();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Manually stop the IAP tunnel
  ipcMain.handle('cloud:stop-tunnel', async () => {
    try {
      const manager = getManager();
      manager.stopTunnel();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Start polling VM status
  ipcMain.handle('cloud:start-polling', async () => {
    try {
      const manager = getManager();
      manager.startPolling(30_000); // Poll every 30 seconds (GCP-friendly rate)
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Stop polling
  ipcMain.handle('cloud:stop-polling', async () => {
    try {
      const manager = getManager();
      manager.stopPolling();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
