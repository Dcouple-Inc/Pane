import { useEffect, useCallback } from 'react';
import { Play, Square, Loader2, Cloud, Monitor, RefreshCw } from 'lucide-react';
import { useCloudStore } from '../stores/cloudStore';

type VmStatus = 'off' | 'starting' | 'running' | 'stopping' | 'unknown' | 'initializing' | 'not_provisioned';
type TunnelStatus = 'off' | 'starting' | 'running' | 'error';

interface CloudVmState {
  status: VmStatus;
  ip: string | null;
  noVncUrl: string | null;
  provider: 'gcp' | null;
  serverId: string | null;
  lastChecked: string | null;
  error: string | null;
  tunnelStatus: TunnelStatus;
}

export function CloudWidget() {
  const { vmState, showCloudView, loading, setVmState, setLoading, setShowCloudView, toggleCloudView } = useCloudStore();

  // Initialize: fetch state, start polling, subscribe to changes
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function init() {
      try {
        const result = await window.electronAPI.cloud.getState();
        if (result.success && result.data) {
          setVmState(result.data as CloudVmState);
        }

        await window.electronAPI.cloud.startPolling();

        cleanup = window.electronAPI.cloud.onStateChanged((newState) => {
          setVmState(newState as CloudVmState);
          setLoading(false);
        });
      } catch {
        // Cloud not configured
      }
    }

    init();

    return () => {
      cleanup?.();
      window.electronAPI.cloud.stopPolling().catch(() => {});
    };
  }, [setVmState, setLoading]);

  // When VM explicitly stops, exit cloud view (but not on transient 'unknown' status)
  useEffect(() => {
    const explicitlyOff = vmState && (vmState.status === 'off' || vmState.status === 'stopping' || vmState.status === 'not_provisioned');
    if (explicitlyOff && showCloudView) {
      setShowCloudView(false);
    }
  }, [vmState?.status, showCloudView, setShowCloudView]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.cloud.startVm();
      if (result.success && result.data) {
        setVmState(result.data as CloudVmState);
      }
    } catch {
      // Error handled by state change event
    } finally {
      setLoading(false);
    }
  }, [setLoading, setVmState]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    setShowCloudView(false);
    try {
      const result = await window.electronAPI.cloud.stopVm();
      if (result.success && result.data) {
        setVmState(result.data as CloudVmState);
      }
    } catch {
      // Error handled by state change event
    } finally {
      setLoading(false);
    }
  }, [setLoading, setShowCloudView, setVmState]);

  const handleRetryTunnel = useCallback(async () => {
    setLoading(true);
    try {
      await window.electronAPI.cloud.startTunnel();
    } catch {
      // Error handled by state change event
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  // Don't render if cloud is not configured
  if (!vmState || vmState.status === 'not_provisioned') {
    return null;
  }

  const isTransitioning = vmState.status === 'starting' || vmState.status === 'stopping' || vmState.status === 'initializing';
  const isRunning = vmState.status === 'running';
  const isOff = vmState.status === 'off';
  const tunnelConnecting = isRunning && vmState.tunnelStatus === 'starting';
  const tunnelReady = isRunning && vmState.tunnelStatus === 'running';
  const tunnelError = isRunning && vmState.tunnelStatus === 'error';
  const tunnelDisconnected = isRunning && vmState.tunnelStatus === 'off';

  // Compute transitioning label
  const getTransitionLabel = () => {
    if (vmState.status === 'stopping') return 'Stopping...';
    if (vmState.status === 'starting' || vmState.status === 'initializing') return 'Starting VM...';
    if (tunnelConnecting) return 'Connecting tunnel...';
    return 'Loading...';
  };

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-1.5" style={{ zIndex: 1300 }}>
      {/* Error tooltip */}
      {vmState.error && (
        <div className="px-2 py-1 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 max-w-48 truncate">
          {vmState.error}
        </div>
      )}

      {/* Transitioning state (VM starting/stopping or tunnel connecting) */}
      {(isTransitioning || tunnelConnecting || loading) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary/95 backdrop-blur-sm border border-border-primary rounded-xl shadow-lg">
          <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
          <span className="text-xs text-text-secondary">
            {getTransitionLabel()}
          </span>
        </div>
      )}

      {/* Off state — start button */}
      {isOff && !loading && (
        <button
          onClick={handleStart}
          className="flex items-center gap-2 px-3 py-2 bg-bg-secondary/95 backdrop-blur-sm border border-border-primary rounded-xl shadow-lg hover:bg-bg-tertiary transition-colors"
          title="Start Cloud VM"
        >
          <Play className="w-4 h-4 text-green-400 fill-green-400" />
          <span className="text-xs text-text-primary">Start Cloud</span>
        </button>
      )}

      {/* Tunnel disconnected or error — show reconnect/retry + stop */}
      {(tunnelError || tunnelDisconnected) && !loading && (
        <>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-2.5 py-2 bg-bg-secondary/95 backdrop-blur-sm border border-border-primary rounded-xl shadow-lg hover:bg-bg-tertiary transition-colors"
            title="Stop Cloud VM"
          >
            <Square className="w-3.5 h-3.5 text-red-400 fill-red-400" />
          </button>
          <button
            onClick={handleRetryTunnel}
            className={`flex items-center gap-2 px-3 py-2 bg-bg-secondary/95 backdrop-blur-sm border rounded-xl shadow-lg hover:bg-bg-tertiary transition-colors ${
              tunnelError ? 'border-orange-500/30' : 'border-border-primary'
            }`}
            title={tunnelError ? 'Retry tunnel connection' : 'Connect tunnel to running VM'}
          >
            <RefreshCw className={`w-4 h-4 ${tunnelError ? 'text-orange-400' : 'text-green-400'}`} />
            <span className="text-xs text-text-primary">{tunnelError ? 'Retry Tunnel' : 'Connect'}</span>
          </button>
        </>
      )}

      {/* Running state with tunnel ready — stop + toggle */}
      {tunnelReady && !loading && (
        <>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-2.5 py-2 bg-bg-secondary/95 backdrop-blur-sm border border-border-primary rounded-xl shadow-lg hover:bg-bg-tertiary transition-colors"
            title="Stop Cloud VM"
          >
            <Square className="w-3.5 h-3.5 text-red-400 fill-red-400" />
          </button>
          <button
            onClick={toggleCloudView}
            className={`flex items-center gap-2 px-3 py-2 backdrop-blur-sm border rounded-xl shadow-lg transition-colors ${
              showCloudView
                ? 'bg-interactive/10 border-interactive/40 hover:bg-interactive/20'
                : 'bg-bg-secondary/95 border-border-primary hover:bg-bg-tertiary'
            }`}
            title={showCloudView ? 'Switch to Local' : 'Switch to Cloud'}
          >
            {showCloudView ? (
              <>
                <Monitor className="w-4 h-4 text-text-primary" />
                <span className="text-xs text-text-primary">Local</span>
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4 text-interactive" />
                <span className="text-xs text-text-primary">Cloud</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
