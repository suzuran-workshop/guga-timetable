import { useRef, useState } from 'react'
import { Upload, Download, Trash2, FileText, FolderOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, toastError } from '../lib/api.js'
import { useApi } from '../hooks/use-api.js'
import { useAppStore } from '../store/app.js'
import { PageHeader } from '../components/page-header.js'
import { DataTable, type Column } from '../components/data-table.js'
import { ConfirmDialog } from '../components/confirm-dialog.js'
import { Button } from '../components/ui/button.js'
import { Badge } from '../components/ui/badge.js'
import { Card } from '../components/ui/card.js'
import { formatDateTime } from '../lib/utils.js'

/** 文件元数据（GET /api/files 的 item 形状，对应 @homurajs/storage 登记记录） */
interface FileMeta {
  id: string
  objectKey: string
  fileName: string
  contentType: string | null
  size: number
  ns: string
  uploadedBy: string | null
  createdAt: number
}

/** 字节数 → 人类可读（B / KB / MB / GB） */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 从 contentType 取简短类型标签（如 image/png → png） */
function shortType(contentType: string | null): string {
  if (!contentType) return '未知'
  const sub = contentType.split('/')[1]
  return (sub ?? contentType).toUpperCase()
}

/**
 * 资料库：对象存储文件管理（@homurajs/storage）。
 * 上传 → 对象存储 + 元数据登记；下载走 /files/<key> 代理路由（cookie 鉴权，同源）。
 */
export function FilesPage() {
  const can = useAppStore((s) => s.can)
  const canWrite = can('file:write')
  const { data, loading, reload } = useApi<{ items: FileMeta[] }>('/api/files?limit=100')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [deleting, setDeleting] = useState<FileMeta | null>(null)

  const doUpload = async (file: File | undefined | null) => {
    if (!file) return
    if (!canWrite) {
      toast.error('没有上传权限')
      return
    }
    setUploading(true)
    try {
      await api.upload('/api/files/upload', file)
      toast.success(`已上传「${file.name}」`)
      reload()
    } catch (e) {
      toastError(e)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.del(`/api/files/${deleting.id}`)
      toast.success(`已删除「${deleting.fileName}」`)
      setDeleting(null)
      reload()
    } catch (e) {
      toastError(e)
    }
  }

  const download = (f: FileMeta) => {
    window.open(`/files/${f.objectKey}`, '_blank')
  }

  const columns: Column<FileMeta>[] = [
    {
      key: 'fileName', header: '文件名',
      cell: (f) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{f.fileName}</div>
            <div className="truncate text-xs text-muted-foreground">{f.contentType ?? '未知类型'}</div>
          </div>
        </div>
      ),
    },
    { key: 'size', header: '大小', cell: (f) => <span className="text-sm tabular-nums">{formatSize(f.size)}</span> },
    {
      key: 'type', header: '类型',
      cell: (f) => <Badge variant="outline">{shortType(f.contentType)}</Badge>,
    },
    { key: 'createdAt', header: '上传时间', cell: (f) => <span className="text-sm tabular-nums text-muted-foreground">{formatDateTime(f.createdAt)}</span> },
    {
      key: 'actions', header: '操作', className: 'w-24 text-right',
      cell: (f) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="下载"
            onClick={(e) => { e.stopPropagation(); download(f) }}>
            <Download className="h-4 w-4" />
          </Button>
          {canWrite && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="删除"
              onClick={(e) => { e.stopPropagation(); setDeleting(f) }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="资料库" description="对象存储文件管理 · 上传课件、讲义与档案资料" />

      {/* 上传区 */}
      <Card
        className={`mb-4 border-dashed p-6 transition-colors ${dragging ? 'border-primary bg-primary/5' : ''}`}
        onDragOver={(e) => { if (canWrite) { e.preventDefault(); setDragging(true) } }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!canWrite) return
          e.preventDefault()
          setDragging(false)
          doUpload(e.dataTransfer.files?.[0])
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Upload className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-medium">拖拽文件到此处，或</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canWrite ? '支持单个文件上传，上传后存入对象存储并通过代理路由下载' : '当前账号没有上传权限（需要 file:write）'}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => doUpload(e.target.files?.[0])}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={!canWrite || uploading}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? '上传中…' : '上传文件'}
          </Button>
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(f) => f.id}
        loading={loading}
        empty={
          <span className="flex flex-col items-center gap-2">
            <FolderOpen className="h-8 w-8 text-muted-foreground/30" />
            暂无文件，上传第一份资料吧
          </span>
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="删除文件"
        description={`确定删除「${deleting?.fileName}」吗？文件将从对象存储中移除，不可恢复。`}
        confirmText="删除"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
