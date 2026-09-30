// Real MongoDB coverage: mocked models cannot enforce occurrence uniqueness.
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { materializeDueRules } from "@/lib/recurring";

describe("recurring durable writes against isolated MongoDB", () => {
  let mongo, connection, Transaction, Recurring, userId;
  const now = new Date("2026-09-26T00:00:00Z");
  const first = new Date("2026-08-15T00:00:00Z");

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongo.getUri("recurring_test")).asPromise();
    const transaction = await vi.importActual("@/models/transaction.model");
    const recurring = await vi.importActual("@/models/recurring.model");
    Transaction = connection.model("DatabaseTransaction", transaction.default.schema, "transactions");
    Recurring = connection.model("DatabaseRecurring", recurring.default.schema, "recurrings");
    await Promise.all([Transaction.init(), Recurring.init()]);
  }, 30000);

  afterAll(async () => {
    await connection?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await Promise.all([Transaction.deleteMany({}), Recurring.deleteMany({})]);
    userId = new mongoose.Types.ObjectId();
  });

  const seedRule = () => Recurring.create({
    userId, type: "expense", amount: 10, amountMinor: 1000, category: "Rent",
    frequency: "monthly", dayOfMonth: 15, nextRunAt: first,
  });
  const deps = () => ({ Transaction, Recurring, now });

  it("allows several manual transactions and rejects duplicate recurring occurrences", async () => {
    const base = { userId, type: "expense", amount: 10, amountMinor: 1000, category: "Food" };
    await Transaction.create(Array.from({ length: 5 }, () => ({ ...base })));
    const occurrence = { ...base, recurringRuleId: new mongoose.Types.ObjectId(), scheduledFor: first };
    await Transaction.create(occurrence);
    await expect(Transaction.create(occurrence)).rejects.toMatchObject({ code: 11000 });
    expect(await Transaction.countDocuments({})).toBe(6);
  });

  it("concurrent passes create each due occurrence exactly once", async () => {
    const rule = await seedRule();
    const counts = await Promise.all(Array.from({ length: 4 }, () => materializeDueRules(userId, deps())));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
    expect(await Transaction.countDocuments({ recurringRuleId: rule._id })).toBe(2);
    expect((await Recurring.findById(rule._id)).nextRunAt > now).toBe(true);
  });

  it("retries a partial insert failure without losing or duplicating money", async () => {
    const rule = await seedRule();
    let calls = 0;
    function FailingTransaction(data) {
      const document = new Transaction(data);
      const save = document.save.bind(document);
      document.save = async () => {
        if (++calls === 2) throw new Error("synthetic write outage");
        return save();
      };
      return document;
    }
    FailingTransaction.init = () => Transaction.init();
    await expect(materializeDueRules(userId, { ...deps(), Transaction: FailingTransaction }))
      .rejects.toThrow("synthetic write outage");
    expect((await Recurring.findById(rule._id)).nextRunAt).toEqual(first);
    expect(await Transaction.countDocuments({})).toBe(1);
    expect(await materializeDueRules(userId, deps())).toBe(1);
    expect(await Transaction.countDocuments({})).toBe(2);
    expect((await Recurring.findById(rule._id)).nextRunAt > now).toBe(true);
  });

  it("recovers after durable writes when the schedule commit fails", async () => {
    const rule = await seedRule();
    const failing = {
      find: Recurring.find.bind(Recurring),
      findOneAndUpdate: async () => { throw new Error("synthetic commit outage"); },
    };
    await expect(materializeDueRules(userId, { ...deps(), Recurring: failing }))
      .rejects.toThrow("synthetic commit outage");
    expect((await Recurring.findById(rule._id)).nextRunAt).toEqual(first);
    expect(await materializeDueRules(userId, deps())).toBe(0);
    expect(await Transaction.countDocuments({})).toBe(2);
    expect((await Recurring.findById(rule._id)).nextRunAt > now).toBe(true);
  });

  it("resumes an interrupted pass from already-persisted occurrences", async () => {
    const rule = await seedRule();
    await Transaction.create({ userId, type: "expense", amount: 10, amountMinor: 1000,
      category: "Rent", recurringRuleId: rule._id, scheduledFor: first, date: first });
    expect(await materializeDueRules(userId, deps())).toBe(1);
    expect(await Transaction.countDocuments({})).toBe(2);
  });
});
