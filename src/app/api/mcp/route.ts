import { prisma } from "@/lib/db";
import { handleMcp, supportedMcpVersions, type JobRepository } from "@/lib/mcp-server";
import { mcpLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const jobFields = {
  id: true, title: true, company: true, location: true, url: true,
  source: true, remote: true, contractType: true, salaryMin: true,
  salaryMax: true, postedAt: true,
} as const;

const jobs: JobRepository = {
  async search({ query, location, remoteOnly, limit }) {
    return prisma.job.findMany({
      where: {
        closedAt: null,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { company: { contains: query, mode: "insensitive" } },
        ],
        ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
        ...(remoteOnly ? { remote: true } : {}),
      },
      select: jobFields,
      orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      take: limit,
    });
  },
  async get(id) {
    const job = await prisma.job.findFirst({ where: { id, closedAt: null }, select: { ...jobFields, description: true } });
    return job ? { ...job, description: job.description.slice(0, 16000) } : null;
  },
};

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Server-to-server MCP clients don't send Origin.
  const allowed = new Set(["https://lavorai.it", "https://chatgpt.com"]);
  if (process.env.NODE_ENV !== "production") allowed.add("http://localhost:3000");
  return allowed.has(origin);
}

// Streamable HTTP is stateless and returns JSON; no SSE listener is offered.
export async function GET(request: Request) {
  if (!allowedOrigin(request)) return new Response(null, { status: 403 });
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request) {
  if (!allowedOrigin(request)) return new Response(null, { status: 403 });
  const version = request.headers.get("mcp-protocol-version");
  if (version && !supportedMcpVersions.includes(version)) return new Response("Unsupported MCP version", { status: 400 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return new Response(null, { status: 415 });
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) return new Response(null, { status: 406 });
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = await mcpLimiter.limit(ip);
  if (!limited.success) return new Response(null, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limited.reset - Date.now()) / 1000))) } });
  // Bound chunked bodies too, rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Empty request" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); return new Response(null, { status: 413 }); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  const response = await handleMcp(body, jobs);
  return response === null
    ? new Response(null, { status: 202 })
    : Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
