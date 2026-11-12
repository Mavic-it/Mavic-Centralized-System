import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMspacesSchema1760000000000 implements MigrationInterface {
  name = 'InitialMspacesSchema1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id varchar(100) PRIMARY KEY,
        name varchar(200) NOT NULL,
        code varchar(50) NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id varchar(100) PRIMARY KEY,
        email varchar(320) NOT NULL UNIQUE,
        name varchar(200) NOT NULL,
        password_hash text,
        role varchar(50) NOT NULL,
        branch_id varchar(100) REFERENCES branches(id) ON DELETE SET NULL,
        status varchar(20) NOT NULL DEFAULT 'PENDING'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        name varchar(200) NOT NULL,
        email varchar(320) NOT NULL,
        position varchar(150) NOT NULL,
        department varchar(150) NOT NULL,
        status varchar(20) NOT NULL,
        employment jsonb NOT NULL,
        emergency_contact jsonb,
        government_ids jsonb,
        documents jsonb,
        salary numeric(12, 2)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id varchar(100) PRIMARY KEY,
        employee_id varchar(100) NOT NULL REFERENCES employees(id),
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        type varchar(30) NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        reason text NOT NULL,
        status varchar(30) NOT NULL,
        approvals jsonb NOT NULL DEFAULT '[]',
        attachment_url text
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        name varchar(200) NOT NULL,
        floor varchar(50) NOT NULL,
        capacity integer NOT NULL,
        status varchar(30) NOT NULL,
        amenities jsonb NOT NULL DEFAULT '[]'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        room_id varchar(100) NOT NULL REFERENCES rooms(id),
        employee_id varchar(100) NOT NULL REFERENCES employees(id),
        status varchar(30) NOT NULL,
        start_date_time timestamptz NOT NULL,
        end_date_time timestamptz NOT NULL,
        purpose text NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        name varchar(200) NOT NULL,
        email varchar(320) NOT NULL,
        phone varchar(50) NOT NULL,
        source varchar(30) NOT NULL,
        status varchar(30) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        customer_id varchar(100) NOT NULL REFERENCES customers(id),
        assigned_staff_id varchar(100) NOT NULL,
        space_interest text NOT NULL,
        budget numeric(12, 2) NOT NULL,
        status varchar(30) NOT NULL,
        notes text NOT NULL,
        follow_ups jsonb NOT NULL DEFAULT '[]'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        category varchar(100) NOT NULL,
        name varchar(200) NOT NULL,
        sku varchar(100) NOT NULL UNIQUE,
        stock_on_hand integer NOT NULL DEFAULT 0,
        unit varchar(50) NOT NULL,
        status varchar(30) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        asset_type varchar(30) NOT NULL,
        name varchar(200) NOT NULL,
        serial_number varchar(150) NOT NULL UNIQUE,
        status varchar(30) NOT NULL,
        assigned_to_employee_id varchar(100) REFERENCES employees(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id varchar(100) PRIMARY KEY,
        user_id varchar(100) NOT NULL REFERENCES users(id),
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        title varchar(200) NOT NULL,
        message text NOT NULL,
        type varchar(20) NOT NULL,
        read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id varchar(100) PRIMARY KEY,
        user_id varchar(100) NOT NULL REFERENCES users(id),
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        action varchar(100) NOT NULL,
        resource varchar(200) NOT NULL,
        details text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS branch_settings (
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        setting_key varchar(200) NOT NULL,
        setting_value jsonb,
        PRIMARY KEY (branch_id, setting_key)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS employees_branch_id_idx ON employees(branch_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS rooms_branch_id_idx ON rooms(branch_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS customers_branch_id_idx ON customers(branch_id)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS notifications_user_id_read_idx ON notifications(user_id, read)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS audit_logs_branch_id_created_at_idx ON audit_logs(branch_id, created_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS branch_settings');
    await queryRunner.query('DROP TABLE IF EXISTS audit_logs');
    await queryRunner.query('DROP TABLE IF EXISTS notifications');
    await queryRunner.query('DROP TABLE IF EXISTS assets');
    await queryRunner.query('DROP TABLE IF EXISTS inventory_items');
    await queryRunner.query('DROP TABLE IF EXISTS inquiries');
    await queryRunner.query('DROP TABLE IF EXISTS customers');
    await queryRunner.query('DROP TABLE IF EXISTS reservations');
    await queryRunner.query('DROP TABLE IF EXISTS rooms');
    await queryRunner.query('DROP TABLE IF EXISTS leave_requests');
    await queryRunner.query('DROP TABLE IF EXISTS employees');
    await queryRunner.query('DROP TABLE IF EXISTS users');
    await queryRunner.query('DROP TABLE IF EXISTS branches');
  }
}
