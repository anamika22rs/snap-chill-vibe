import { expect, test } from "bun:test";
import { discoverableAccounts } from "./quietMode";

test("Quiet Mode excludes only the selected account from recommendations", () => {
  const accounts = [{ id: "quiet-user" }, { id: "other-user" }];
  expect(discoverableAccounts(accounts, new Set(["quiet-user"]))).toEqual([{ id: "other-user" }]);
  expect(accounts).toEqual([{ id: "quiet-user" }, { id: "other-user" }]);
});

test("Unhide restores the account to discovery", () => {
  expect(discoverableAccounts([{ id: "quiet-user" }], new Set())).toEqual([{ id: "quiet-user" }]);
});