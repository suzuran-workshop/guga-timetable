import { useApi } from './use-api.js'
import type { TermDto } from '../../shared/domain.js'

export interface TermContext {
  term: TermDto | null
  currentWeek: number
  today: string
  weekday: number
}

/** 当前学期上下文（学期/教学周/今天星期）。课表与调换课页共用。 */
export function useTermContext() {
  const { data, loading, reload } = useApi<TermContext>('/api/terms/context', { silent: true })
  return {
    ctx: data ?? null,
    loading,
    reload,
    term: data?.term ?? null,
    currentWeek: data?.currentWeek ?? 1,
    totalWeeks: data?.term?.totalWeeks ?? 20,
    hasTerm: !!data?.term,
  }
}
