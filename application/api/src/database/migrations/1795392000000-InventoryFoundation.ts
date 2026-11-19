import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Add a shared catalog, branch balances, and immutable movement history. */
export class InventoryFoundation1795392000000 implements MigrationInterface {
  name = 'InventoryFoundation1795392000000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      CREATE TABLE IF NOT EXISTS inventory_categories (
        id varchar(100) PRIMARY KEY,
        name varchar(120) NOT NULL,
        description text,
        is_active boolean NOT NULL DEFAULT true,
        created_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (length(trim(name)) > 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS inventory_categories_name_unique
        ON inventory_categories(lower(trim(name)));

      CREATE TABLE IF NOT EXISTS inventory_catalog_items (
        id varchar(100) PRIMARY KEY,
        name varchar(200) NOT NULL,
        sku varchar(100) NOT NULL UNIQUE,
        description text,
        category_id varchar(100) NOT NULL REFERENCES inventory_categories(id),
        item_type varchar(40) NOT NULL DEFAULT 'CONSUMABLE'
          CHECK (item_type IN ('CONSUMABLE','EQUIPMENT','FURNITURE','TOOL','ASSET','SPARE_PART','OTHER')),
        tracking_method varchar(40) NOT NULL DEFAULT 'QUANTITY'
          CHECK (tracking_method IN ('QUANTITY','SERIALIZED','BATCH','EXPIRATION','REUSABLE','RESERVABLE')),
        unit varchar(50) NOT NULL,
        reorder_threshold integer NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
        maximum_stock_threshold integer CHECK (maximum_stock_threshold IS NULL OR maximum_stock_threshold >= 0),
        purchase_price numeric(12,2) CHECK (purchase_price IS NULL OR purchase_price >= 0),
        status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
        created_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        updated_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (length(trim(name)) > 0),
        CHECK (length(trim(sku)) > 0),
        CHECK (length(trim(unit)) > 0)
      );
      CREATE INDEX IF NOT EXISTS inventory_catalog_items_category_status_idx
        ON inventory_catalog_items(category_id, status, name);

      CREATE TABLE IF NOT EXISTS inventory_balances (
        item_id varchar(100) NOT NULL REFERENCES inventory_catalog_items(id),
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        storage_location varchar(200) NOT NULL DEFAULT '',
        on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
        reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
        quarantined integer NOT NULL DEFAULT 0 CHECK (quarantined >= 0),
        in_transit integer NOT NULL DEFAULT 0 CHECK (in_transit >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (item_id, branch_id, storage_location),
        CHECK (reserved + quarantined <= on_hand)
      );
      CREATE INDEX IF NOT EXISTS inventory_balances_branch_item_idx
        ON inventory_balances(branch_id, item_id);

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id varchar(100) PRIMARY KEY,
        idempotency_key varchar(200) NOT NULL UNIQUE,
        item_id varchar(100) NOT NULL REFERENCES inventory_catalog_items(id),
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        storage_location varchar(200) NOT NULL DEFAULT '',
        movement_type varchar(30) NOT NULL
          CHECK (movement_type IN ('OPENING','RECEIPT','ISSUE','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN','RETURN','RESERVATION','RELEASE','COUNT_ADJUSTMENT','DISPOSAL','REVERSAL')),
        quantity integer NOT NULL CHECK (quantity > 0),
        quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
        on_hand_before integer NOT NULL CHECK (on_hand_before >= 0),
        on_hand_after integer NOT NULL CHECK (on_hand_after >= 0),
        reason text NOT NULL,
        reference_id varchar(100),
        performed_by varchar(100) REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (on_hand_after = on_hand_before + quantity_delta),
        CHECK (abs(quantity_delta) = quantity)
      );
      CREATE INDEX IF NOT EXISTS inventory_movements_branch_created_idx
        ON inventory_movements(branch_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS inventory_movements_item_created_idx
        ON inventory_movements(item_id, created_at DESC);
      CREATE OR REPLACE FUNCTION reject_inventory_movement_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Posted inventory movements are immutable; record a reversal instead.';
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS inventory_movements_immutable ON inventory_movements;
      CREATE TRIGGER inventory_movements_immutable
        BEFORE UPDATE OR DELETE ON inventory_movements
        FOR EACH ROW EXECUTE FUNCTION reject_inventory_movement_mutation();

      CREATE TABLE IF NOT EXISTS inventory_audit_logs (
        id varchar(100) PRIMARY KEY,
        user_id varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        branch_id varchar(100) REFERENCES branches(id) ON DELETE SET NULL,
        action varchar(50) NOT NULL,
        resource_id varchar(100) NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS inventory_audit_logs_resource_created_idx
        ON inventory_audit_logs(resource_id, created_at DESC);

      WITH normalized AS (
        SELECT DISTINCT ON (lower(trim(category)))
          'legacy-category-' || md5(lower(COALESCE(NULLIF(trim(category), ''), 'Uncategorized'))) AS id,
          COALESCE(NULLIF(min(trim(category)) OVER (PARTITION BY lower(trim(category))), ''), 'Uncategorized') AS name
        FROM inventory_items
        ORDER BY lower(trim(category)), id
      )
      INSERT INTO inventory_categories(id, name)
      SELECT id, name FROM normalized
      ON CONFLICT DO NOTHING;

      INSERT INTO inventory_catalog_items(
        id,name,sku,category_id,item_type,tracking_method,unit,reorder_threshold,status,created_at,updated_at
      )
      SELECT ii.id, ii.name, ii.sku,
        'legacy-category-' || md5(lower(COALESCE(NULLIF(trim(ii.category), ''), 'Uncategorized'))),
        'CONSUMABLE','QUANTITY',ii.unit,0,
        CASE WHEN ii.status='DISCONTINUED' THEN 'INACTIVE' ELSE 'ACTIVE' END,
        now(),now()
      FROM inventory_items ii
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO inventory_balances(item_id,branch_id,on_hand)
      SELECT ii.id,ii.branch_id,ii.stock_on_hand FROM inventory_items ii
      ON CONFLICT (item_id,branch_id,storage_location) DO NOTHING;

      INSERT INTO inventory_movements(
        id,idempotency_key,item_id,branch_id,movement_type,quantity,quantity_delta,
        on_hand_before,on_hand_after,reason,created_at
      )
      SELECT 'legacy-opening-' || ii.id,'legacy-opening:' || ii.id,ii.id,ii.branch_id,
        'OPENING',ii.stock_on_hand,ii.stock_on_hand,0,ii.stock_on_hand,
        'Opening balance imported from the existing inventory record',now()
      FROM inventory_items ii
      WHERE ii.stock_on_hand > 0
      ON CONFLICT (idempotency_key) DO NOTHING;
    `);
  }

  async down(_r: QueryRunner): Promise<void> {
    throw new Error('Inventory foundation is forward-only because rollback would destroy imported stock and immutable movement history.');
  }
}
