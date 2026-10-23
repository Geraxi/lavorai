import {NextResponse} from "next/server"; export function proxy(){const r=NextResponse.next();r.headers.set("x-probe-proxy","passed");return r;} export const config={matcher:["/api/runtime"]};
