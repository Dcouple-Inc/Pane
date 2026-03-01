// Cloud VM types — shared between main process and frontend
export type CloudProvider = 'gcp';
export type VmStatus = 'off' | 'starting' | 'running' | 'stopping' | 'unknown' | 'initializing' | 'not_provisioned';
export type TunnelStatus = 'off' | 'starting' | 'running' | 'error';

export interface CloudVmConfig {
  provider: CloudProvider;
  apiToken: string;
  serverId?: string;
  serverIp?: string;      // Legacy — not used with IAP
  vncPassword?: string;
  region?: string;
  projectId?: string;
  zone?: string;
  tunnelPort?: number;
  tunnelStatus?: TunnelStatus;  // Set by external scripts
}

export interface CloudVmState {
  status: VmStatus;
  ip: string | null;
  noVncUrl: string | null;
  provider: CloudProvider | null;
  serverId: string | null;
  lastChecked: string | null;
  error: string | null;
  tunnelStatus: TunnelStatus;
}
