import type { DbBundle } from '../db/index.js'
import { StudentRepo } from './student.js'
import { TeacherRepo } from './teacher.js'
import { CourseRepo } from './course.js'
import { ClassRepo } from './class.js'
import { ScheduleRepo } from './schedule.js'
import { AttendanceRepo } from './attendance.js'
import { GradeRepo } from './grade.js'
import { OrderRepo } from './order.js'
import { FileRepo } from './file.js'
import { TermRepo } from './term.js'
import { ScheduleExceptionRepo } from './scheduleException.js'
import { DashboardService } from '../service/dashboard.js'

/**
 * 服务容器：一次性构造所有仓储 + 聚合服务，注入 Hono 路由的 deps。
 * 单例（进程级），由 server 启动时构造。
 */
export class Services {
  readonly student: StudentRepo
  readonly teacher: TeacherRepo
  readonly course: CourseRepo
  readonly klass: ClassRepo
  readonly schedule: ScheduleRepo
  readonly attendance: AttendanceRepo
  readonly grade: GradeRepo
  readonly order: OrderRepo
  readonly file: FileRepo
  readonly term: TermRepo
  readonly scheduleException: ScheduleExceptionRepo
  readonly dashboard: DashboardService

  constructor(bundle: DbBundle) {
    this.student = new StudentRepo(bundle)
    this.teacher = new TeacherRepo(bundle)
    this.course = new CourseRepo(bundle)
    this.klass = new ClassRepo(bundle)
    this.schedule = new ScheduleRepo(bundle)
    this.attendance = new AttendanceRepo(bundle)
    this.grade = new GradeRepo(bundle)
    this.order = new OrderRepo(bundle)
    this.file = new FileRepo(bundle)
    this.term = new TermRepo(bundle)
    this.scheduleException = new ScheduleExceptionRepo(bundle, this.schedule, this.term)
    this.dashboard = new DashboardService(this, bundle)
  }
}
