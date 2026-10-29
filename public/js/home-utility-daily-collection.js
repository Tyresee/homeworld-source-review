/** Original everyday utility assortment; prices are game points, dimensions are world units. */
const names={cleaning:"DisplayText2767",laundry:"DisplayText2768",storage:"DisplayText3504",living:"DisplayText3505"};
const tiers={essential:"Essential",comfort:"Comfort",signature:"Signature"};
const add=(id,label,dimensions,color,material,price,category,placement,tier,family,familyLabel,description,tags=[],supportSurface)=>Object.freeze({
 id,label,name:label,width:dimensions[0],depth:dimensions[1],height:dimensions[2],defaultColor:color,material,price,category,placement,tier,family,familyLabel,description,
 collection:'daily-utility-2026-10-17',tags:Object.freeze([label,familyLabel,names[category],tiers[tier],...tags]),...(supportSurface?{supportSurface:Object.freeze(supportSurface)}:{})
});
export const UTILITY_DAILY_COLLECTION=Object.freeze([
 add('udBroomDustpan',"DisplayText3506",[.67,.41,1.38],'#9dbbae','ceramic',180,'cleaning','floor','essential','cleaning-hand-tools',"DisplayText3507","DisplayText3508, DisplayText3509.",["DisplayText3510","DisplayText3511","DisplayText3512"]),
 add('udMopBucket',"DisplayText3513",[.73,.46,1.35],'#7bafbd','ceramic',300,'cleaning','floor','comfort','cleaning-hand-tools',"DisplayText3507","DisplayText3514, DisplayText3515.",["DisplayText3516","DisplayText3517"]),
 add('udCanisterVacuum',"DisplayText3518",[.86,.55,.91],'#d1a56e','ceramic',800,'cleaning','floor','comfort','vacuum-cleaners',"DisplayText3519","DisplayText3520, DisplayText3521, DisplayText3522.",["DisplayText3523","DisplayText3524"]),
 add('udStickVacuum',"DisplayText3525",[.49,.42,1.33],'#a2b6ce','ceramic',1200,'cleaning','floor','comfort','vacuum-cleaners',"DisplayText3519","DisplayText3526, DisplayText3527.",["DisplayText3523","DisplayText3528"]),
 add('udRobotVacuum',"DisplayText3529",[.68,.72,.44],'#a3bcaa','ceramic',1800,'cleaning','floor','signature','vacuum-cleaners',"DisplayText3519","DisplayText3530, DisplayText3531, DisplayText3532.",["DisplayText3533","DisplayText3534"]),
 add('udCleaningCaddy',"DisplayText3535",[.56,.36,.55],'#e6bd83','ceramic',260,'cleaning','table','essential','cleaning-supplies',"DisplayText3536","DisplayText3537, DisplayText3538, DisplayText3539.",["DisplayText3540","DisplayText3541","DisplayText3542"]),
 add('udDetergent',"DisplayText3543",[.52,.30,.43],'#91b9c7','ceramic',160,'laundry','table','essential','laundry-supplies',"DisplayText3544","DisplayText3545, DisplayText3546, DisplayText3547.",["DisplayText0457","DisplayText0458"]),
 add('udIroningBoard',"DisplayText3548",[1.45,.49,.96],'#a9becb','linen',400,'laundry','floor','comfort','ironing',"DisplayText3549","DisplayText3550, DisplayText3551.",["DisplayText3552","DisplayText3553"]),
 add('udIron',"DisplayText3554",[.42,.25,.27],'#c897a3','ceramic',300,'laundry','table','essential','ironing',"DisplayText3549","DisplayText3555, DisplayText3556.",["DisplayText3557","DisplayText3558"]),
 add('udDryingRack',"DisplayText3559",[1.63,.69,1.02],'#a6bdb5','ceramic',400,'laundry','floor','comfort','drying-racks',"DisplayText3560","DisplayText3561, X DisplayText3562.",["DisplayText3563","DisplayText3564"]),
 add('udHangerRack',"DisplayText3565",[1.14,.51,1.58],'#bfa276','oak',500,'laundry','floor','comfort','drying-racks',"DisplayText3560","DisplayText3566, DisplayText3567.",["DisplayText3568","DisplayText3569","DisplayText3570"]),
 add('udClothesSteamer',"DisplayText3571",[.65,.48,1.58],'#d9b9a0','ceramic',800,'laundry','floor','comfort','ironing',"DisplayText3549","DisplayText3572, DisplayText3573, DisplayText3574.",["DisplayText3575","DisplayText3576"]),
 add('udDryer',"DisplayText3577",[.77,.72,.97],'#d9ba81','ceramic',2400,'laundry','floor','signature','laundry-machines',"DisplayText3578","DisplayText3579, DisplayText3580.",["DisplayText3581","DisplayText3582"],{width:.62,depth:.53,height:.94}),
 add('udSortingBins',"DisplayText3583",[1.12,.51,.92],'#9bb5a8','linen',500,'laundry','floor','comfort','laundry-sorting',"DisplayText3584","DisplayText3585, DisplayText3586.",["DisplayText3587","DisplayText3588"]),
 add('udFoldedTowels',"DisplayText3589",[.56,.41,.30],'#d1ad96','wool',160,'laundry','table','essential','linen-storage',"DisplayText3590","DisplayText3591, DisplayText3592.",["DisplayText0405","DisplayText0335"]),
 add('udBlanketBasket',"DisplayText3593",[.64,.49,.64],'#bfa279','oak',280,'storage','floor','essential','linen-storage',"DisplayText3590","DisplayText3594, DisplayText3595.",["DisplayText3596","DisplayText3597","DisplayText3598"]),
 add('udToolbox',"DisplayText3599",[.62,.35,.39],'#a2b7a2','ceramic',300,'storage','table','comfort','repair-supplies',"DisplayText3600","DisplayText3601, DisplayText3602, DisplayText3603.",["DisplayText3604","DisplayText3605","DisplayText3606"]),
 add('udFirstAidBox',"DisplayText3607",[.52,.34,.38],'#e1bb9f','ceramic',300,'storage','table','essential','health-storage',"DisplayText3608","DisplayText3609, DisplayText3610.",["DisplayText0366","DisplayText3611","DisplayText3612"]),
 add('udSewingMachine',"DisplayText3613",[.66,.33,.61],'#a4bfb5','ceramic',1200,'living','table','signature','sewing',"DisplayText3614","DisplayText3615, DisplayText3616, DisplayText3617.",["DisplayText3618","DisplayText3619"]),
 add('udSewingBox',"DisplayText3620",[.49,.34,.40],'#b99675','oak',280,'storage','table','essential','sewing',"DisplayText3614","DisplayText3621, DisplayText3622.",["DisplayText3623","DisplayText3624"]),
 add('udStandingFan',"DisplayText3625",[.59,.45,1.29],'#a4bdb1','ceramic',600,'living','floor','comfort','air-care',"DisplayText3626","DisplayText3627, DisplayText3628.",["DisplayText3629","DisplayText3630"]),
 add('udAirPurifier',"DisplayText3631",[.51,.42,.91],'#e1cfb0','ceramic',1400,'living','floor','signature','air-care',"DisplayText3626","DisplayText3632, DisplayText3633.",["DisplayText3634","DisplayText3635"]),
 add('udHumidifier',"DisplayText3636",[.39,.34,.41],'#a9c5cc','ceramic',300,'living','table','essential','air-care',"DisplayText3626","DisplayText3637, DisplayText3638.",["DisplayText3639","DisplayText2919"]),
 add('udTissueBox',"DisplayText3640",[.42,.27,.26],'#c4b5d4','linen',240,'storage','table','comfort','everyday-storage',"DisplayText3641","DisplayText3642, DisplayText3643, DisplayText3644.",["DisplayText0302","DisplayText3645","DisplayText3646","DisplayText3647"]),
 add('udPedalBin',"DisplayText3648",[.40,.40,.62],'#9dafba','ceramic',190,'cleaning','floor','essential','waste-sorting',"DisplayText3649","DisplayText3650, DisplayText3651, DisplayText3652.",["DisplayText0321","DisplayText3653","DisplayText3654","DisplayText3655"]),
 add('udRecyclingStation',"DisplayText3656",[.83,.48,.77],'#c3b48b','ceramic',400,'cleaning','floor','comfort','waste-sorting',"DisplayText3649","DisplayText3657, DisplayText3658.",["DisplayText3659","DisplayText3403"]),
 add('udStorageBoxes',"DisplayText3660",[.72,.49,.76],'#9fbcc2','ceramic',300,'storage','floor','essential','everyday-storage',"DisplayText3641","DisplayText3661, DisplayText3662.",["DisplayText3663","DisplayText1143","DisplayText3664"]),
 add('udStepStool',"DisplayText3665",[.67,.57,.54],'#bba077','oak',300,'storage','floor','essential','household-helpers',"DisplayText3666","DisplayText3667, DisplayText3668.",["DisplayText3669","DisplayText3670","DisplayText3671"]),
 add('udLintRoller',"DisplayText3672",[.31,.27,.43],'#b4c4a6','ceramic',80,'laundry','table','essential','laundry-supplies',"DisplayText3544","DisplayText3673.",["DisplayText3674","DisplayText3675"]),
 add('udShoeDryer',"DisplayText3676",[.52,.38,.53],'#bdc6ab','ceramic',400,'laundry','floor','comfort','laundry-machines',"DisplayText3578","DisplayText3677, DisplayText3678.",["DisplayText3679","DisplayText3680"]),
 add('udDehumidifier',"DisplayText3681",[.53,.42,.82],'#a7c1c7','ceramic',1000,'living','floor','comfort','air-care',"DisplayText3626","DisplayText3682, DisplayText3683.",["DisplayText3684","DisplayText3685"]),
 add('udExtensionReel',"DisplayText3686",[.47,.33,.49],'#d8b37e','ceramic',300,'storage','floor','comfort','repair-supplies',"DisplayText3600","DisplayText3687, DisplayText3688, DisplayText3689.",["DisplayText3690","DisplayText3691","DisplayText3692"]),
]);
