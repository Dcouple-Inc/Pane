import { create } from 'zustand';
import type { CloudVmState } from '../../../shared/types/cloud';

interface CloudStore {
  vmState: CloudVmState | null;
  showCloudView: boolean;
  loading: boolean;
  iframeReady: boolean; // true once iframe has been mounted at least once

  setVmState: (state: CloudVmState) => void;
  setShowCloudView: (show: boolean) => void;
  setLoading: (loading: boolean) => void;
  setIframeReady: () => void;
  toggleCloudView: () => void;
}

export const useCloudStore = create<CloudStore>()((set, get) => ({
  vmState: null,
  showCloudView: false,
  loading: false,
  iframeReady: false,

  setVmState: (vmState) => set({ vmState }),

  setShowCloudView: (showCloudView) => set({ showCloudView }),

  setLoading: (loading) => set({ loading }),

  setIframeReady: () => set({ iframeReady: true }),

  toggleCloudView: () => {
    const { vmState, showCloudView } = get();
    if (vmState?.status === 'running') {
      set({ showCloudView: !showCloudView });
    }
  },
}));
