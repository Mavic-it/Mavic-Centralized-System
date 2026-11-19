import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DataSource, EntityManager, QueryRunner } from "typeorm";
import { InventoryFoundation1795392000000 } from "../database/migrations/1795392000000-InventoryFoundation.js";
import { AuthenticatedRequest } from "../foundation/auth/auth.context.js";
import { AuthorizationService } from "../security/authorization/authorization.service.js";
import { InventoryController } from "./inventory/inventory.controller.js";
import { InventoryService, type InventoryItem } from "./inventory/inventory.service.js";

const branchUser = (role: "BRANCH_MANAGER" | "STAFF" = "BRANCH_MANAGER") => ({
  userId: "user-one", email: "one@example.test", role, branchId: "branch-one",
  branchIds: ["branch-one", "branch-two"], scope: "BRANCH" as const,
});

function movementDatabase(initial = 5) {
  const state = { onHand: initial, movements: [] as Record<string, unknown>[], updates: 0 };
  const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.includes("WHERE idempotency_key=$1")) {
      return state.movements.filter(row => row.idempotencyKey === parameters[0]).map(row => ({
        id:row.id,itemId:row.itemId,branchId:row.branchId,storageLocation:row.storageLocation,
        movementType:row.movementType,quantity:row.quantity,reason:row.reason,
      }));
    }
    if (sql.includes("JOIN branches b ON b.id=$2")) return [{status:"ACTIVE",branchActive:true}];
    if (sql.includes("inventory_balances") && sql.includes("FOR UPDATE")) {
      return [{itemId:"item-one",branchId:"branch-one",storageLocation:"",onHand:state.onHand,reserved:1,quarantined:1,inTransit:0}];
    }
    if (sql.includes("UPDATE inventory_balances SET on_hand")) {
      state.onHand = Number(parameters[3]);
      state.updates += 1;
      return [];
    }
    if (sql.includes("INSERT INTO inventory_movements")) {
      const row = {
        id:"movement-" + state.movements.length,
        idempotencyKey:parameters[1],itemId:parameters[2],branchId:parameters[3],
        storageLocation:parameters[4],movementType:parameters[5],quantity:parameters[6],
        quantityDelta:parameters[7],onHandBefore:parameters[8],onHandAfter:parameters[9],
        reason:parameters[10],performedBy:parameters[11],itemName:"Paper",sku:"PAPER-1",branchName:"Makati",
      };
      state.movements.push(row);
      return [{id:row.id,idempotencyKey:row.idempotencyKey,itemId:row.itemId,branchId:row.branchId,
        movementType:row.movementType,quantity:row.quantity,quantityDelta:row.quantityDelta,
        onHandBefore:row.onHandBefore,onHandAfter:row.onHandAfter,reason:row.reason,performedBy:row.performedBy}];
    }
    if (sql.includes("INSERT INTO inventory_audit_logs")) return [];
    if (sql.includes("FROM inventory_balances") && !sql.includes("FOR UPDATE")) {
      return [{itemId:"item-one",branchId:"branch-one",storageLocation:"",onHand:state.onHand,reserved:1,quarantined:1,inTransit:0}];
    }
    if (sql.includes("JOIN inventory_catalog_items ci")) {
      const row = state.movements.find(movement => movement.id === parameters[0]);
      return row ? [{...row,createdAt:new Date("2026-01-01T00:00:00Z"),performedByName:"Inventory user"}] : [];
    }
    return [];
  });
  const db = {
    transaction: <T>(callback: (manager: EntityManager) => Promise<T>) =>
      callback({query} as unknown as EntityManager),
  } as unknown as DataSource;
  return { service:new InventoryService(db), state, query };
}

