import { MODULAR_KITCHEN_COLLECTION } from './home-modular-kitchen-collection.js';
import { ROOMY_FURNITURE_COLLECTION } from './home-roomy-furniture-collection.js';
import { LIVING_COLLECTION } from './home-living-collection.js';
import { HOUSEHOLD_COLLECTION } from './home-household-collection.js';
import { PLAY_COLLECTION } from './home-play-collection.js';
import { BATH_DAILY_COLLECTION } from './home-bath-daily-collection.js';
import { UTILITY_DAILY_COLLECTION } from './home-utility-daily-collection.js';
import { KITCHEN_DAILY_COLLECTION } from './home-kitchen-daily-collection.js';
import { INTERACTIVE_COLLECTION } from './home-interactive-collection.js';
/** Original, independently editable furnishings. Dimensions are conservative world-space envelopes. */
const item = (id, label, width, depth, height, defaultColor, material, price, category, placement, name, description, tags) => Object.freeze({
  id, label, width, depth, height, defaultColor, material, price, category, placement, name, description, tags: Object.freeze(tags),
});

/** Furniture families are distinct constructions, not recolored level variants.
 * Prices are in game points, not retail currency. Original geometry takes cues
 * from ordinary timber, upholstery, storage, kitchen and bath construction. */
const SUPPORT_SURFACES = Object.freeze({
  writingDesk: Object.freeze({ width: 1.22, depth: .60, height: .85895, offsetZ: -.00472 }),
  studyDesk: Object.freeze({ width: 1.64, depth: .40, height: .88, offsetZ: .15 }),
  bistroTable: Object.freeze({ width: .63, depth: .63, height: .84412 }),
  diningTable: Object.freeze({ width: 1.91, depth: .90, height: .9075 }),
  bedsideCabinet: Object.freeze({ width: .49, depth: .36, height: .57632, offsetZ: -.02923 }),
  wideDresser: Object.freeze({ width: 1.39, depth: .47, height: .95609, offsetZ: -.03235 }),
  kitchenIsland: Object.freeze({ width: 1.70, depth: .81, height: .93 }),
  consoleTable: Object.freeze({ width: 1.35, depth: .30, height: .85718, offsetZ: -.02019 }),
});
const furniture = (id, label, dimensions, color, material, price, category, tier, family, name, description, features) => Object.freeze({
  id, label, width: dimensions[0], depth: dimensions[1], height: dimensions[2], defaultColor: color, material, price,
  category, placement: 'floor', tier, family, name, description, collection: 'furniture-2026-10',
  tags: Object.freeze([label, family, category, ...features]), designFeatures: Object.freeze(features),
  ...(SUPPORT_SURFACES[id] ? { supportSurface: SUPPORT_SURFACES[id] } : {}),
});
export const RETAIL_SHOP_ITEMS = Object.freeze([
  furniture('bedTimber', "DisplayText2796", [1.15, 1.95, .92], '#c99362', 'oak', 1000, 'bedroom', 'essential', 'beds', "DisplayText2797", "DisplayText2798, DisplayText2799, DisplayText2800.", ["DisplayText2801", "DisplayText2802", "DisplayText1480"]),
  furniture('bedUpholstered', "DisplayText2803", [1.95, 2.10, 1.12], '#a6cbb6', 'linen', 2400, 'bedroom', 'comfort', 'beds', "DisplayText2804", "DisplayText2805, DisplayText2806, DisplayText2807.", ["DisplayText2596", "DisplayText2808", "DisplayText2809"]),
  furniture('bedCanopy', "DisplayText2810", [2.35, 2.25, 1.85], '#c6b6d9', 'velvet', 4800, 'bedroom', 'signature', 'beds', "DisplayText2811", "DisplayText2812, DisplayText2813, DisplayText2814, DisplayText2815.", ["DisplayText2816", "DisplayText2625", "DisplayText2817"]),
  furniture('writingDesk', "DisplayText2818", [1.35, .72, .90], '#c99362', 'oak', 800, 'study', 'essential', 'desks', "DisplayText2819", "DisplayText2820, DisplayText2821, DisplayText2822.", ["DisplayText1467", "DisplayText2823", "DisplayText2824"]),
  furniture('studyDesk', "DisplayText2825", [1.80, .85, 1.27], '#a6cbb6', 'oak', 1800, 'study', 'comfort', 'desks', "DisplayText2826", "DisplayText2827, DisplayText2828, DisplayText2829.", ["DisplayText1467", "DisplayText2830", "DisplayText2831"]),
  furniture('bistroTable', "DisplayText2832", [1.02, 1.02, .88], '#c99362', 'oak', 500, 'dining', 'essential', 'dining', "DisplayText2833", "DisplayText2834, DisplayText2835.", ["DisplayText2836", "DisplayText2837", "DisplayText1019"]),
  furniture('diningTable', "DisplayText2838", [2.05, 1.05, .93], '#f7ead7', 'marble', 2600, 'dining', 'signature', 'dining', "DisplayText2839", "DisplayText2840, DisplayText2841.", ["DisplayText2842", "DisplayText1645", "DisplayText2843"]),
  furniture('diningChair', "DisplayText2844", [.56, .62, .96], '#c99362', 'oak', 480, 'dining', 'essential', 'seating', "DisplayText2845", "DisplayText2846, DisplayText2847, DisplayText2848.", ["DisplayText1028", "DisplayText2849", "DisplayText1585"]),
  furniture('loungeChair', "DisplayText2850", [1.04, 1.02, 1.04], '#eeaaa4', 'velvet', 1800, 'comfort', 'comfort', 'seating', "DisplayText2851", "DisplayText2852, DisplayText2853.", ["DisplayText1465", "DisplayText2854", "DisplayText2855"]),
  furniture('bedsideCabinet', "DisplayText2856", [.64, .50, .65], '#c99362', 'oak', 500, 'bedroom', 'essential', 'storage', "DisplayText2857", "DisplayText2858, DisplayText2859, DisplayText2860.", ["DisplayText2856", "DisplayText1892", "DisplayText2861"]),
  furniture('wideDresser', "DisplayText2862", [1.58, .62, 1.01], '#a6cbb6', 'oak', 1800, 'storage', 'comfort', 'storage', "DisplayText2863", "DisplayText2864, DisplayText2865, DisplayText1254.", ["DisplayText2866", "DisplayText2867", "DisplayText2868"]),
  furniture('archedWardrobe', "DisplayText2869", [1.42, .70, 1.95], '#f7ead7', 'oak', 3000, 'bedroom', 'signature', 'storage', "DisplayText2870", "DisplayText2871, DisplayText2872, DisplayText2873.", ["DisplayText1470", "DisplayText2874", "DisplayText2875"]),
  furniture('kitchenSink', "DisplayText2876", [1.22, .72, 1.15], '#a6cbb6', 'oak', 1500, 'kitchen', 'comfort', 'kitchen', "DisplayText2877", "DisplayText2878, DisplayText2879, DisplayText2880.", ["DisplayText1865", "DisplayText2881", "DisplayText2882"]),
  furniture('rangeCooker', "DisplayText2883", [.82, .72, 1.03], '#eeaaa4', 'ceramic', 1800, 'kitchen', 'comfort', 'kitchen', "DisplayText2884", "DisplayText2885, DisplayText2886, DisplayText2887, DisplayText2888.", ["DisplayText1800", "DisplayText1823", "DisplayText2889"]),
  furniture('retroFridge', "DisplayText2890", [.86, .78, 1.68], '#a7c8e5', 'ceramic', 2400, 'kitchen', 'comfort', 'kitchen', "DisplayText2891", "DisplayText2892, DisplayText2893.", ["DisplayText1790", "DisplayText2894", "DisplayText2895"]),
  furniture('kitchenIsland', "DisplayText1787", [1.85, .95, .95], '#c99362', 'oak', 3000, 'kitchen', 'signature', 'kitchen', "DisplayText2896", "DisplayText2897, DisplayText2898, DisplayText2899.", ["DisplayText1913", "DisplayText2900", "DisplayText2901"]),
  furniture('ovalBathtub', "DisplayText2902", [1.78, .95, .88], '#f7ead7', 'ceramic', 2600, 'bathroom', 'signature', 'bathroom', "DisplayText2903", "DisplayText2904, DisplayText2905.", ["DisplayText2906", "DisplayText2907", "DisplayText2908"]),
  furniture('bathroomVanity', "DisplayText2909", [1.08, .67, 1.14], '#a7c8e5', 'oak', 1800, 'bathroom', 'comfort', 'bathroom', "DisplayText2910", "DisplayText2911, DisplayText2912, DisplayText2913.", ["DisplayText0460", "DisplayText2914", "DisplayText2915"]),
  furniture('compactToilet', "DisplayText0468", [.60, .84, .92], '#f7ead7', 'ceramic', 1000, 'bathroom', 'essential', 'bathroom', "DisplayText2916", "DisplayText2917, DisplayText2918, DisplayText2267.", ["DisplayText0468", "DisplayText2919", "DisplayText2920"]),
  furniture('toyCubby', "DisplayText2921", [1.36, .52, .95], '#efcf77', 'oak', 500, 'toys', 'essential', 'play', "DisplayText2922", "DisplayText2923, DisplayText2924.", ["DisplayText2925", "DisplayText2926", "DisplayText2927"]),
  furniture('playTent', "DisplayText2928", [1.42, 1.35, 1.66], '#a6cbb6', 'linen', 1800, 'toys', 'comfort', 'play', "DisplayText2929", "DisplayText2930, DisplayText2931.", ["DisplayText2932", "DisplayText2933", "DisplayText0387"]),
  furniture('rockingHorse', "DisplayText2934", [1.08, .52, .96], '#c99362', 'oak', 1000, 'toys', 'comfort', 'play', "DisplayText2935", "DisplayText1554, DisplayText2936, DisplayText2937.", ["DisplayText2938", "DisplayText2939", "DisplayText2940"]),
  furniture('consoleTable', "DisplayText2941", [1.52, .43, .90], '#78533e', 'walnut', 1500, 'storage', 'comfort', 'storage', "DisplayText2942", "DisplayText2943, DisplayText2944, DisplayText2945.", ["DisplayText2772", "DisplayText2946", "DisplayText2947"]),
  furniture('daybedSofa', "DisplayText2948", [2.42, 1.02, .94], '#a7c8e5', 'linen', 2600, 'comfort', 'signature', 'seating', "DisplayText2949", "DisplayText2950, DisplayText2951, DisplayText2952, DisplayText2953.", ["DisplayText2954", "DisplayText2955", "DisplayText2956"]),
]);

