import {canonicalRecruiteeOffer} from './recruitee-form-capability';
/** Exact reviewed offers only; does not add tenants to discovery. */
export function reviewedOfferUrls(raw: string | undefined): string[] {
 if (!raw?.trim()) return [];
 const values=[...new Set(raw.split(',').map(x=>x.trim()))];
 if(values.length>5||values.some(x=>canonicalRecruiteeOffer(x)!==x||x.startsWith('https://produzioneweb.recruitee.com/o/lavorai-test-')))return [];
 return values;
}