describe("inventory foundation", () => {
  it("backfills old branch stock into the shared catalog, balances, and opening ledger without deleting the legacy table", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const migration = new InventoryFoundation1795392000000();
    await migration.up({query} as unknown as QueryRunner);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS inventory_catalog_items");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS inventory_balances");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS inventory_movements");
    expect(sql).toContain("INSERT INTO inventory_catalog_items");
    expect(sql).toContain("INSERT INTO inventory_balances");
    expect(sql).toContain("legacy-opening:");
    expect(sql).not.toContain("DROP TABLE inventory_items");
  });

  it("refuses a destructive rollback of imported stock and movement history", async () => {
    await expect(new InventoryFoundation1795392000000().down({} as QueryRunner))
      .rejects.toThrow("forward-only");
  });

  it("blocks issues that exceed available quantity, including reserved and quarantined units", async () => {
    const {service,query,state} = movementDatabase();
    await expect(service.issue("item-one",{
      branchId:"branch-one",quantity:4,reason:"Employee issue",idempotencyKey:"issue-one",
    },"user-one")).rejects.toThrow("Insufficient available stock.");
    expect(state.onHand).toBe(5);
    expect(state.updates).toBe(0);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("FOR UPDATE"))).toBe(true);
  });

  it("posts a receipt transactionally and returns the original result for an idempotent retry", async () => {
    const {service,query,state} = movementDatabase();
    const input = {branchId:"branch-one",quantity:2,reason:"Supplier delivery",idempotencyKey:"receipt-one"};
    const first = await service.receive("item-one",input,"user-one");
    const retry = await service.receive("item-one",input,"user-one");
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(state.onHand).toBe(7);
    expect(state.updates).toBe(1);
    expect(state.movements).toHaveLength(1);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("pg_advisory_xact_lock"))).toBe(true);
  });

  it("rejects reuse of an idempotency key with a different movement payload", async () => {
    const {service} = movementDatabase();
    await service.receive("item-one",{branchId:"branch-one",quantity:2,reason:"Delivery",idempotencyKey:"same-key"},"user-one");
    await expect(service.receive("item-one",{branchId:"branch-one",quantity:3,reason:"Delivery",idempotencyKey:"same-key"},"user-one"))
      .rejects.toThrow("already used for a different");
  });

  it("enforces branch access before invoking a branch stock action", async () => {
    const receive = vi.fn();
    const service = { receive } as unknown as InventoryService;
    const controller = new InventoryController(service,new AuthorizationService());
    const request = {user:branchUser()} as unknown as AuthenticatedRequest;
    await expect(controller.receive(request,"item-one",{
      branchId:"branch-three",quantity:1,reason:"Delivery",
    },"key-one")).rejects.toThrow(ForbiddenException);
    expect(receive.mock.calls).toHaveLength(0);
  });

  it("redacts item purchase prices outside the authorized valuation scope", async () => {
    const item: InventoryItem = {
      id:"item-one",name:"Paper",sku:"PAPER-1",description:null,categoryId:"category-one",category:"Office",
      itemType:"CONSUMABLE",trackingMethod:"QUANTITY",unit:"REAM",reorderThreshold:0,maximumStockThreshold:null,
      purchasePrice:"25.00",status:"ACTIVE",onHand:2,reserved:0,quarantined:0,available:2,inTransit:0,registered:true,
    };
    const listItems = vi.fn().mockResolvedValue({items:[item],total:1,page:1,pageSize:50});
    const controller = new InventoryController({listItems} as unknown as InventoryService,new AuthorizationService());
    const query = {branchId:"branch-one",page:1,pageSize:50};
    const staffResult = await controller.items({user:branchUser("STAFF")} as unknown as AuthenticatedRequest,query);
    expect(staffResult.items[0]).not.toHaveProperty("purchasePrice");
    const admin = { ...branchUser(),role:"SUPER_ADMIN" as const,scope:"ALL" as const };
    const adminResult = await controller.items({user:admin} as unknown as AuthenticatedRequest,query);
    expect(adminResult.items[0]).toHaveProperty("purchasePrice","25.00");
  });
});
