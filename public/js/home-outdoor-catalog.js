/** Stable, local-price outdoor catalogue. Ownership is separate from the indoor floor plan. */
export const OUTDOOR_FEATURES = Object.freeze(['pool', 'garden', 'courtyard', 'tennis', 'treehouse', 'gazebo']);
export const SPORT_FEATURES = Object.freeze(['tennis', 'badminton', 'basketball', 'volleyball', 'football', 'table-tennis', 'running-track', 'skatepark']);
const TIERS = ['essential', 'comfort', 'signature'];
const facilitySpecs = [
  ['pool', "DisplayText2000", [
    ["DisplayText2001", 6200, 4.6, 6.2, .8, '#d7e9e5', "DisplayText2002, DisplayText2003; DisplayText2004."],
    ["DisplayText2005", 13800, 6.0, 8.0, .9, '#bf885b', "DisplayText2006, DisplayText2007, DisplayText2008."],
    ["DisplayText2009", 26800, 6.6, 8.6, 1.05, '#f4e9cd', "DisplayText2010, DisplayText2011, DisplayText2012."],
  ]],
  ['garden', "DisplayText0148", [
    ["DisplayText2013", 3800, 4.8, 6.4, 1.65, '#e8bc91', "DisplayText2014, DisplayText2015."],
    ["DisplayText2016", 8800, 5.8, 7.6, 3.3, '#eaa8a4', "DisplayText2017."],
    ["DisplayText2018", 17800, 6.4, 8.4, 3.5, '#b3d8bd', "DisplayText2019, DisplayText2020."],
  ]],
  ['courtyard', "DisplayText0873", [
    ["DisplayText2021", 2800, 6.0, 2.6, .5, '#e4c999', "DisplayText2022, DisplayText2023."],
    ["DisplayText2024", 7600, 8.0, 2.6, 1.6, '#dedbcf', "DisplayText2025, DisplayText2026."],
    ["DisplayText2027", 15800, 10.0, 2.6, 2.7, '#f2e8cc', "DisplayText2028, DisplayText2029, DisplayText2030."],
  ]],
  ['tennis', "DisplayText2031", [
    ["DisplayText2032", 8800, 11.0, 6.2, .9, '#71a960', "DisplayText2033, DisplayText2034, DisplayText2035."],
    ["DisplayText2036", 17800, 12.4, 7.2, 1.4, '#c47751', "DisplayText2037, DisplayText2038, DisplayText2039."],
    ["DisplayText2040", 29800, 14.0, 8.0, 2.2, '#418ca6', "DisplayText2041, DisplayText2042, DisplayText2043, DisplayText2044."],
  ]],
  ['treehouse', "DisplayText2045", [
    ["DisplayText2046", 7600, 3.7, 3.7, 3.9, '#bd884e', "DisplayText2047."],
    ["DisplayText2048", 14800, 4.4, 4.4, 4.7, '#d4c4a1', "DisplayText2049, DisplayText2050, DisplayText2051."],
    ["DisplayText2052", 25800, 5.2, 5.2, 5.4, '#edcf88', "DisplayText2053, DisplayText2054, DisplayText2055."],
  ]],
  ['gazebo', "DisplayText2056", [
    ["DisplayText2057", 4200, 3.6, 3.6, 2.7, '#caa56a', "DisplayText2058, DisplayText2059."],
    ["DisplayText2060", 9800, 4.8, 4.8, 3.5, '#62a4ae', "DisplayText2061, DisplayText2062."],
    ["DisplayText2063", 19800, 6.2, 6.2, 4.3, '#ecd59b', "DisplayText2064, DisplayText2065, DisplayText2066."],
  ]],
  ['badminton', "DisplayText2067", [
    ["DisplayText2068", 4800, 8.0, 4.5, 1.2, '#5ba08c', "DisplayText2069, DisplayText2070, DisplayText2071."],
    ["DisplayText2072", 9800, 9.0, 5.0, 1.7, '#4c9fb5', "DisplayText2073, DisplayText2074, DisplayText2075."],
    ["DisplayText2076", 18800, 10.0, 5.8, 2.4, '#8175ac', "DisplayText2077, DisplayText2078, DisplayText2079."],
  ]],
  ['basketball', "DisplayText2080", [
    ["DisplayText2081", 6800, 11.0, 6.4, 1.9, '#ba7c56', "DisplayText2082, DisplayText2083, DisplayText2084; DisplayText2085."],
    ["DisplayText2086", 14800, 12.4, 7.3, 2.3, '#467d9a', "DisplayText2087, DisplayText2088, DisplayText2089."],
    ["DisplayText2090", 28800, 14.0, 8.2, 2.9, '#497f8d', "DisplayText2091, DisplayText2092, DisplayText2093."],
  ]],
  ['volleyball', "DisplayText2094", [
    ["DisplayText2095", 5800, 10.0, 5.8, 1.6, '#d2b478', "DisplayText2096, DisplayText2097, DisplayText2098."],
    ["DisplayText2099", 11800, 11.2, 6.4, 2.0, '#bd7c72', "DisplayText2100, DisplayText2101, DisplayText2102."],
    ["DisplayText2103", 22800, 12.6, 7.2, 2.8, '#748db0', "DisplayText2104, DisplayText2105, DisplayText2106."],
  ]],
  ['football', "DisplayText2107", [
    ["DisplayText2108", 7200, 11.0, 7.0, 1.2, '#6f9d58', "DisplayText2109, DisplayText2110, DisplayText2111."],
    ["DisplayText2112", 14800, 12.5, 8.0, 1.6, '#598d54', "DisplayText2113, DisplayText2114, DisplayText2115."],
    ["DisplayText2116", 26800, 14.0, 9.0, 2.2, '#477b4b', "DisplayText2117, DisplayText2043, DisplayText2118."],
  ]],
  ['table-tennis', "DisplayText2119", [
    ["DisplayText2120", 1800, 3.5, 2.1, 1.0, '#3f9298', "DisplayText2121, DisplayText2122, DisplayText2123, DisplayText2124."],
    ["DisplayText2125", 4200, 4.4, 2.7, 1.2, '#487eb4', "DisplayText2126, DisplayText2127, DisplayText2128."],
    ["DisplayText2129", 8200, 5.3, 3.3, 1.4, '#407d87', "DisplayText2130, DisplayText2131."],
  ]],
  ['running-track', "DisplayText2132", [
    ["DisplayText2133", 4800, 11.0, 7.0, .4, '#b36f53', "DisplayText2134, DisplayText2135; DisplayText2136."],
    ["DisplayText2137", 10800, 12.6, 8.0, .6, '#b96853', "DisplayText2138, DisplayText2139."],
    ["DisplayText2140", 19800, 14.4, 9.2, .9, '#568fa8', "DisplayText2141, DisplayText2142, DisplayText2143."],
  ]],
  ['skatepark', "DisplayText2144", [
    ["DisplayText2145", 5200, 6.5, 5.0, 1.5, '#a4b4b2', "DisplayText2146, DisplayText2147, DisplayText2148, DisplayText2149."],
    ["DisplayText2150", 11800, 8.0, 6.0, 1.8, '#79a2ac', "DisplayText2151, DisplayText2152."],
    ["DisplayText2153", 22800, 10.0, 7.0, 2.3, '#c39c73', "DisplayText2154, DisplayText2155, DisplayText2156."],
  ]],
];
const facilities = facilitySpecs.flatMap(([feature, familyLabel, ranks]) => ranks.map(([name, price, width, depth, height, color, description], index) => ({
  skuId: `outdoor-${feature}-${index + 1}`, kind: `outdoor-${feature}-${index + 1}`,
  feature, family: feature, familyLabel, sport: SPORT_FEATURES.includes(feature), role: 'facility', level: index + 1, tier: TIERS[index],
  name, price, width, depth, height, color, description, material: index === 2 ? 'stone' : index === 1 ? 'wood' : 'paint',
})));
const accessorySpecs = [
  ['lounger', "DisplayText2157", 850, .9, 2.1, .9, '#efd9ac', 1, "DisplayText2158, DisplayText2159, DisplayText2160."],
  ['parasol', "DisplayText2161", 1400, 2.5, 2.5, 2.6, '#e9ae77', 2, "DisplayText2162; DisplayText2163."],
  ['side-table', "DisplayText2164", 460, .72, .72, .65, '#d3a66b', 1, "DisplayText2165, DisplayText2166."],
  ['towel-rack', "DisplayText2167", 520, .95, .55, 1.25, '#a8c4c1', 1, "DisplayText2168, DisplayText2169."],
  ['shower', "DisplayText2170", 1600, 1.0, 1.0, 2.5, '#c1bba4', 2, "DisplayText2171, DisplayText2172."],
  ['lifebuoy', "DisplayText2173", 640, .95, .55, 1.5, '#f5a36e', 1, "DisplayText2174, DisplayText2175."],
  ['lamp', "DisplayText2176", 720, .48, .48, 1.45, '#ecd18c', 1, "DisplayText2177, DisplayText2178."],
  ['planter', "DisplayText2179", 960, 1.65, .65, 1.0, '#c5a57a', 2, "DisplayText2180, DisplayText2181."],
  ['daybed', "DisplayText2182", 2200, 1.8, 2.3, 1.05, '#eddfbb', 3, "DisplayText2183, DisplayText2184."],
  ['storage', "DisplayText2185", 1100, 1.55, .75, .9, '#b79068', 2, "DisplayText2186, DisplayText2187."],
  ['bench', "DisplayText2188", 1300, 1.9, .8, 1.2, '#b79068', 2, "DisplayText2189, DisplayText2190, DisplayText2191."],
  ['drinks-cart', "DisplayText2192", 1800, 1.1, .7, 1.25, '#e7b977', 3, "DisplayText2193, DisplayText2194, DisplayText2195."],
];
const accessories = accessorySpecs.map(([id, name, price, width, depth, height, color, level, description]) => ({
  skuId: `outdoor-${id}`, kind: `outdoor-${id}`, model: id,
  feature: null, family: 'pool-accessories', familyLabel: "DisplayText2196", role: 'accessory', level, tier: TIERS[level - 1],
  name, price, width, depth, height, color, description, material: 'wood',
}));
const sportsAccessorySpecs = [
  ['ball-cart', "DisplayText2197", 780, 1.25, .8, 1.2, '#66a6ad', 1, "DisplayText2198, DisplayText2199, DisplayText2200."],
  ['scoreboard', "DisplayText2201", 960, 1.6, .6, 1.65, '#4b6b70', 1, "DisplayText2202, DisplayText2203, DisplayText2204."],
  ['spectator-bench', "DisplayText2205", 2800, 3.4, 1.6, 1.8, '#e4bc79', 2, "DisplayText2206, DisplayText2207."],
  ['umpire-chair', "DisplayText2208", 1400, 1.2, 1.2, 2.4, '#76a8a4', 2, "DisplayText2209, DisplayText2210, DisplayText2211."],
  ['sports-floodlight', "DisplayText2212", 1800, 1.15, .8, 3.8, '#d7bc86', 3, "DisplayText2213, DisplayText2214."],
  ['equipment-rack', "DisplayText2215", 1200, 1.8, .75, 1.65, '#bd9569', 2, "DisplayText2216, DisplayText2217."],
];
const sportsAccessories = sportsAccessorySpecs.map(([id, name, price, width, depth, height, color, level, description]) => ({
  skuId: `outdoor-${id}`, kind: `outdoor-${id}`, model: id,
  feature: null, family: 'sports-accessories', familyLabel: "DisplayText2218", sport: true, role: 'accessory', level, tier: TIERS[level - 1],
  name, price, width, depth, height, color, description, material: 'metal',
}));
export const OUTDOOR_PRODUCTS = Object.freeze([...facilities, ...accessories, ...sportsAccessories].map(product => Object.freeze({
  ...product, sport: product.sport === true, id: product.skuId, label: product.name, defaultColor: product.color,
  productType: 'outdoor', category: 'outdoor', placement: 'outdoor',
  collection: 'outdoor-2026-10',
  tags: Object.freeze(["Outdoors", product.sport ? "DisplayText0033" : "DisplayText0873", product.familyLabel, product.role === 'facility' ? "DisplayText2219" : "DisplayText2220"]),
})));
const byId = new Map(OUTDOOR_PRODUCTS.flatMap(product => [[product.skuId, product], [product.kind, product]]));
export function getOutdoorProduct(skuOrKind) { return byId.get(skuOrKind) ?? null; }
