import { Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';

export type SettingValue = string | number | boolean | null;

export type BranchSettings = Record<string, SettingValue>;

type SettingRow = { settingValue: SettingValue };

@Injectable()
export class SettingsService {
  constructor(private readonly dataSource: DataSource) {}

  async get(branchId: string, key: string): Promise<SettingValue | undefined> {
    const rows = await this.dataSource.query<SettingRow[]>(
      `SELECT setting_value AS "settingValue"
       FROM branch_settings
       WHERE branch_id = $1 AND setting_key = $2`,
      [branchId, key],
    );
    return rows[0]?.settingValue;
  }

  async set(
    branchId: string,
    key: string,
    value: SettingValue,
  ): Promise<BranchSettings> {
    await this.dataSource.query(
      `INSERT INTO branch_settings (branch_id, setting_key, setting_value)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (branch_id, setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value`,
      [branchId, key, JSON.stringify(value)],
    );
    const rows = await this.dataSource.query<
      Array<{ settingKey: string; settingValue: SettingValue }>
    >(
      `SELECT setting_key AS "settingKey", setting_value AS "settingValue"
       FROM branch_settings
       WHERE branch_id = $1
       ORDER BY setting_key`,
      [branchId],
    );
    return Object.fromEntries(
      rows.map((row) => [row.settingKey, row.settingValue]),
    );
  }
}
