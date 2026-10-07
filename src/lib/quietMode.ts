/** Discovery only: never apply this filter to saved conversations. */
export function discoverableAccounts<T extends { id: string }>(accounts: T[], quietIds: ReadonlySet<string>): T[] {
  return accounts.filter((account) => !quietIds.has(account.id));
}