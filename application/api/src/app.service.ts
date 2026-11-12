import { Injectable } from '@nestjs/common';

export type MSpacesOverview = {
  system: string;
  architecture: string;
  modules: string[];
  roles: string[];
  phasePlan: string[];
  mvpScope: string[];
};

@Injectable()
export class AppService {
  getHello(): string {
    return 'MSPACES API is running';
  }

  getOverview(): MSpacesOverview {
    return {
      system: 'MSPACES Centralized Management System',
      architecture:
        'One centralized application serving all Mspaces branches with branch-scoped access, common shared services, and centralized PostgreSQL persistence.',
      modules: [
        'Authentication & User Management',
        'Employee Management / 201 File',
        'Room / Workspace Management',
        'Reservations / Booking',
        'Inquiry / CRM',
        'Inventory Management',
        'Asset Management',
        'Notifications',
        'Reports & Analytics',
        'Audit & Security',
        'System Administration',
      ],
      roles: [
        'SUPER_ADMIN',
        'IT_ADMIN',
        'HR_ADMIN',
        'BRANCH_MANAGER',
        'STAFF',
        'EMPLOYEE',
      ],
      phasePlan: [
        'Phase 1 — Foundation',
        'Phase 2 — HR',
        'Phase 3 — Operations',
        'Phase 4 — CRM',
        'Phase 5 — Inventory & IT Assets',
        'Phase 6 — Reporting',
        'Phase 7 — Advanced',
      ],
      mvpScope: [
        'Authentication',
        'Users',
        'Roles',
        'Permissions',
        'Branches',
        'Employees',
        '201 File',
        'Audit logs',
      ],
    };
  }
}
