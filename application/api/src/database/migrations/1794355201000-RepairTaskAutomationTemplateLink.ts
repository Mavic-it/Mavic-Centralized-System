import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Repairs databases that recorded TaskAutomation before work_tasks.template_id was added. */
export class RepairTaskAutomationTemplateLink1794355201000
  implements MigrationInterface
{
  name = 'RepairTaskAutomationTemplateLink1794355201000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      ALTER TABLE work_tasks
        ADD COLUMN IF NOT EXISTS template_id uuid
          REFERENCES work_task_templates(id) ON DELETE SET NULL
    `);
  }

  async down(): Promise<void> {
    throw new Error('Preserve task template links with a forward migration.');
  }
}
