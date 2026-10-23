export const dynamic="force-dynamic"; export function GET(){return Response.json({node:process.version,probe:true},{headers:{"Cache-Control":"no-store"}})}
