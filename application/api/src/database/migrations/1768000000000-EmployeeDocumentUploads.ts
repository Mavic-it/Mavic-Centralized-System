import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeDocumentUploads1768000000000 implements MigrationInterface {
  name = 'EmployeeDocumentUploads1768000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employee_documents
        ADD COLUMN document_category varchar(30) NOT NULL DEFAULT 'CONTRACT_RECORD',
        ADD COLUMN mime_type varchar(150),
        ADD COLUMN file_data bytea,
        ADD CONSTRAINT employee_documents_category_check
          CHECK (document_category IN ('GOVERNMENT_ID', 'CONTRACT_RECORD'))
    `);
    await queryRunner.query(`
      CREATE INDEX employee_documents_employee_category_created_idx
      ON employee_documents(employee_id, document_category, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS employee_documents_employee_category_created_idx',
    );
    await queryRunner.query(`
      ALTER TABLE employee_documents
        DROP CONSTRAINT IF EXISTS employee_documents_category_check,
        DROP COLUMN IF EXISTS file_data,
        DROP COLUMN IF EXISTS mime_type,
        DROP COLUMN IF EXISTS document_category
    `);
  }
}
