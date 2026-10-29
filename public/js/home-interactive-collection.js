/** Original usable entertainment furniture. Prices are game points. Screens
 * face local +z and the included remote remains one owned part of the unit. */
const television=(id,name,dimensions,price,tier,color,description)=>Object.freeze({
  id,label:name,name,width:dimensions[0],depth:dimensions[1],height:dimensions[2],price,tier,
  defaultColor:color,material:tier==='essential'?'oak':'walnut',placement:'floor',category:'living',
  family:'televisions',familyLabel:"DisplayText1154",collection:'interactive-home-2026-10',
  description,tags:Object.freeze(["DisplayText1155","DisplayText1156","DisplayText1157","DisplayText1158","Living room","DisplayText1159","DisplayText1160"]),
});
export const INTERACTIVE_COLLECTION=Object.freeze([
  television('ipRetroTelevision',"DisplayText1161",[1.48,.68,1.55],2400,'essential','#c99563',
    "DisplayText1162, DisplayText1163, DisplayText1164.DisplayText1165, DisplayText1166."),
  television('ipWideTelevision',"DisplayText1167",[2.20,.70,1.86],6200,'comfort','#8eb8af',
    "DisplayText1168, DisplayText1169, DisplayText1170.DisplayText1171."),
  television('ipCinemaTelevision',"DisplayText1172",[3.06,.74,2.18],12800,'signature','#55575c',
    "DisplayText1173, DisplayText1174, DisplayText1175.DisplayText1176, DisplayText1177."),
]);
