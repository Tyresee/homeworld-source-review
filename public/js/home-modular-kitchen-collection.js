/** Original modular kitchen assortment. Prices are game points, sizes are
 * readable game-world proportions; these are not real appliance specifications. */
const SERIES=Object.freeze({cream:{label:"DisplayText1779",color:'#e7d8b5',material:'ceramic'},oak:{label:"DisplayText1780",color:'#b98a54',material:'oak'},pro:{label:"DisplayText1781",color:'#577b7b',material:'ceramic'}});
const labels={hob:"DisplayText1782",dishwasher:"DisplayText1783",sink:"DisplayText1784",base:"DisplayText1785",corner:"DisplayText1786",island:"DisplayText1787",'oven-tower':"DisplayText1788",pantry:"DisplayText1789",fridge:"DisplayText1790",'wall-cabinet':"DisplayText1791",hood:"DisplayText1402",'countertop-appliance':"DisplayText1792"};
const dockRoles=new Set(['hob','dishwasher','sink','base']);
const item=(id,label,width,depth,height,price,role,series,tier,description,options={})=>{
 const style=SERIES[series],placement=options.placement??'floor',canDock=placement==='floor'&&dockRoles.has(role);
 return Object.freeze({id,label,name:label,width,depth,height,price,defaultColor:style.color,material:style.material,category:'kitchen',placement,tier,family:`modular-${options.familyRole??role}`,familyLabel:labels[options.familyRole??role],collection:'modular-kitchen-2026-10-25',description,
  tags:Object.freeze([label,labels[role],style.label,"Kitchen","DisplayText1793","DisplayText1794",...options.tags??[]]),
  kitchenFit:Object.freeze({series,seriesLabel:style.label,moduleWidth:width,depth,worktopHeight:1.02,role,canDock}),
  ...(options.robotAction?{robotAction:options.robotAction}:{}),...(options.supportSurface?{supportSurface:Object.freeze(options.supportSurface)}:{}),model:options.model??id,
 });
};
const floor=(id,label,w,price,role,series,tier,description,options={})=>item(id,label,w,.84,options.height??1.1,price,role,series,tier,description,options);
export const MODULAR_KITCHEN_COLLECTION=Object.freeze([
 floor('mkSingleHob',"DisplayText1795",.65,1100,'hob','cream','essential',"DisplayText1796, DisplayText1797, DisplayText1798, DisplayText1799.",{robotAction:'cook',tags:["DisplayText1800","DisplayText1801","DisplayText1802"]}),
 floor('mkDoubleGas',"DisplayText1803",.85,1900,'hob','oak','comfort',"DisplayText1804, DisplayText1805, DisplayText1806.",{robotAction:'cook',tags:["DisplayText1800","DisplayText1807"]}),
 floor('mkFourGas',"DisplayText1808",1.2,3200,'hob','cream','comfort',"DisplayText1809, DisplayText1810, DisplayText1811, DisplayText1812.",{robotAction:'cook',tags:["DisplayText1800","DisplayText1813"]}),
 floor('mkInduction',"DisplayText1814",1.2,4100,'hob','pro','signature',"DisplayText1815, DisplayText1816.",{robotAction:'cook',tags:["DisplayText1800","DisplayText1817","DisplayText1818"]}),
 floor('mkRangeOven',"DisplayText1819",1.2,4900,'hob','cream','comfort',"DisplayText1820, DisplayText1821, DisplayText1822.",{robotAction:'cook',tags:["DisplayText1800","DisplayText1823","DisplayText1824"]}),
 floor('mkWideRange',"DisplayText1825",1.7,8200,'hob','oak','signature',"DisplayText1826, DisplayText1827.",{robotAction:'cook',tags:["DisplayText1800","DisplayText1828","DisplayText1829"]}),
 floor('mkSteelRange',"DisplayText1830",1.7,9600,'hob','pro','signature',"DisplayText1831, DisplayText1832, DisplayText1833.",{robotAction:'cook',tags:["DisplayText1800","DisplayText1834","DisplayText1835"]}),
 floor('mkSlimDishwasher',"DisplayText1836",.65,2600,'dishwasher','cream','essential',"DisplayText1837, DisplayText1838, DisplayText1839.",{robotAction:'dishwash',height:1.02,tags:["DisplayText1783","DisplayText1840","45DisplayText1841"]}),
 floor('mkDishwasher',"DisplayText1842",.85,3700,'dishwasher','cream','comfort',"DisplayText1843, DisplayText1844, DisplayText1845, DisplayText1846.",{robotAction:'dishwash',height:1.02,tags:["DisplayText1783","60DisplayText1841"]}),
 floor('mkIntegratedDishwasher',"DisplayText1847",.85,4300,'dishwasher','oak','comfort',"DisplayText1848, DisplayText1849.",{robotAction:'dishwash',height:1.02,tags:["DisplayText1783","DisplayText1850"]}),
 floor('mkDrawerDishwasher',"DisplayText1851",1.2,6400,'dishwasher','cream','signature',"DisplayText1852, DisplayText1853.",{robotAction:'dishwash',height:1.02,tags:["DisplayText1783","DisplayText1854"]}),
 floor('mkProDishwasher',"DisplayText1855",.85,5900,'dishwasher','pro','signature',"DisplayText1856, DisplayText1857, DisplayText1858, DisplayText1859.",{robotAction:'dishwash',height:1.02,tags:["DisplayText1783","DisplayText1860"]}),
 floor('mkSingleSink',"DisplayText1861",.85,1800,'sink','cream','essential',"DisplayText1862, DisplayText1863, DisplayText1864.",{robotAction:'wash',height:1.55,tags:["DisplayText1865","DisplayText1866"]}),
 floor('mkDoubleSink',"DisplayText1867",1.2,2900,'sink','oak','comfort',"DisplayText1868, DisplayText1869, DisplayText1870.",{robotAction:'wash',height:1.55,tags:["DisplayText1865","DisplayText1871"]}),
 floor('mkFarmhouseSink',"DisplayText1872",1.2,4200,'sink','cream','signature',"DisplayText1873, DisplayText1874, DisplayText1875.",{robotAction:'wash',height:1.55,tags:["DisplayText1865","DisplayText1876","DisplayText0763"]}),
 floor('mkSteelSink',"DisplayText1877",1.7,5700,'sink','pro','signature',"DisplayText1878, DisplayText1879.",{robotAction:'wash',height:1.55,tags:["DisplayText1865","DisplayText1871","DisplayText1880"]}),
 floor('mkBaseDoor',"DisplayText1881",.85,950,'base','cream','essential',"DisplayText1882, DisplayText1883, DisplayText1884.",{height:1.02,supportSurface:{width:.73,depth:.70,height:1.02},tags:["DisplayText1885","DisplayText1417","DisplayText1886"]}),
 floor('mkBaseDrawers',"DisplayText1887",.85,1600,'base','oak','comfort',"DisplayText1888, DisplayText1889, DisplayText1890, DisplayText1891.",{height:1.02,supportSurface:{width:.73,depth:.70,height:1.02},tags:["DisplayText1885","DisplayText1892","DisplayText1886"]}),
 floor('mkWideDrawers',"DisplayText1893",1.2,2700,'base','pro','signature',"DisplayText1894, DisplayText1895.",{height:1.02,supportSurface:{width:1.08,depth:.70,height:1.02},tags:["DisplayText1885","DisplayText1892","DisplayText1886"]}),
 floor('mkPullout',"DisplayText1896",.65,1300,'base','oak','essential',"DisplayText1897, DisplayText1898.",{height:1.02,supportSurface:{width:.53,depth:.70,height:1.02},tags:["DisplayText1885","DisplayText1899","DisplayText1900"]}),
 item('mkCorner',"DisplayText1901LDisplayText1902",1.2,1.2,1.02,2800,'corner','oak','comfort',"DisplayText1903LDisplayText1904, DisplayText1905, DisplayText1906.",{tags:["DisplayText1885","DisplayText1907","LDisplayText0894"]}),
 item('mkBreakfastIsland',"DisplayText1908",1.7,1.2,1.02,3600,'island','cream','comfort',"DisplayText1909, DisplayText1910, DisplayText1911, DisplayText1912.",{supportSurface:{width:1.55,depth:1.03,height:1.02},tags:["DisplayText1913","DisplayText1914"]}),
 item('mkPrepIsland',"DisplayText1915",2.4,1.3,1.02,5800,'island','oak','signature',"DisplayText1916, DisplayText1917, DisplayText1918, DisplayText1919.",{supportSurface:{width:2.24,depth:1.12,height:1.02},tags:["DisplayText1913","DisplayText1920","DisplayText1921"]}),
 item('mkOvenTower',"DisplayText1922",.85,.84,2.25,6800,'oven-tower','pro','signature',"DisplayText1923, DisplayText1924, DisplayText1925.",{tags:["DisplayText1926","DisplayText1823","DisplayText1850"]}),
 item('mkPantryTower',"DisplayText1927",1.2,.84,2.25,4400,'pantry','oak','comfort',"DisplayText1928, DisplayText1929, DisplayText1930.",{tags:["DisplayText1926","DisplayText1931","DisplayText1932"]}),
 item('mkFrenchFridge',"DisplayText1933",1.2,.84,2.15,6900,'fridge','cream','signature',"DisplayText1934, DisplayText1935, DisplayText1936.",{tags:["DisplayText1790","DisplayText1937","DisplayText1938"]}),
 item('mkSlimFridge',"DisplayText1939",.85,.84,2.05,4400,'fridge','pro','comfort',"DisplayText1940, DisplayText1941, DisplayText1942.",{tags:["DisplayText1790","DisplayText1943"]}),
 item('mkWallCabinet',"DisplayText1944",.85,.42,.9,1600,'wall-cabinet','cream','essential',"DisplayText1945, DisplayText1946, DisplayText1947.",{placement:'wall',tags:["DisplayText1948","DisplayText1949"]}),
 item('mkGlassWallCabinet',"DisplayText1950",1.2,.42,.95,2800,'wall-cabinet','oak','comfort',"DisplayText1951, DisplayText1952.",{placement:'wall',tags:["DisplayText1948","DisplayText1953","DisplayText1954"]}),
 item('mkWideHood',"DisplayText1955",1.2,.72,1.0,2300,'hood','cream','comfort',"DisplayText1956, DisplayText1957, DisplayText1958, DisplayText1959.",{placement:'wall',tags:["DisplayText1401","DisplayText1402","DisplayText1960"]}),
 item('mkProHood',"DisplayText1961",1.7,.76,.85,3900,'hood','pro','signature',"DisplayText1962, DisplayText1963, DisplayText1964, DisplayText1965.",{placement:'wall',tags:["DisplayText1401","DisplayText1835"]}),
 item('mkPortableHob',"DisplayText1966",.68,.54,.15,650,'countertop-appliance','pro','essential',"DisplayText1967, DisplayText1968, DisplayText1969.",{placement:'table',familyRole:'hob',tags:["DisplayText1817","DisplayText1970"]}),
 item('mkSteamOven',"DisplayText1971",.78,.62,.65,2100,'countertop-appliance','cream','comfort',"DisplayText1972, DisplayText1973, DisplayText1974, DisplayText1975.",{placement:'table',tags:["DisplayText1823","DisplayText1976"]}),
 item('mkCounterDishwasher',"DisplayText1977",.78,.62,.68,1800,'countertop-appliance','cream','essential',"DisplayText1978, DisplayText1979, DisplayText1980.",{placement:'table',familyRole:'dishwasher',tags:["DisplayText1783","DisplayText1981"]}),
 item('mkWaterPurifier',"DisplayText1982",.42,.45,.75,1500,'countertop-appliance','pro','comfort',"DisplayText1983, DisplayText1984.",{placement:'table',tags:["DisplayText1985","DisplayText1986"]}),
 item('mkCoffeeBar',"DisplayText1987",.82,.58,.72,3300,'countertop-appliance','oak','signature',"DisplayText1988, DisplayText0991, DisplayText1989, DisplayText1990.",{placement:'table',tags:["DisplayText1991","DisplayText1992"]}),
]);
export const MODULAR_KITCHEN_SERIES=SERIES;
