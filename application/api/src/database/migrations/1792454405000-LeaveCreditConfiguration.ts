import type { MigrationInterface, QueryRunner } from 'typeorm';
import { leaveDefinitions } from './leave-definitions.snapshot.js';
export class LeaveCreditConfiguration1792454405000 implements MigrationInterface {
  name = 'LeaveCreditConfiguration1792454405000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(
      `CREATE TABLE leave_type_definitions(code varchar(30) PRIMARY KEY,name varchar(150) NOT NULL,classification varchar(20) NOT NULL CHECK(classification IN ('COMPANY','STATUTORY')),default_mode varchar(20) NOT NULL CHECK(default_mode IN ('LEDGER','EVENT','UNLIMITED')),active boolean NOT NULL DEFAULT true,legal_source text,updated_by varchar(100) REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now());`,
    );
    for (const d of leaveDefinitions)
      await r.query(
        `INSERT INTO leave_type_definitions(code,name,classification,default_mode,legal_source) VALUES($1,$2,$3,$4,$5)`,
        [
          d.code,
          d.name,
          d.classification,
          d.mode,
          d.classification === 'STATUTORY'
            ? 'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf'
            : null,
        ],
      );
    await r.query(`ALTER TABLE leave_policies DROP CONSTRAINT leave_policies_type_check;
      ALTER TABLE leave_credit_ledger DROP CONSTRAINT leave_credit_ledger_type_check;
      ALTER TABLE leave_request_days DROP CONSTRAINT leave_request_days_type_check;
      DROP INDEX IF EXISTS leave_policies_global_effective_uidx;
      DROP INDEX IF EXISTS leave_policies_branch_effective_uidx;
      DO $$ DECLARE idx record; BEGIN FOR idx IN
        SELECT ci.relname FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class ci ON ci.oid=i.indexrelid
        WHERE n.nspname=current_schema() AND t.relname='leave_policies' AND i.indisunique AND NOT i.indisprimary
          AND (pg_get_indexdef(i.indexrelid) LIKE '%(branch_id, leave_type, effective_from)%' OR pg_get_indexdef(i.indexrelid) LIKE '%(leave_type, effective_from)%')
        LOOP EXECUTE format('DROP INDEX %I.%I',current_schema(),idx.relname); END LOOP; END $$;

      ALTER TABLE leave_policies ADD COLUMN configuration jsonb NOT NULL DEFAULT '{}',ADD COLUMN version integer NOT NULL DEFAULT 1;
      ALTER TABLE leave_policies ADD CONSTRAINT leave_policies_catalog_fk FOREIGN KEY(leave_type) REFERENCES leave_type_definitions(code);
      ALTER TABLE leave_requests ADD COLUMN policy_version integer,ADD COLUMN policy_snapshot jsonb,ADD COLUMN credit_mode varchar(20),ADD COLUMN credit_account varchar(30),ADD COLUMN entitlement_id varchar(100);
      ALTER TABLE leave_credit_ledger ADD COLUMN policy_id varchar(100) REFERENCES leave_policies(id),ADD COLUMN policy_version integer,ADD COLUMN expires_on date,ADD COLUMN grant_from date,ADD COLUMN grant_to date,ADD COLUMN expiry_processed boolean NOT NULL DEFAULT false,ADD COLUMN idempotency_key varchar(36);
      CREATE UNIQUE INDEX leave_credit_manual_retry_key ON leave_credit_ledger(created_by,idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE TABLE leave_policy_versions(policy_id varchar(100) NOT NULL REFERENCES leave_policies(id),version integer NOT NULL,snapshot jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(policy_id,version));
      INSERT INTO leave_policy_versions(policy_id,version,snapshot) SELECT id,version,to_jsonb(p) FROM leave_policies p;
      CREATE FUNCTION leave_policy_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF TG_OP='UPDATE' THEN NEW.version=OLD.version+1; END IF; RETURN NEW; END $$;
      CREATE TRIGGER leave_policy_revision_before BEFORE UPDATE ON leave_policies FOR EACH ROW EXECUTE FUNCTION leave_policy_revision();
      CREATE FUNCTION leave_policy_record_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO leave_policy_versions(policy_id,version,snapshot) VALUES(NEW.id,NEW.version,to_jsonb(NEW)); RETURN NEW; END $$;
      CREATE TRIGGER leave_policy_revision_after AFTER INSERT OR UPDATE ON leave_policies FOR EACH ROW EXECUTE FUNCTION leave_policy_record_revision();
      CREATE TABLE leave_entitlement_reviews(id varchar(100) PRIMARY KEY,employee_id varchar(100) NOT NULL REFERENCES employees(id),branch_id varchar(100) NOT NULL REFERENCES branches(id),leave_type varchar(30) NOT NULL REFERENCES leave_type_definitions(code),event_key varchar(150) NOT NULL,valid_from date NOT NULL,valid_to date NOT NULL,days numeric(8,2) NOT NULL CHECK(days>0 AND days<=366),facts jsonb NOT NULL,reason varchar(500) NOT NULL,verified_by varchar(100) NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK(valid_to>=valid_from),UNIQUE(employee_id,leave_type,event_key));
      ALTER TABLE leave_requests ADD CONSTRAINT leave_request_entitlement_fk FOREIGN KEY(entitlement_id) REFERENCES leave_entitlement_reviews(id);
      CREATE INDEX leave_entitlement_lookup ON leave_entitlement_reviews(employee_id,leave_type,valid_from,valid_to);
      CREATE TABLE leave_allocation_runs(id varchar(100) PRIMARY KEY,actor_id varchar(100) NOT NULL REFERENCES users(id),branch_id varchar(100) REFERENCES branches(id),as_of date NOT NULL,reason varchar(500) NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Use a forward migration; preserve policy versions, grants and entitlement history.',
    );
  }
}