export const EXTRA_SHOP_ITEMS = Object.freeze([
  item('deskShelf', "DisplayText2784", .74, .30, .60, '#c99362', 'oak', 300, 'reading', 'table', "DisplayText2957", "DisplayText2958, DisplayText2959.", ["DisplayText1467", "DisplayText0775", "DisplayText2960", "Store"]),
  item('bookends', "DisplayText2961", .45, .24, .35, '#a6cbb6', 'ceramic', 200, 'reading', 'table', "DisplayText2962", "DisplayText2963, DisplayText2964.", ["DisplayText1467", "DisplayText2960", "DisplayText2965"]),
  item('openBook', "DisplayText2966", .42, .29, .11, '#c6b6d9', 'linen', 180, 'reading', 'table', "DisplayText2967", "DisplayText2968, DisplayText2969.", ["DisplayText1467", "DisplayText2960", "DisplayText2970"]),
  item('pencilCup', "DisplayText2971", .26, .26, .43, '#efcf77', 'ceramic', 220, 'reading', 'table', "DisplayText2972", "DisplayText2973, DisplayText2974.", ["DisplayText1467", "DisplayText2389", "DisplayText2975"]),
  item('deskOrganizer', "DisplayText2976", .48, .29, .34, '#a7c8e5', 'ceramic', 200, 'reading', 'table', "DisplayText2977", "DisplayText2978, DisplayText2979, DisplayText2980.", ["DisplayText1467", "DisplayText2389", "Store"]),
  item('globe', "DisplayText2981", .38, .35, .51, '#a7c8e5', 'ceramic', 300, 'reading', 'table', "DisplayText2982", "DisplayText2983, DisplayText2984.", ["DisplayText1467", "DisplayText2985", "DisplayText2986"]),
  item('deskClock', "DisplayText2785", .34, .19, .39, '#eeaaa4', 'ceramic', 200, 'reading', 'table', "DisplayText2987", "DisplayText2988, DisplayText2989, DisplayText2990.", ["DisplayText1467", "DisplayText2991", "DisplayText2415"]),
  item('taskLamp', "DisplayText2992", .43, .30, .58, '#a6cbb6', 'ceramic', 300, 'reading', 'table', "DisplayText2993", "DisplayText2994, DisplayText2995.", ["DisplayText1467", "DisplayText2444", "DisplayText2970"]),
  item('miniPlant', "DisplayText2996", .32, .30, .46, '#eeaaa4', 'ceramic', 260, 'plants', 'table', "DisplayText2997", "DisplayText2998, DisplayText2999.", ["DisplayText1467", "DisplayText0776", "DisplayText2432"]),
  item('succulent', "DisplayText3000", .31, .31, .25, '#c6b6d9', 'ceramic', 240, 'plants', 'table', "DisplayText3001", "DisplayText3002, DisplayText3003.", ["DisplayText1467", "DisplayText2432", "DisplayText3000"]),
  item('flowerVase', "DisplayText3004", .34, .30, .59, '#a7c8e5', 'ceramic', 240, 'plants', 'table', "DisplayText3005", "DisplayText3006, DisplayText3007, DisplayText3008.", ["DisplayText1467", "DisplayText2419", "DisplayText3009"]),
  item('photoFrame', "DisplayText3010", .33, .18, .39, '#efcf77', 'oak', 280, 'reading', 'table', "DisplayText3011", "DisplayText3012, DisplayText3013.", ["DisplayText1467", "DisplayText3014", "DisplayText3015"]),
  item('toyRobot', "DisplayText3016", .34, .24, .45, '#a7c8e5', 'ceramic', 300, 'toys', 'table', "DisplayText3017", "DisplayText3018, DisplayText3019, DisplayText3020.", ["DisplayText1467", "DisplayText3021", "DisplayText3022"]),
  item('woodTrain', "DisplayText3023", .59, .24, .28, '#eeaaa4', 'oak', 240, 'toys', 'table', "DisplayText3024", "DisplayText3025, DisplayText3026, DisplayText3027.", ["DisplayText1467", "DisplayText3021", "DisplayText3028"]),
  item('blockCastle', "DisplayText3029", .45, .32, .43, '#c6b6d9', 'oak', 260, 'toys', 'table', "DisplayText3030", "DisplayText3031, DisplayText3032, DisplayText3033.", ["DisplayText1467", "DisplayText3021", "DisplayText3034", "DisplayText3035"]),
  item('teddyBear', "DisplayText3036", .34, .27, .45, '#c99362', 'wool', 260, 'toys', 'table', "DisplayText3037", "DisplayText3038, DisplayText3039, DisplayText3040.", ["DisplayText1467", "DisplayText3021", "DisplayText3041", "DisplayText0213"]),
  item('happyCloud', "DisplayText3042", .40, .23, .28, '#f7ead7', 'ceramic', 180, 'mood', 'table', "DisplayText3043", "DisplayText3044, DisplayText3045.", ["DisplayText1467", "DisplayText3046", "DisplayText3047", "DisplayText3048"]),
  item('shyMushroom', "DisplayText3049", .32, .28, .36, '#eeaaa4', 'ceramic', 180, 'mood', 'table', "DisplayText3049", "DisplayText3050, DisplayText3051, DisplayText3052.", ["DisplayText1467", "DisplayText3046", "DisplayText3053", "DisplayText3054"]),
  item('braveSun', "DisplayText3055", .38, .22, .40, '#efcf77', 'ceramic', 200, 'mood', 'table', "DisplayText3056", "DisplayText3057, DisplayText3058.", ["DisplayText1467", "DisplayText3046", "DisplayText3059", "DisplayText3060"]),
  item('sleepyMoon', "DisplayText3061", .32, .22, .38, '#c6b6d9', 'ceramic', 200, 'mood', 'table', "DisplayText3061", "DisplayText3062, DisplayText3063.", ["DisplayText1467", "DisplayText3046", "DisplayText3064", "DisplayText0113"]),
  item('wallClock', "DisplayText3065", .58, .12, .58, '#a6cbb6', 'ceramic', 300, 'wall', 'wall', "DisplayText3066", "DisplayText3067, DisplayText3068, DisplayText3069.", ["DisplayText0785", "DisplayText2415", "DisplayText2991"]),
  item('cuckooClock', "DisplayText3070", .57, .25, .83, '#c99362', 'oak', 500, 'wall', 'wall', "DisplayText3071", "DisplayText3072, DisplayText3073, DisplayText3074, DisplayText3075.", ["DisplayText0785", "DisplayText2415", "DisplayText3076", "DisplayText2337"]),
  item('landscapeArt', "DisplayText3077", .85, .12, .58, '#c99362', 'oak', 300, 'wall', 'wall', "DisplayText3078", "DisplayText3079, DisplayText3080, DisplayText3081.", ["DisplayText0785", "DisplayText2424", "DisplayText3082"]),
  item('corkBoard', "DisplayText3083", .72, .12, .57, '#c99362', 'oak', 240, 'wall', 'wall', "DisplayText3084", "DisplayText3085, DisplayText3086, DisplayText3087.", ["DisplayText0785", "DisplayText3088", "DisplayText3089", "Study"]),
  item('pegboard', "DisplayText3090", .65, .22, .63, '#a7c8e5', 'oak', 300, 'wall', 'wall', "DisplayText3091", "DisplayText3092, DisplayText3093, DisplayText3094.", ["DisplayText0785", "Store", "DisplayText3090"]),
  item('wallShelf', "DisplayText3095", .85, .28, .57, '#c99362', 'oak', 500, 'wall', 'wall', "DisplayText3096", "DisplayText3097, DisplayText3098.", ["DisplayText0785", "DisplayText0775", "DisplayText2960", "Store"]),
  item('flowerWreath', "DisplayText3099", .55, .14, .55, '#a6cbb6', 'ceramic', 240, 'wall', 'wall', "DisplayText3100", "DisplayText3101, DisplayText3102.", ["DisplayText0785", "DisplayText2419", "DisplayText2432", "DisplayText3099"]),
  item('starMobile', "DisplayText3103", .64, .16, .83, '#efcf77', 'ceramic', 260, 'wall', 'wall', "DisplayText3104", "DisplayText3105, DisplayText3106, DisplayText3107.", ["DisplayText0785", "DisplayText0082", "DisplayText3064", "DisplayText3108"]),
  item('beanbag', "DisplayText3109", .95, .90, .75, '#c6b6d9', 'velvet', 800, 'comfort', 'floor', "DisplayText3110", "DisplayText3111, DisplayText3112, DisplayText3113.", ["DisplayText3114", "DisplayText0779", "DisplayText2970", "DisplayText3115"]),
  item('toyChest', "DisplayText3116", .93, .55, .56, '#eeaaa4', 'oak', 500, 'comfort', 'floor', "DisplayText3117", "DisplayText3118, DisplayText3119, DisplayText3120.", ["DisplayText3114", "DisplayText3021", "Store", "DisplayText3121"]),
  item('readingLamp', "DisplayText3122", .56, .51, 1.45, '#a6cbb6', 'ceramic', 800, 'comfort', 'floor', "DisplayText3123", "DisplayText3124, DisplayText3125, DisplayText3126.", ["DisplayText3114", "DisplayText2444", "DisplayText2970"]),
  item('bonsai', "DisplayText3127", .87, .69, 1.02, '#c99362', 'ceramic', 600, 'plants', 'floor', "DisplayText3128", "DisplayText3129, DisplayText3130, DisplayText3131.", ["DisplayText3114", "DisplayText2432", "DisplayText3127", "DisplayText3132"]),
  ...RETAIL_SHOP_ITEMS,
  ...LIVING_COLLECTION,
  ...HOUSEHOLD_COLLECTION,
  ...PLAY_COLLECTION,
  ...BATH_DAILY_COLLECTION,
  ...UTILITY_DAILY_COLLECTION,
  ...KITCHEN_DAILY_COLLECTION,
  ...MODULAR_KITCHEN_COLLECTION,
  ...ROOMY_FURNITURE_COLLECTION,
  ...INTERACTIVE_COLLECTION,
]);

export const EXTRA_ITEM_DIMENSIONS = Object.freeze(Object.fromEntries(EXTRA_SHOP_ITEMS.map(({ id, width, depth, height }) => [id, Object.freeze({ width, depth, height })])));
export const EXTRA_SHOP_BY_KIND = new Map(EXTRA_SHOP_ITEMS.map(row => [row.id, row]));
