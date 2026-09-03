import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyBrandName } from "./brand-name";

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

export async function loadDocFile(filename: string): Promise<string> {
  const filePath = path.join(DOCS_DIR, filename);
  const content = await readFile(filePath, "utf8");
  return applyBrandName(content);
}
