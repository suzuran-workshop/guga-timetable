import { useApi } from '../hooks/use-api.js'
import type { CourseDto, TeacherDto, ClassDto } from '@guga/shared'

/** 下拉选项数据（课程/教师/班级），各表单页共享，缓存于各自组件实例。 */
export function useCourseOptions() {
  const { data, loading } = useApi<{ items: CourseDto[] }>('/api/courses/options/all')
  return {
    courses: data?.items ?? [],
    loading,
    options: (data?.items ?? []).map((c) => ({ value: c.id, label: `${c.name}（${c.code}）` })),
  }
}

export function useTeacherOptions() {
  const { data, loading } = useApi<{ items: TeacherDto[] }>('/api/teachers/options/all')
  return {
    teachers: data?.items ?? [],
    loading,
    options: (data?.items ?? []).map((t) => ({ value: t.id, label: `${t.name}${t.title ? ` · ${t.title}` : ''}` })),
  }
}

export function useClassOptions() {
  const { data, loading } = useApi<{ items: ClassDto[] }>('/api/classes/options/all')
  return {
    classes: data?.items ?? [],
    loading,
    options: (data?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
  }
}
