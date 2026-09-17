export const DESTINATION_COLORS=['#0369a1','#b45309','#7e22ce','#be123c','#047857','#4338ca','#a16207','#0e7490','#a21caf','#4d7c0f','#c2410c','#6d28d9'];
export const destinationColor=(companyIndex:number,cardIndex:number)=>DESTINATION_COLORS[(companyIndex*3+cardIndex)%DESTINATION_COLORS.length];
