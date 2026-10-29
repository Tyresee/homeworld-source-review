/** A storey is one purchased construction kit, not a cosmetic roof upgrade. */
export const STOREY_PRODUCTS = Object.freeze([Object.freeze({
  skuId: 'second-storey-kit', productType: 'storey', placement: 'storey', kind: 'second-storey',
  name: "DisplayText3496", label: "DisplayText3496", category: 'rooms', family: 'storeys', familyLabel: "DisplayText2773",
  tier: 'signature', price: 26000, width: 5.6, depth: 5.2, height: 3.15, maxQuantity: 1, legacyOnly: true,
  description: "DisplayText3497, DisplayText3498.DisplayText3499, DisplayText2059; DisplayText3500.",
  tags: Object.freeze(["DisplayText3248", "DisplayText3501", "DisplayText0953", "DisplayText3502", "DisplayText3503"]),
})]);

/** Simulation rates. Production points must later be authorized by the platform adapter. */
export const FLOOR_CONSTRUCTION_RATES=Object.freeze({pricePerSquareMetre:300,stairConnectionFee:6000});
