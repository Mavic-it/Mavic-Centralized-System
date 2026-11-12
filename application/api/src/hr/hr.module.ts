import { LeaveService } from './leaves/leave.service.js';
import { LeaveController } from './leaves/leave.controller.js';
import { LeaveAllocator } from './leaves/leave.allocator.js';
import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { FoundationModule } from '../foundation/foundation.module.js';
import { EmailModule } from '../email/email.module.js';
import { EmailService } from '../email/email.service.js';
import { EmployeeController } from './employees/employee.controller.js';
import { EmployeeService } from './employees/employee.service.js';
import { EmployeeProfilePictureController } from './employees/employee-profile-picture.controller.js';
import { EmployeeProfilePictureService } from './employees/employee-profile-picture.service.js';
import { EmployeeHrProfileController } from './employees/employee-hr-profile.controller.js';
import { EmployeeHrProfileService } from './employees/employee-hr-profile.service.js';
import { AttendanceController } from './attendance/attendance.controller.js';
import { AttendanceService } from './attendance/attendance.service.js';
import { DtrController } from './attendance/dtr.controller.js';
import { DtrService } from './attendance/dtr.service.js';
import { OfficialBusinessService } from './attendance/official-business/ob.service.js';
import { OfficialBusinessController } from './attendance/official-business/ob.controller.js';
import { EmployeeDocumentController } from './documents/employee-document.controller.js';
import { EmployeeDocumentService } from './documents/employee-document.service.js';
import { EmployeeWorkflowController } from './employees/employee-workflow.controller.js';
import { EmployeeDocumentRequirementController } from './documents/employee-document-requirement.controller.js';

@Module({
  imports: [FoundationModule, EmailModule],
  controllers: [
    OfficialBusinessController,
    LeaveController,
    EmployeeController,
    EmployeeProfilePictureController,
    EmployeeHrProfileController,
    AttendanceController,
    DtrController,
    EmployeeDocumentController,
    EmployeeWorkflowController,
    EmployeeDocumentRequirementController,
  ],
  providers: [
    {provide:OfficialBusinessService,useFactory:(db:DataSource,dtr:DtrService)=>new OfficialBusinessService(db,dtr),inject:[getDataSourceToken(),DtrService]},
    {
      provide: LeaveService,
      useFactory: (db: DataSource, email: EmailService) =>
        new LeaveService(db, email),
      inject: [getDataSourceToken(), EmailService],
    },
    {
      provide: LeaveAllocator,
      useFactory: (leave: LeaveService) => new LeaveAllocator(leave),
      inject: [LeaveService],
    },
    {
      provide: DtrService,
      useFactory: (dataSource: DataSource) => new DtrService(dataSource),
      inject: [getDataSourceToken()],
    },
    {
      provide: EmployeeService,
      useFactory: (dataSource: DataSource) => new EmployeeService(dataSource),
      inject: [getDataSourceToken()],
    },
    {
      provide: EmployeeProfilePictureService,
      useFactory: (dataSource: DataSource) =>
        new EmployeeProfilePictureService(dataSource),
      inject: [getDataSourceToken()],
    },
    {
      provide: EmployeeHrProfileService,
      useFactory: (dataSource: DataSource) =>
        new EmployeeHrProfileService(dataSource),
      inject: [getDataSourceToken()],
    },
    {
      provide: AttendanceService,
      useFactory: (dataSource: DataSource) => new AttendanceService(dataSource),
      inject: [getDataSourceToken()],
    },
    {
      provide: EmployeeDocumentService,
      useFactory: (dataSource: DataSource) =>
        new EmployeeDocumentService(dataSource),
      inject: [getDataSourceToken()],
    },
  ],
  exports: [
    EmployeeService,
    EmployeeHrProfileService,
    AttendanceService,
    EmployeeDocumentService,
  ],
})
export class HrModule {}
