import {portalRequest} from '../../../../lib/portal.server';import {defaultSettings} from '../../../../lib/portal-settings';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await portalRequest('/settings'),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({settings:defaultSettings,unavailable:true},{headers:{'Cache-Control':'no-store'}});}}
