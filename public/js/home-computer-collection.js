/** Original table-mounted computers. Prices use the game's virtual points;
 * dimensions are the complete X/Z/Y envelope, including keyboards and mice. */
export const COMPUTER_COLLECTION_ID='computers-2026-11-03';
const computer=(id,name,dimensions,price,tier,color,description,features,tags)=>Object.freeze({
  id,label:name,name,width:dimensions[0],depth:dimensions[1],height:dimensions[2],price,tier,
  defaultColor:color,material:'ceramic',placement:'table',category:'study',family:'computers',familyLabel:"DisplayText4790",
  collection:COMPUTER_COLLECTION_ID,description,designFeatures:Object.freeze(features),
  tags:Object.freeze(["DisplayText4791","DisplayText4792","Study","DisplayText4793",'computer','PC',...tags]),
});
export const COMPUTER_COLLECTION=Object.freeze([
  computer('pcPocketLaptop',"DisplayText4794",[.46,.34,.34],1800,'essential','#7ac6b0',
    "DisplayText4795, DisplayText4796, DisplayText4797, DisplayText4798.",
    ["DisplayText4799","DisplayText4800","DisplayText4801","DisplayText4802"],["DisplayText4803","DisplayText4804","DisplayText4805","DisplayText4806",'laptop']),
  computer('pcStudyAllInOne',"DisplayText4807",[.66,.40,.54],3600,'comfort','#f1e4ce',
    "DisplayText4808, DisplayText4809, DisplayText4810.DisplayText4811.",
    ["DisplayText4812","DisplayText4813","DisplayText4814","DisplayText4815"],["DisplayText4816","DisplayText4806","DisplayText4817","DisplayText4818",'all in one']),
  computer('pcNeonDesktop',"DisplayText4819",[.98,.48,.60],6800,'signature','#34456f',
    "DisplayText4820, DisplayText4821, DisplayText4822, DisplayText4823.DisplayText4824.",
    ["DisplayText4825","DisplayText4826","DisplayText4827","DisplayText4828"],["DisplayText4818","DisplayText4817","DisplayText4829","DisplayText4830","DisplayText4831","DisplayText4832",'desktop']),
  computer('pcStudioDual',"DisplayText4833",[1.16,.50,.60],9800,'signature','#8a9db2',
    "DisplayText4834, DisplayText4835, DisplayText4836, DisplayText4837.DisplayText4838.",
    ["DisplayText4839","DisplayText4840","DisplayText4841","DisplayText4842"],["DisplayText4818","DisplayText4817","DisplayText4843","DisplayText4844","DisplayText4845","DisplayText4846","DisplayText4806",'studio']),
]);
