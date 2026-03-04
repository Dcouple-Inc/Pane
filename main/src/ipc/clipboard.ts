import { IpcMain, clipboard } from 'electron';
import type { AppServices } from './types';

export function registerClipboardHandlers(ipcMain: IpcMain, { getMainWindow }: AppServices): void {
  ipcMain.handle('clipboard:paste', (_event, text: string) => {
    try {
      clipboard.writeText(text);
      const win = getMainWindow();
      if (win) {
        win.webContents.paste();
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to paste from clipboard:', error);
      return { success: false, error: 'Failed to paste' };
    }
  });
}
