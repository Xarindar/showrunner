export type TermsNode={type:string;text?:string;attrs?:Record<string,string|number|null>;marks?:Array<{type:string}>;content?:TermsNode[]};
export const termsFields: Record<string,string>;
export function validateTermsDocument(document:unknown):TermsNode;
export function plainTermsDocument(text:string):TermsNode;
export type TermsPackage={name?:string;durationMinutes?:number;unlimitedDuration?:boolean;priceCents?:number|null;deliverables?:{finalPhotos?:number|null;locations?:number|null;outfitChanges?:number|null};coverage?:string[];extras?:Array<{name:string;quantity?:number}>};
export type TermsInput={serviceName:string;package?:TermsPackage|null;priceCents?:number|null;durationMinutes:number;startsAt?:Date|string;timezone:string;customerName?:string;customerEmail?:string;customerPhone?:string};
export function bookingTermsValues(input:TermsInput):Record<string,string>;
export function renderTermsDocument(document:TermsNode,values?:Record<string,string>):{html:string;text:string};
export function renderBookingTerms(rules:Array<{kind:string;label:string;richText?:TermsNode}>,values:Record<string,string>):{html:string;text:string};
