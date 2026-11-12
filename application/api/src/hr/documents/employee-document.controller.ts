import { includesBranch } from '../../foundation/auth/branch-scope.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { EmployeeService } from '../employees/employee.service.js';
import {
  AttachEmployeeDocumentRequirementDto,
  CreateEmployeeDocumentDto,
} from './employee-document.dto.js';
import { EmployeeDocumentService } from './employee-document.service.js';

const managerRoles = ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;
const selfRoles = ['IT_ADMIN', 'STAFF', 'EMPLOYEE'] as const;
const maxUploadBytes = 10 * 1024 * 1024;
const mimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

type UploadedEmployeeFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('employees/:employeeId/document-records')
export class EmployeeDocumentController {
  constructor(
    private readonly documents: EmployeeDocumentService,
    private readonly employees: EmployeeService,
  ) {}

  @Get()
  async list(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const employee = await this.requireEmployee(employeeId);
    this.requireReadAccess(employee, request);
    return this.documents.list(employeeId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: maxUploadBytes, files: 1 } }),
  )
  async create(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    input: CreateEmployeeDocumentDto,
    @UploadedFile() file?: UploadedEmployeeFile,
  ) {
    const employee = await this.requireEmployee(employeeId);
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (!file) throw new BadRequestException('Select a file to upload.');
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Document upload denied.');
    }
    if (
      user.role !== 'SUPER_ADMIN' &&
      !includesBranch(user, employee.branchId)
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
    if (user.role === 'BRANCH_MANAGER' && !user.branchId) {
      throw new ForbiddenException('Branch assignment required.');
    }
    this.validateFile(file);
    return this.documents.create(
      {
        employeeId,
        requirementId: input.requirementId,
        category: input.category,
        fileName: file.originalname,
        fileSizeBytes: file.size,
        mimeType: file.mimetype,
        fileData: file.buffer,
        uploadedBy: user.userId,
        expirationDate: input.expirationDate ?? null,
      },
      employee.branchId,
    );
  }

  @Patch(':documentId/requirement')
  async attachToRequirement(
    @Param('employeeId') employeeId: string,
    @Param('documentId') documentId: string,
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    input: AttachEmployeeDocumentRequirementDto,
  ) {
    const employee = await this.requireEmployee(employeeId);
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Document upload denied.');
    }
    if (
      user.role !== 'SUPER_ADMIN' &&
      !includesBranch(user, employee.branchId)
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
    if (user.role === 'BRANCH_MANAGER' && !user.branchId) {
      throw new ForbiddenException('Branch assignment required.');
    }
    return this.documents.attachExistingDocument(
      employeeId,
      documentId,
      input.requirementId,
      employee.branchId,
      {
        userId: user.userId,
        ip: request.ip,
        userAgent: request.get('user-agent'),
      },
    );
  }

  @Patch(':documentId/archive')
  async archive(
    @Param('employeeId') employeeId: string,
    @Param('documentId') documentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const employee = await this.requireEmployee(employeeId);
    const user = this.requireManagerAccess(employee, request);
    return this.documents.archiveDocument(
      employeeId,
      documentId,
      employee.branchId,
      {
        userId: user.userId,
        ip: request.ip,
        userAgent: request.get('user-agent'),
      },
    );
  }

  @Patch(':documentId/restore')
  async restore(
    @Param('employeeId') employeeId: string,
    @Param('documentId') documentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const employee = await this.requireEmployee(employeeId);
    const user = this.requireManagerAccess(employee, request);
    return this.documents.restoreDocument(
      employeeId,
      documentId,
      employee.branchId,
      {
        userId: user.userId,
        ip: request.ip,
        userAgent: request.get('user-agent'),
      },
    );
  }

  @Get(':documentId/file')
  async getFile(
    @Param('employeeId') employeeId: string,
    @Param('documentId') documentId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const employee = await this.requireEmployee(employeeId);
    this.requireReadAccess(employee, request);
    const file = await this.documents.getFile(employeeId, documentId);
    if (!file) throw new NotFoundException('Uploaded document not found.');

    const inline =
      file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf';
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    return new StreamableFile(file.data);
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
        throw new ForbiddenException('You can only view your own documents.');
      }
      return;
    }
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Employee document access denied.');
    }
    if (
      user.role === 'BRANCH_MANAGER' &&
      (!user.branchId || !includesBranch(user, employee.branchId))
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
    if (
      user.role === 'HR_ADMIN' &&
      !includesBranch(user, employee.branchId)
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
  }

  private requireManagerAccess(
    employee: { branchId: string },
    request: AuthenticatedRequest,
  ) {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Document management denied.');
    }
    if (
      user.role !== 'SUPER_ADMIN' &&
      !includesBranch(user, employee.branchId)
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
    if (user.role === 'BRANCH_MANAGER' && !user.branchId) {
      throw new ForbiddenException('Branch assignment required.');
    }
    return user;
  }

  private validateFile(file: UploadedEmployeeFile): void {
    const extension = file.originalname
      .slice(file.originalname.lastIndexOf('.'))
      .toLowerCase();
    const expectedMime = mimeByExtension[extension];
    if (!expectedMime || file.mimetype !== expectedMime) {
      throw new BadRequestException(
        'Use an image, PDF, or DOCX file with a matching file type.',
      );
    }

    const bytes = file.buffer;
    const isValidSignature =
      (expectedMime === 'application/pdf' &&
        bytes.subarray(0, 5).toString() === '%PDF-') ||
      (expectedMime === 'image/png' &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (expectedMime === 'image/jpeg' &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff) ||
      (expectedMime === 'image/gif' &&
        /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) ||
      (expectedMime === 'image/webp' &&
        bytes.subarray(0, 4).toString() === 'RIFF' &&
        bytes.subarray(8, 12).toString() === 'WEBP') ||
      (expectedMime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])));

    if (!isValidSignature) {
      throw new BadRequestException(
        'The file contents do not match the selected file type.',
      );
    }
  }
}
