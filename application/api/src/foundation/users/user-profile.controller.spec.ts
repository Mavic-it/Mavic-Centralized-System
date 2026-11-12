import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../auth/auth.context.js';
import { UserProfileController } from './user-profile.controller.js';
import type { UserProfileService } from './user-profile.service.js';

describe('UserProfileController self-service identity', () => {
  it('uses the authenticated account ID for profile reads', async () => {
    const getOwnProfile = vi.fn().mockResolvedValue({ mode: 'independent' });
    const controller = new UserProfileController({
      getOwnProfile,
    } as unknown as UserProfileService);

    await controller.getOwnProfile({
      user: {
        userId: 'authenticated-user',
        email: 'admin@example.test',
        role: 'SUPER_ADMIN',
        branchId: null,
      },
    } as AuthenticatedRequest);

    expect(getOwnProfile).toHaveBeenCalledWith('authenticated-user');
  });

  it('rejects requests without an authenticated account', async () => {
    const getOwnProfile = vi.fn();
    const controller = new UserProfileController({
      getOwnProfile,
    } as unknown as UserProfileService);

    expect(() => controller.getOwnProfile({} as AuthenticatedRequest)).toThrow(
      UnauthorizedException,
    );
    expect(getOwnProfile).not.toHaveBeenCalled();
  });

  it('rejects image payloads whose bytes do not match their claimed type', async () => {
    const saveProfilePicture = vi.fn();
    const controller = new UserProfileController({
      saveProfilePicture,
    } as unknown as UserProfileService);

    await expect(
      controller.uploadProfilePicture(
        {
          user: {
            userId: 'authenticated-user',
            email: 'admin@example.test',
            role: 'SUPER_ADMIN',
            branchId: null,
          },
        } as AuthenticatedRequest,
        {
          originalname: 'photo.png',
          mimetype: 'image/png',
          size: 8,
          buffer: Buffer.from('not an image'),
        },
      ),
    ).rejects.toThrow('Use a valid PNG, JPEG, or WebP image for the profile picture.');
    expect(saveProfilePicture).not.toHaveBeenCalled();
  });
});
