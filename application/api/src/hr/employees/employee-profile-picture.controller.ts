import { includesBranch } from '../../foundation/auth/branch-scope.js';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { EmployeeService } from './employee.service.js';
import { EmployeeProfilePictureService } from './employee-profile-picture.service.js';

const managerRoles = ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;
const selfRoles = ['IT_ADMIN', 'STAFF', 'EMPLOYEE'] as const;
const maxUploadBytes = 5 * 1024 * 1024;

type UploadedProfilePicture = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('employees/:employeeId/profile-picture')
export class EmployeeProfilePictureController {
  constructor(
    private readonly pictures: EmployeeProfilePictureService,
    private readonly employees: EmployeeService,
  ) {}

  @Get()
  async get(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const employee = await this.requireEmployee(employeeId);
    this.requireReadAccess(employee, request);
    const picture = await this.pictures.get(employeeId);
    if (!picture) throw new NotFoundException('Profile picture not found.');

    response.setHeader('Content-Type', picture.mimeType);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    return new StreamableFile(picture.data);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: maxUploadBytes, files: 1 },
    }),
  )
  async upload(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file?: UploadedProfilePicture,
  ): Promise<{ profilePictureUpdatedAt: string }> {
    const employee = await this.requireEmployee(employeeId);
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    this.requireWriteAccess(employee, request);
    if (!file) throw new BadRequestException('Select a profile picture.');
    this.validateFile(file);

    const result = await this.pictures.save(
      employee.id,
      employee.branchId,
      user.userId,
      file.mimetype,
      file.buffer,
    );
    return { profilePictureUpdatedAt: result.updatedAt };
  }

  private async requireEmployee(employeeId: string) {
    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  private requireReadAccess(
    employee: { branchId: string; email: string },
    request: AuthenticatedRequest,
  ): void {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if ((selfRoles as readonly string[]).includes(user.role)) {
      if (user.email.toLowerCase() !== employee.email.toLowerCase()) {
        throw new ForbiddenException('Employee profile picture access denied.');
      }
      return;
    }
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Employee profile picture access denied.');
    }
    if (
      user.role === 'BRANCH_MANAGER' &&
      (!user.branchId || !includesBranch(user, employee.branchId))
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
    if (
      user.role === 'HR_ADMIN' &&
      user.branchId &&
      !includesBranch(user, employee.branchId)
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
  }

  private requireWriteAccess(
    employee: { branchId: string; email: string },
    request: AuthenticatedRequest,
  ): void {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if ((selfRoles as readonly string[]).includes(user.role)) {
      if (user.email.toLowerCase() !== employee.email.toLowerCase()) {
        throw new ForbiddenException('You can only update your own picture.');
      }
      return;
    }
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Profile picture upload denied.');
    }
    if (
      user.role === 'BRANCH_MANAGER' &&
      (!user.branchId || !includesBranch(user, employee.branchId))
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
    if (
      user.role === 'HR_ADMIN' &&
      user.branchId &&
      !includesBranch(user, employee.branchId)
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
  }

  private validateFile(file: UploadedProfilePicture): void {
    const bytes = file.buffer;
    const isPng =
      file.mimetype === 'image/png' &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg =
      file.mimetype === 'image/jpeg' &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
    const isWebp =
      file.mimetype === 'image/webp' &&
      bytes.subarray(0, 4).toString() === 'RIFF' &&
      bytes.subarray(8, 12).toString() === 'WEBP';

    if (!isPng && !isJpeg && !isWebp) {
      throw new BadRequestException(
        'Use a valid PNG, JPEG, or WebP image for the profile picture.',
      );
    }
  }
}
