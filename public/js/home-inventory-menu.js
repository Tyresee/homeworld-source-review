/** Inventory rows for the quick placement menu. This is a read-only view:
 * only already-owned, stored items are eligible, never a new purchase. */
export function getStoredPlacementGroups(owned, catalog, placement = null) {
  const products = new Map(catalog.map(product => [product.skuId, product]));
  const groups = new Map();
  for (const row of owned) {
    const product = products.get(row.skuId);
    if (row.status !== 'stored' || !product || ['room', 'storey', 'clothing'].includes(product.productType)) continue;
    const support = product.placement ?? 'floor';
    if (placement && support !== placement && !(placement === 'floor' && support === 'ceiling')) continue;
    const item = row.item;
    // Distinct customisations must remain separate choices. Position/mount are
    // deliberately excluded: every stored item is about to receive a new pose.
    const appearance = [item.kind, item.color?.toLowerCase(), item.material, item.level, item.rotation,
      Object.entries(item.plans ?? {}).sort(([a], [b]) => a.localeCompare(b))];
    const key = JSON.stringify([row.skuId, appearance]);
    let group = groups.get(key);
    if (!group) {
      group = { id: row.id, ownedIds: [], quantity: 0, item, product, placement: support };
      groups.set(key, group);
    }
    group.ownedIds.push(row.id); group.quantity += 1;
  }
  return [...groups.values()];
}
