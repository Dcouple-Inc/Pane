import { create } from 'zustand';

interface NavigationState {
  activeView: 'sessions' | 'project';
  activeProjectId: number | null;

  // Sidebar collapse
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;

  // Immersive mode — all sidebars hide in sync
  immersiveMode: boolean;
  setImmersiveMode: (immersive: boolean) => void;

  // Actions
  setActiveView: (view: 'sessions' | 'project') => void;
  setActiveProjectId: (projectId: number | null) => void;
  navigateToProject: (projectId: number) => void;
  navigateToSessions: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: 'sessions',
  activeProjectId: null,

  sidebarCollapsed: localStorage.getItem('pane-sidebar-collapsed') === 'true',
  setSidebarCollapsed: (collapsed) => {
    localStorage.setItem('pane-sidebar-collapsed', String(collapsed));
    set({ sidebarCollapsed: collapsed });
  },
  toggleSidebarCollapsed: () => set((state) => {
    const next = !state.sidebarCollapsed;
    localStorage.setItem('pane-sidebar-collapsed', String(next));
    return { sidebarCollapsed: next };
  }),

  immersiveMode: false,
  setImmersiveMode: (immersive) => set({ immersiveMode: immersive }),

  setActiveView: (view) => set({ activeView: view }),

  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),

  navigateToProject: (projectId) => set({
    activeView: 'project',
    activeProjectId: projectId
  }),

  navigateToSessions: () => set({
    activeView: 'sessions',
    activeProjectId: null
  }),
}));