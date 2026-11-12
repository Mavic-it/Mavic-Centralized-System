import type { QueryClient } from '@tanstack/react-query';
import { workspaceRealtime } from './workspace-realtime';

export function watchRealtimeQueries(client: QueryClient, transport = workspaceRealtime) {
  return transport.subscribe(() => {
    void client.invalidateQueries({ refetchType: 'active' });
  });
}
