/** Wide, usable furniture. Game-world dimensions and point prices; no existing
 * SKU is resized, so previously placed furniture keeps its collision envelope. */
const familyLabels={beds:"DisplayText2573",diningTables:"DisplayText2574",desks:"DisplayText2575",coffeeTables:"DisplayText2576",barTables:"DisplayText2577"};
const item=(id,label,size,price,category,tier,family,color,material,description,features,support)=>Object.freeze({
 id,label,name:label,width:size[0],depth:size[1],height:size[2],price,category,roomUse:category,tier,family,familyLabel:familyLabels[family],
 defaultColor:color,material,placement:'floor',collection:'roomy-furniture-2026-10-25',robotAction:family==='beds'?'lie':'read',
 description,designFeatures:Object.freeze(features),tags:Object.freeze([label,familyLabels[family],"DisplayText2578","DisplayText2579",...features]),
 ...(support?{supportSurface:Object.freeze(support)}:{})
});
const top=(w,d,y,offsetX=0,offsetZ=0)=>({width:w,depth:d,height:y,offsetX,offsetZ});
export const ROOMY_FURNITURE_COLLECTION=Object.freeze([
 item('rfBirchSingle',"DisplayText2580",[1.52,2.45,1.02],1400,'bedroom','essential','beds','#c6a276','oak',"DisplayText2581, DisplayText2582.",["DisplayText2583","DisplayText2584","DisplayText2585"]),
 item('rfDrawerSingle',"DisplayText2586",[1.78,2.50,1.06],2200,'bedroom','essential','beds','#a5bba8','oak',"DisplayText2587, DisplayText2588.",["DisplayText2589","DisplayText2590","DisplayText2591"]),
 item('rfCloudDouble',"DisplayText2592",[2.30,2.65,1.23],3600,'bedroom','comfort','beds','#b9caca','wool',"DisplayText2593, DisplayText2594.",["DisplayText2595","DisplayText2596","DisplayText2597"]),
 item('rfOakPlatform',"DisplayText2598",[2.35,2.65,.84],2800,'bedroom','comfort','beds','#c09768','oak',"DisplayText2599, DisplayText2600.",["DisplayText2601","DisplayText2602","DisplayText2603"]),
 item('rfCaneDouble',"DisplayText2604",[2.32,2.65,1.22],4200,'bedroom','comfort','beds','#c2a171','oak',"DisplayText2605, DisplayText2606.",["DisplayText2607","DisplayText2608","DisplayText1550"]),
 item('rfWalnutSleigh',"DisplayText2609",[2.48,2.74,1.28],5600,'bedroom','signature','beds','#8f6d53','walnut',"DisplayText2610, DisplayText2611.",["DisplayText2612","DisplayText2613","DisplayText2614"]),
 item('rfFlutedKing',"DisplayText2615",[2.72,2.78,1.26],6200,'bedroom','signature','beds','#b8a9c9','velvet',"DisplayText2616, DisplayText2617.",["DisplayText2618","DisplayText2619","DisplayText2620"]),
 item('rfCanopyKing',"DisplayText2621",[2.74,2.86,2.06],7600,'bedroom','signature','beds','#aebdca','linen',"DisplayText2622, DisplayText2623, DisplayText2624.",["DisplayText2625","DisplayText2626","DisplayText2627"]),
 item('rfGrandHotel',"DisplayText2628",[3.10,2.90,1.20],9800,'bedroom','signature','beds','#d9c8b2','velvet',"DisplayText2629, DisplayText2630, DisplayText2631.",["DisplayText2632","DisplayText2633","DisplayText2634"]),
 item('rfHouseSingle',"DisplayText2635",[1.82,2.60,1.94],3800,'bedroom','comfort','beds','#c3a580','oak',"DisplayText2636, DisplayText2637.",["DisplayText2638","DisplayText2639","DisplayText2640"]),
 item('rfRoundBed',"DisplayText2641",[2.88,2.88,1.18],7200,'bedroom','signature','beds','#bea9c6','velvet',"DisplayText2642, DisplayText2643.",["DisplayText2644","DisplayText2645","DisplayText2646"]),
 item('rfPanelStorageKing',"DisplayText2647",[2.76,2.82,1.18],6800,'bedroom','signature','beds','#9fbbaf','oak',"DisplayText2648, DisplayText2649.",["DisplayText2650","DisplayText2651","DisplayText2652"]),
 item('rfFourSeatTable',"DisplayText2653",[2.10,1.16,.96],1600,'dining','essential','diningTables','#c9a075','oak',"DisplayText2654, DisplayText2655.",["DisplayText2656","DisplayText2657","DisplayText2658"],top(1.92,.98,.96)),
 item('rfSixSeatTable',"DisplayText2659",[2.72,1.28,.98],2800,'dining','comfort','diningTables','#b38c62','oak',"DisplayText2660, DisplayText2661, DisplayText2662.",["DisplayText2663","DisplayText1598","DisplayText2664"],top(2.54,1.10,.98)),
 item('rfEightSeatTable',"DisplayText2665",[3.40,1.46,1.00],5600,'dining','signature','diningTables','#e6dccb','marble',"DisplayText2666, DisplayText2667.",["DisplayText2668","DisplayText2669","DisplayText2670"],top(3.18,1.20,1.00)),
 item('rfRoundDining',"DisplayText2671",[1.96,1.96,.97],3000,'dining','comfort','diningTables','#b2c2b1','oak',"DisplayText2672, DisplayText2673.",["DisplayText2674","DisplayText2675","DisplayText2676"],top(1.30,1.30,.97)),
 item('rfOvalDining',"DisplayText2677",[3.08,1.52,.98],6200,'dining','signature','diningTables','#d5cbb7','marble',"DisplayText2678, DisplayText2679, DisplayText2680.",["DisplayText2681","DisplayText2682","DisplayText2683"],top(2.04,1.00,.98)),
 item('rfExpandedDining',"DisplayText2684",[3.46,1.38,.98],4800,'dining','signature','diningTables','#b38a63','oak',"DisplayText2685, DisplayText2686.",["DisplayText2687","DisplayText2688","DisplayText2689"],top(3.24,1.16,.98)),
 item('rfFarmhouseTable',"DisplayText2690",[2.82,1.36,1.01],3800,'dining','comfort','diningTables','#b98e64','oak',"DisplayText2691XDisplayText2692, DisplayText2693.",["DisplayText2694","DisplayText2695XDisplayText2696","DisplayText2697"],top(2.62,1.16,1.01)),
 item('rfWideDesk',"DisplayText2698",[2.16,1.00,.98],2200,'study','essential','desks','#aec3b6','oak',"DisplayText2699, DisplayText2700, DisplayText2701.",["DisplayText1604","DisplayText2702","DisplayText2703"],top(1.96,.80,.98)),
 item('rfStudioDesk',"DisplayText2704",[2.70,1.16,.97],3600,'study','comfort','desks','#bfa17f','oak',"DisplayText2705, DisplayText2706.",["DisplayText2707","DisplayText2708","DisplayText2709"],top(2.48,.94,.97)),
 item('rfDoubleDesk',"DisplayText2710",[3.46,1.12,1.04],5200,'study','signature','desks','#a5b9c9','oak',"DisplayText2711, DisplayText2712.",["DisplayText2713","DisplayText2714","DisplayText2715"],top(3.24,.90,1.04)),
 item('rfCornerDesk',"DisplayText2716LDisplayText2717",[2.76,1.94,.99],4600,'study','signature','desks','#a5bba8','oak',"DisplayText2718, LDisplayText2719.",["DisplayText1903LDisplayText2720","DisplayText2721","DisplayText2722"],top(2.52,.70,.99,0,.50)),
 item('rfWideCoffee',"DisplayText2723",[2.10,1.20,.56],2800,'comfort','comfort','coffeeTables','#ddd0b7','marble',"DisplayText2724, DisplayText2725.",["DisplayText2726","DisplayText2727","DisplayText2728"],top(1.86,.96,.56)),
 item('rfRoundCoffee',"DisplayText2729",[1.52,1.52,.54],2200,'comfort','comfort','coffeeTables','#c2b5c9','ceramic',"DisplayText2730, DisplayText2731.",["DisplayText2732","DisplayText2733","DisplayText2734"],top(.98,.98,.54)),
 item('rfBreakfastBar',"DisplayText2735",[2.56,.92,1.20],3400,'dining','comfort','barTables','#b58e69','oak',"DisplayText2736, DisplayText2737, DisplayText2738.",["DisplayText2739","DisplayText2740","DisplayText2741"],top(2.34,.70,1.20)),
]);
