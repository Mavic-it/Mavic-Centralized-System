import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { DataSource } from 'typeorm';
import { defaultUserAppearancePreferences, UserService } from './user.service.js';
import { UpdateUserPreferencesDto } from './user-preferences.dto.js';

describe('UserService appearance preferences', () => {
  it.each(['red', 'green'] as const)('accepts the %s palette', (accentColor) => {
    const dto = plainToInstance(UpdateUserPreferencesDto, { ...defaultUserAppearancePreferences, accentColor });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects an unregistered palette', () => {
    const dto = plainToInstance(UpdateUserPreferencesDto, { ...defaultUserAppearancePreferences, accentColor: '#00ff00' });
    expect(validateSync(dto).some((error) => error.property === 'accentColor')).toBe(true);
  });

  it('returns independent defaults for users without a saved row', async () => {
    const service = new UserService();
    expect(await service.getAppearancePreferences('user-a')).toEqual(defaultUserAppearancePreferences);
    await service.saveAppearancePreferences('user-a', { ...defaultUserAppearancePreferences, accentColor: 'purple' });
    expect(await service.getAppearancePreferences('user-a')).toMatchObject({ accentColor: 'purple' });
    expect(await service.getAppearancePreferences('user-b')).toEqual(defaultUserAppearancePreferences);
  });

  it('reads and writes only the authenticated user key using parameterized queries', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ ...defaultUserAppearancePreferences, accentColor: 'teal' }])
      .mockResolvedValueOnce([{ ...defaultUserAppearancePreferences, accentColor: 'purple' }]);
    const service = new UserService({ query } as unknown as DataSource);
    await expect(service.getAppearancePreferences('user-a')).resolves.toMatchObject({ accentColor: 'teal' });
    await service.saveAppearancePreferences('user-b', { ...defaultUserAppearancePreferences, accentColor: 'purple' });
    expect(query.mock.calls[0][0]).toContain('WHERE user_id = $1');
    expect(query.mock.calls[0][1]).toEqual(['user-a']);
    expect(query.mock.calls[1][0]).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(query.mock.calls[1][1]).toEqual(['user-b', 'light', 'purple', 'default', 'default', 'default', 'comfortable']);
  });

  it('removes only the requested user override on reset', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new UserService({ query } as unknown as DataSource);
    await service.deleteAppearancePreferences('user-a');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM user_appearance_preferences WHERE user_id = $1'), ['user-a']);
  });
});
