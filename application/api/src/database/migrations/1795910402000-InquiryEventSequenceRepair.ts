import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryEventSequenceRepair1795910402000 implements MigrationInterface {
  name = 'InquiryEventSequenceRepair1795910402000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS inquiry_events_sequence_seq;
      ALTER TABLE inquiry_events ADD COLUMN IF NOT EXISTS sequence bigint;
      WITH ordered AS (
        SELECT id,row_number() OVER(ORDER BY created_at,id) AS value
        FROM inquiry_events WHERE sequence IS NULL
      )
      UPDATE inquiry_events e SET sequence=ordered.value
      FROM ordered WHERE ordered.id=e.id;
      SELECT setval(
        'inquiry_events_sequence_seq',
        GREATEST(COALESCE((SELECT max(sequence) FROM inquiry_events),1),1),
        COALESCE((SELECT max(sequence) FROM inquiry_events),0)>0
      );
      ALTER SEQUENCE inquiry_events_sequence_seq OWNED BY inquiry_events.sequence;
      ALTER TABLE inquiry_events ALTER COLUMN sequence SET DEFAULT nextval('inquiry_events_sequence_seq');
      ALTER TABLE inquiry_events ALTER COLUMN sequence SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS inquiry_events_sequence_uq ON inquiry_events(sequence);
    `);
  }

  async down(): Promise<void> {
    throw new Error('Inquiry history sequence repair is intentionally retained.');
  }
}
