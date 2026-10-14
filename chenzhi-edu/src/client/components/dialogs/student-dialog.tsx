import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, toastError } from '../../lib/api.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Textarea } from '../ui/textarea.js'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select.js'
import {
  GENDER_LABEL, STUDENT_STATUS_LABEL,
  type StudentDto, type Gender, type StudentStatus,
} from '../../../shared/domain.js'

interface FormValues {
  name: string
  studentNo: string
  phone: string
  gender: Gender
  gradeLevel: string
  birthDate: string
  guardianName: string
  guardianPhone: string
  status: StudentStatus
  balanceLessons: number
  remark: string
}

/** 学员新建/编辑对话框。editing=null 为新建。 */
export function StudentDialog({
  open, onOpenChange, student, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  student: StudentDto | null
  onSaved: () => void
}) {
  const isEdit = !!student
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>()
  const gender = watch('gender')
  const status = watch('status')

  useEffect(() => {
    if (open) {
      reset({
        name: student?.name ?? '',
        studentNo: student?.studentNo ?? '',
        phone: student?.phone ?? '',
        gender: student?.gender ?? 'unknown',
        gradeLevel: student?.gradeLevel ?? '',
        birthDate: student?.birthDate ?? '',
        guardianName: student?.guardianName ?? '',
        guardianPhone: student?.guardianPhone ?? '',
        status: student?.status ?? 'active',
        balanceLessons: student?.balanceLessons ?? 0,
        remark: student?.remark ?? '',
      })
    }
  }, [open, student, reset])

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name.trim(),
        studentNo: values.studentNo.trim(),
        phone: values.phone.trim() || undefined,
        gender: values.gender,
        gradeLevel: values.gradeLevel.trim() || undefined,
        birthDate: values.birthDate || undefined,
        guardianName: values.guardianName.trim() || undefined,
        guardianPhone: values.guardianPhone.trim() || undefined,
        status: values.status,
        balanceLessons: Number(values.balanceLessons) || 0,
        remark: values.remark.trim() || undefined,
      }
      if (isEdit) {
        await api.patch(`/api/students/${student!.id}`, payload)
        toast.success('学员已更新')
      } else {
        await api.post('/api/students', payload)
        toast.success('学员已创建')
      }
      onSaved()
    } catch (e) {
      toastError(e)
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑学员' : '新建学员'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="姓名" error={errors.name?.message} required>
              <Input {...register('name', { required: '请输入姓名' })} placeholder="学员姓名" />
            </Field>
            <Field label="学号" error={errors.studentNo?.message} required>
              <Input {...register('studentNo', { required: '请输入学号' })} placeholder="如 S2025001" />
            </Field>
            <Field label="联系电话">
              <Input {...register('phone')} placeholder="手机号" />
            </Field>
            <Field label="性别">
              <Select value={gender} onValueChange={(v) => setValue('gender', v as Gender)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
                    <SelectItem key={g} value={g}>{GENDER_LABEL[g]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="年级">
              <Input {...register('gradeLevel')} placeholder="如 高一" />
            </Field>
            <Field label="出生日期">
              <Input type="date" {...register('birthDate')} />
            </Field>
            <Field label="监护人">
              <Input {...register('guardianName')} placeholder="监护人姓名" />
            </Field>
            <Field label="监护人电话">
              <Input {...register('guardianPhone')} placeholder="监护人电话" />
            </Field>
            <Field label="状态">
              <Select value={status} onValueChange={(v) => setValue('status', v as StudentStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STUDENT_STATUS_LABEL) as StudentStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STUDENT_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="剩余课时">
              <Input type="number" min={0} {...register('balanceLessons', { valueAsNumber: true })} />
            </Field>
          </div>
          <Field label="备注">
            <Textarea {...register('remark')} rows={2} placeholder="选填" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, error, required, children }: {
  label: string; error?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
