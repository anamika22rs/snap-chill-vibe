import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { discoverableAccounts } from "./quietMode";

test("Quiet Mode excludes only the selected account from recommendations", () => {
  const accounts = [{ id: "quiet-user" }, { id: "other-user" }];
  deepStrictEqual(discoverableAccounts(accounts, new Set(["quiet-user"])), [{ id: "other-user" }]);
  deepStrictEqual(accounts, [{ id: "quiet-user" }, { id: "other-user" }]);
});

test("Unhide restores the account to discovery", () => {
  deepStrictEqual(discoverableAccounts([{ id: "quiet-user" }], new Set()), [{ id: "quiet-user" }]);
});