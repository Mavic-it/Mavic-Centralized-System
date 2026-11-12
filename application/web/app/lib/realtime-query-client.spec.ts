import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { watchRealtimeQueries } from './realtime-query-client';

describe('Realtime query cache refresh', () => {
  it('refreshes active queries in separate clients while marking dormant data stale', async () => {
    const listeners = new Set<() => void>();
    const transport = { subscribe(callback: () => void) { listeners.add(callback); return () => {listeners.delete(callback);}; } };
    const first = new QueryClient(), second = new QueryClient();
    first.setQueryData(['employees'], ['old']); second.setQueryData(['leave'], ['old']);
    second.setQueryData(['dormant'], ['old']);
    const employees = vi.fn().mockResolvedValue(['new employee']);
    const leave = vi.fn().mockResolvedValue(['approved']);
    const firstObserver = new QueryObserver(first, {queryKey:['employees'],queryFn:employees,staleTime:Infinity});
    const secondObserver = new QueryObserver(second, {queryKey:['leave'],queryFn:leave,staleTime:Infinity});
    const stopFirstObserver=firstObserver.subscribe(()=>undefined),stopSecondObserver=secondObserver.subscribe(()=>undefined);
    const stopFirst=watchRealtimeQueries(first,transport),stopSecond=watchRealtimeQueries(second,transport);
    for(const refresh of listeners)refresh();
    await vi.waitFor(()=>expect(second.getQueryData(['leave'])).toEqual(['approved']));
    expect(first.getQueryData(['employees'])).toEqual(['new employee']);
    expect(employees).toHaveBeenCalledOnce();expect(leave).toHaveBeenCalledOnce();
    expect(second.getQueryData(['dormant'])).toEqual(['old']);
    expect(second.getQueryState(['dormant'])?.isInvalidated).toBe(true);
    stopFirst();stopSecond();stopFirstObserver();stopSecondObserver();first.clear();second.clear();
    expect(listeners.size).toBe(0);
  });
});
