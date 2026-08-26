import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT_FILES = new Set(["cv.md", "article-digest.md", "voice-dna.md"]);
const ROOT_DIRS = new Set(["documents", "output", "reports", "interview-prep", "writing-samples", "jds"]);
const INLINE = new Set(["md", "txt", "pdf", "png", "jpg", "jpeg", "webp", "gif"]);
const MIME: Record<string, string> = {
  md: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  json: "application/json; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
};

export async function GET(req: Request) {
  const requested = new URL(req.url).searchParams.get("path") ?? "";
  const relative = requested.replaceAll("\\", "/");
  if (!relative || relative.includes("\0") || path.posix.isAbsolute(relative) || path.posix.normalize(relative) !== relative || relative.split("/").includes("..")) {
    return Response.json({ error: "invalid artifact path" }, { status: 400 });
  }

  const root = careerOpsRoot();
  const first = relative.split("/")[0];
  const exactRootFile = !relative.includes("/") && ROOT_FILES.has(relative);
  if (!exactRootFile && !ROOT_DIRS.has(first)) return Response.json({ error: "artifact path not allowed" }, { status: 403 });

  const candidate = path.join(root, ...relative.split("/"));
  let realFile: string;
  try {
    realFile = fs.realpathSync(candidate);
    if (!fs.statSync(realFile).isFile()) throw new Error("not a file");
    const realRoot = fs.realpathSync(root);
    if (exactRootFile) {
      if (path.dirname(realFile) !== realRoot || !ROOT_FILES.has(path.basename(realFile))) throw new Error("outside root file allowlist");
    } else {
      const realBase = fs.realpathSync(path.join(root, first));
      if (!realFile.startsWith(realBase + path.sep)) throw new Error("outside artifact directory");
    }
  } catch {
    return Response.json({ error: "artifact not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(realFile);
  } catch {
    return Response.json({ error: "artifact could not be read" }, { status: 500 });
  }
  const extension = path.extname(realFile).slice(1).toLowerCase();
  const filename = path.basename(realFile).replace(/["\r\n]/g, "_");
  const disposition = INLINE.has(extension) ? "inline" : "attachment";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": MIME[extension] ?? "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
