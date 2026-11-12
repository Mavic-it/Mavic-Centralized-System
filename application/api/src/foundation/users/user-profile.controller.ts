import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.context.js';
import { UpdateOwnUserProfileDto } from './user-profile.dto.js';
import { UserProfileService } from './user-profile.service.js';

const maxUploadBytes = 5 * 1024 * 1024;

type UploadedProfilePicture = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('users/me')
export class UserProfileController {
  constructor(private readonly profiles: UserProfileService) {}

  @Get('profile')
  getOwnProfile(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.getOwnProfile(this.requireUserId(request));
  }

  @Patch('profile')
  updateOwnProfile(
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: UpdateOwnUserProfileDto,
  ) {
    return this.profiles.updateOwnProfile(
      this.requireUserId(request),
      input,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
    );
  }

  @Get('profile-picture')
  async getProfilePicture(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const picture = await this.profiles.getProfilePicture(
      this.requireUserId(request),
    );
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

  @Post('profile-picture')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: maxUploadBytes, files: 1 },
    }),
  )
  async uploadProfilePicture(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file?: UploadedProfilePicture,
  ): Promise<{ profilePictureUpdatedAt: string }> {
    if (!file) throw new BadRequestException('Select a profile picture.');
    this.validateFile(file);
    return this.profiles.saveProfilePicture(
      this.requireUserId(request),
      file.mimetype,
      file.buffer,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
    );
  }

  @Delete('profile-picture')
  deleteProfilePicture(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ removed: true }> {
    return this.profiles.deleteProfilePicture(this.requireUserId(request), {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication required.');
    return user.userId;
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
