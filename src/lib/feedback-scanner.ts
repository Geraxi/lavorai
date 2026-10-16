import { createConnection } from "node:net";
import { ReportError } from "./feedback-errors";

/** ClamAV INSTREAM on an operator-configured private socket. No public scanning
 * service, credential creation or implicit outbound document sharing. */
export async function scanFeedbackFile(data: Buffer): Promise<"clean" | "unavailable"> {
  const path = process.env.FEEDBACK_CLAMD_SOCKET;
  const host = process.env.FEEDBACK_CLAMD_HOST;
  if (!path && !host) return "unavailable";
  const port = Number(process.env.FEEDBACK_CLAMD_PORT ?? "3310");
  if (!path && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new ReportError("scanner_unavailable", 503);
  return new Promise((resolve, reject) => {
    const socket = createConnection(path ? { path } : { host, port });
    let reply = "", settled = false;
    const finish = (error?: ReportError) => { if (settled) return; settled = true; clearTimeout(deadline); socket.destroy(); error ? reject(error) : resolve("clean"); };
    const deadline = setTimeout(() => finish(new ReportError("scanner_unavailable", 503)), 8000);
    socket.on("error", () => finish(new ReportError("scanner_unavailable", 503)));
    socket.on("end", () => { if (!settled) finish(new ReportError("scanner_unavailable", 503)); });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < data.length; offset += 64 * 1024) {
        const chunk = data.subarray(offset, offset + 64 * 1024);
        const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length);
        socket.write(size); socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", chunk => {
      reply += chunk.toString("utf8");
      if (reply.length > 1024) return finish(new ReportError("scanner_unavailable", 503));
      if (!reply.includes("\0")) return;
      const message = reply.slice(0, reply.indexOf("\0"));
      if (message === "stream: OK") finish();
      else if (/^stream: .+ FOUND$/.test(message)) finish(new ReportError("attachment_rejected", 400));
      else finish(new ReportError("scanner_unavailable", 503));
    });
  });
}
