import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export type DocumentKind = "pdf" | "docx" | "text" | "unsupported";

export function classifyDocument(filename: string): DocumentKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt" || ext === "md" || ext === "markdown") return "text";
  return "unsupported";
}

const MAX_EXTRACTED_CHARS = 20000;

function clip(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return `${text.slice(0, MAX_EXTRACTED_CHARS).trimEnd()}…`;
}

export async function extractDocumentText(
  filename: string,
  base64Content: string,
): Promise<string> {
  const kind = classifyDocument(filename);
  const buffer = Buffer.from(base64Content, "base64");
  if (buffer.length === 0) {
    throw new Error("empty document");
  }
  if (kind === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return clip(result.text ?? "");
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
  if (kind === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return clip(result.value ?? "");
  }
  if (kind === "text") {
    return clip(buffer.toString("utf8"));
  }
  throw new Error(
    `unsupported file type ".${filename.split(".").pop() ?? ""}" — use PDF, DOCX, TXT or MD`,
  );
}
