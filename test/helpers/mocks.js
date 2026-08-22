// test/helpers/mocks.js
//
// Shared mock builders used by the API-route suites.
//
// IMPORTANT: all suites compose into ONE vitest file (test/run-all.test.js),
// so every vi.mock of a shared module must use an identical delegating
// factory (reading behavior from globalThis at call time). That keeps mock
// registration idempotent no matter which suite registers it first.

import { vi } from "vitest";

/**
 * Chainable query-builder stub: find().sort().skip().limit().lean() etc,
 * awaitable via `.then` resolving `value`.
 */
export function makeQueryBuilder(value) {
  const builder = {};
  for (const m of ["sort", "skip", "limit", "lean", "select"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve, reject) =>
    Promise.resolve(value).then(resolve, reject);
  builder.catch = (reject) => Promise.resolve(value).catch(reject);
  return builder;
}

/**
 * A mongoose-model-shaped mock. Every method is a vi.fn so suites can
 * assert calls and swap resolved values per test via mockResolvedValueOnce.
 * Constructable (`new Model(data)`) with a save() spy on instances.
 */
export function makeModel(name) {
  const instanceSave = vi.fn(async function () {
    return this;
  });

  class ModelMock {
    constructor(data) {
      Object.assign(this, data);
      this.save = instanceSave;
      this.isNew = true;
    }
  }

  ModelMock.instanceSave = instanceSave;
  ModelMock.find = vi.fn(() => makeQueryBuilder([]));
  ModelMock.findOne = vi.fn(async () => null);
  ModelMock.findById = vi.fn(async () => null);
  ModelMock.findOneAndUpdate = vi.fn(async () => null);
  ModelMock.findOneAndDelete = vi.fn(async () => null);
  ModelMock.findByIdAndUpdate = vi.fn(async () => null);
  ModelMock.updateOne = vi.fn(async () => ({}));
  ModelMock.updateMany = vi.fn(async () => ({ modifiedCount: 0 }));
  ModelMock.deleteOne = vi.fn(async () => ({ deletedCount: 0 }));
  ModelMock.deleteMany = vi.fn(async () => ({ deletedCount: 0 }));
  ModelMock.countDocuments = vi.fn(async () => 0);
  ModelMock.aggregate = vi.fn(async () => []);
  ModelMock.discriminator = vi.fn();
  ModelMock.modelName = name;

  return ModelMock;
}

/** Standard registry object placed on globalThis by route suites. */
export function makeModelsRegistry() {
  return {
    transaction: makeModel("Transaction"),
    category: makeModel("Category"),
    budget: makeModel("Budget"),
    user: makeModel("User"),
    rateLimit: makeModel("RateLimit"),
  };
}
