import { useEffect, useId, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, toastError } from '../lib/api.js'
import { Button } from './ui/button.js'
import { Input } from './ui/input.js'
import { Label } from './ui/label.js'
import { Textarea } from './ui/textarea.js'
import { Switch } from './ui/switch.js'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select.js'

/**
 * 通用表单对话框：字段规格 + zod schema 驱动，统一新建/编辑逻辑。
 *
 * 用 react-hook-form + zodResolver 做校验，字段类型支持 input/select/textarea/number/date/switch/multiselect。
 * 提交时按 endpoint 调 POST（新建）或 PATCH（编辑），成功后 onSaved 回调刷新列表。
 */

export type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'select' | 'switch' | 'tags'

export interface FieldSpec {
  name: string
  label: string
  type: FieldType
  placeholder?: string
  required?: boolean
  /** select 选项 */
  options?: { value: string; label: string }[]
  /** number 的 min/max/step */
  min?: number
  max?: number
  step?: number
  /** 跨列（默认 1，2 = 占满两列） */
  colSpan?: 1 | 2
  /** 编辑时只读 */
  readOnly?: boolean
  /** 提示文案 */
  hint?: string
}

interface FormDialogProps<T extends Record<string, any>> {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  fields: FieldSpec[]
  schema: z.ZodType<T>
  /** 编辑时的初值；null/undefined = 新建 */
  defaultValues?: Partial<T> | null
  /** 提交端点（新建用 POST，编辑用 PATCH /:id） */
  endpoint: string
  /** 编辑时的资源 id */
  editId?: string | null
  onSaved: () => void
  /** 提交前对 payload 的转换（如 tags 数组 ↔ 字符串） */
  transform?: (values: any) => any
  width?: string
}

export function FormDialog<T extends Record<string, any>>(props: FormDialogProps<T>) {
  const {
    open, onOpenChange, title, description, fields, schema, defaultValues,
    endpoint, editId, onSaved, transform, width = 'max-w-2xl',
  } = props
  const isEdit = !!editId
  const formId = useId().replace(/[:]/g, '')
  const [submitting, setSubmitting] = useState(false)

  const { control, handleSubmit, reset, formState: { errors } } = useForm<any>({
    resolver: zodResolver(schema as any),
    defaultValues: defaultValues ?? {},
  })

  useEffect(() => {
    if (open) reset(defaultValues ?? {})
  }, [open, defaultValues, reset])

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      const payload = transform ? transform(values) : values
      // 过滤 undefined，空字符串转 undefined（可选字段）
      const clean: Record<string, any> = {}
      for (const [k, v] of Object.entries(payload)) {
        if (v === undefined) continue
        if (v === '' && !fields.find((f) => f.name === k)?.required) continue
        clean[k] = v
      }
      if (isEdit) {
        await api.patch(`${endpoint}/${editId}`, clean)
        toast.success('已更新')
      } else {
        await api.post(endpoint, clean)
        toast.success('已创建')
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
      <DialogContent className={width}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const fieldId = `${formId}-${f.name}`
              return (
                <div key={f.name} className={f.colSpan === 2 ? 'sm:col-span-2' : ''}>
                  <Field id={fieldId} label={f.label} error={(errors as any)[f.name]?.message} required={f.required} hint={f.hint}>
                    <ControlledField id={fieldId} name={f.name} spec={f} control={control} disabled={isEdit && f.readOnly} />
                  </Field>
                </div>
              )
            })}
          </div>
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

function ControlledField({ id, name, spec, control, disabled }: {
  id: string; name: string; spec: FieldSpec; control: any; disabled?: boolean
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        switch (spec.type) {
          case 'select':
            return (
              <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={disabled}>
                <SelectTrigger id={id}><SelectValue placeholder={spec.placeholder ?? '请选择'} /></SelectTrigger>
                <SelectContent>
                  {spec.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )
          case 'textarea':
            return <Textarea id={id} {...field} value={field.value ?? ''} rows={2} placeholder={spec.placeholder} disabled={disabled} />
          case 'number':
            return (
              <Input id={id} type="number" {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                min={spec.min} max={spec.max} step={spec.step} placeholder={spec.placeholder} disabled={disabled} />
            )
          case 'date':
            return <Input id={id} type="date" {...field} value={field.value ?? ''} disabled={disabled} />
          case 'switch':
            return <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
          case 'tags':
            return <TagsInput value={field.value ?? []} onChange={field.onChange} placeholder={spec.placeholder} disabled={disabled} />
          default:
            return <Input id={id} {...field} value={field.value ?? ''} placeholder={spec.placeholder} disabled={disabled} />
        }
      }}
    />
  )
}

/** 标签输入（回车添加，用于教师任教学科等多值字段） */
function TagsInput({ value, onChange, placeholder, disabled }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setInput('')
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={input} disabled={disabled} placeholder={placeholder ?? '输入后回车添加'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>添加</Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
              {t}
              {!disabled && (
                <button type="button" className="text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ id, label, error, required, hint, children }: {
  id?: string; label: string; error?: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
