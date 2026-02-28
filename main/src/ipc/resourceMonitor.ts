import type { IpcMain } from 'electron';
import type { AppServices } from './types';
import { resourceMonitorService } from '../services/resourceMonitorService';

export function registerResourceMonitorHandlers(ipcMain: IpcMain, _services: AppServices): void {
  ipcMain.handle('resource-monitor:get-snapshot', async () => {
    try {
      const snapshot = await resourceMonitorService.getSnapshot();
      return { success: true, data: snapshot };
    } catch (error) {
      console.error('[IPC] Failed to get resource snapshot:', error);
      return { success: false, error: (error instanceof Error) ? error.message : String(error) };
    }
  });

  ipcMain.handle('resource-monitor:start-active', async () => {
    try {
      resourceMonitorService.startActivePolling();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error instanceof Error) ? error.message : String(error) };
    }
  });

  ipcMain.handle('resource-monitor:stop-active', async () => {
    try {
      resourceMonitorService.stopActivePolling();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error instanceof Error) ? error.message : String(error) };
    }
  });
}
