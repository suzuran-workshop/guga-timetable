import { teacherSchema } from '@guga/shared'
import { GENDER_LABEL, TEACHER_STATUS_LABEL, type TeacherDto, type Gender, type TeacherStatus } from '@guga/shared'
import { FormDialog, type FieldSpec } from '../form-dialog.js'

const FIELDS: FieldSpec[] = [
  { name: 'name', label: '姓名', type: 'text', required: true, placeholder: '教师姓名' },
  { name: 'teacherNo', label: '工号', type: 'text', required: true, placeholder: '如 T2025001' },
  { name: 'title', label: '职称', type: 'text', placeholder: '如 高级教师' },
  { name: 'phone', label: '联系电话', type: 'text', placeholder: '手机号' },
  {
    name: 'gender', label: '性别', type: 'select',
    options: (Object.keys(GENDER_LABEL) as Gender[]).map((g) => ({ value: g, label: GENDER_LABEL[g] })),
  },
  {
    name: 'status', label: '状态', type: 'select',
    options: (Object.keys(TEACHER_STATUS_LABEL) as TeacherStatus[]).map((s) => ({ value: s, label: TEACHER_STATUS_LABEL[s] })),
  },
  { name: 'subjects', label: '任教学科', type: 'tags', colSpan: 2, placeholder: '如 数学、物理' },
  { name: 'remark', label: '备注', type: 'textarea', colSpan: 2 },
]

/** 教师新建/编辑对话框（基于通用 FormDialog）。 */
export function TeacherDialog({
  open, onOpenChange, teacher, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  teacher: TeacherDto | null
  onSaved: () => void
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={teacher ? '编辑教师' : '新建教师'}
      fields={FIELDS}
      schema={teacherSchema as any}
      defaultValues={teacher ? {
        name: teacher.name, teacherNo: teacher.teacherNo, title: teacher.title ?? '',
        phone: teacher.phone ?? '', gender: teacher.gender, status: teacher.status,
        subjects: teacher.subjects, remark: teacher.remark ?? '',
      } : { gender: 'unknown', status: 'active', subjects: [] }}
      endpoint="/api/teachers"
      editId={teacher?.id ?? null}
      onSaved={onSaved}
    />
  )
}
