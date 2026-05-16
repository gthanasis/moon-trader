'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type BotSettings } from './api-client'

/**
 * TanStack Query hooks over the API client. Live trading data uses a
 * `refetchInterval`; static-ish data is fetched once and cached.
 */

export const usePositions = () =>
  useQuery({ queryKey: ['positions'], queryFn: api.getPositions, refetchInterval: 15_000 })

export const useTrades = (limit = 100) =>
  useQuery({ queryKey: ['trades', limit], queryFn: () => api.getTrades(limit) })

export const useDecisions = (limit = 20) =>
  useQuery({ queryKey: ['decisions', limit], queryFn: () => api.getDecisions(limit), refetchInterval: 30_000 })

export const usePendingDecision = () =>
  useQuery({ queryKey: ['pendingDecision'], queryFn: api.getPendingDecision, refetchInterval: 15_000 })

export const useSignals = (sinceMs = 24 * 60 * 60 * 1000) =>
  useQuery({ queryKey: ['signals', sinceMs], queryFn: () => api.getSignals(sinceMs) })

export const useBotState = <T = unknown>(key: string) =>
  useQuery({ queryKey: ['botState', key], queryFn: () => api.getBotState<T>(key) })

export const useBacktestRuns = () =>
  useQuery({ queryKey: ['backtestRuns'], queryFn: api.getBacktestRuns })

export const useBacktestRun = (id: string) =>
  useQuery({ queryKey: ['backtestRun', id], queryFn: () => api.getBacktestRun(id), enabled: !!id })

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: api.getSettings })

export const usePaused = () =>
  useQuery({ queryKey: ['paused'], queryFn: api.getPaused, refetchInterval: 15_000 })

/** Saves settings and refreshes the cached value. */
export const useSaveSettings = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings: BotSettings) => api.saveSettings(settings),
    onSuccess: saved => qc.setQueryData(['settings'], saved),
  })
}

/** Toggles the paused flag and refreshes the cached value. */
export const useSetPaused = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (paused: boolean) => api.setPaused(paused),
    onSuccess: ({ paused }) => qc.setQueryData(['paused'], { paused }),
  })
}

/** Approves/rejects a decision and invalidates decision queries. */
export const useUpdateDecision = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      api.updateDecision(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['decisions'] })
      void qc.invalidateQueries({ queryKey: ['pendingDecision'] })
    },
  })
}
