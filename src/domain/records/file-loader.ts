// FILE: src/domain/records/file-loader.ts
// Helpers for loading records stored as pure YAML (legacy front matter + body supported as fallback).

import YAML from "yaml";

export interface LoadedRecordFile {
  path: string;
  frontMatter: any;
  markdown: string;
}

// NOTE: This function assumes files are accessible via fetch() from the GitHub Pages site.
// For local tooling (e.g., Node + Cline), provide a different implementation.
export async function loadRecordFile(
  path: string
): Promise<LoadedRecordFile> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(
      `Failed to load record file ${path}: ${res.status} ${res.statusText}`
    );
  }
  const text = await res.text();
  const { frontMatter, markdown } = splitFrontMatter(text);
  return { path, frontMatter, markdown };
}

// Very basic splitter: supports legacy front matter + body, but prefers pure YAML.
function splitFrontMatter(
  text: string
): { frontMatter: any; markdown: string } {
  const boundary = /^---\s*$/m;
  const parts = text.split(boundary);

  // Legacy front matter + body: --- yaml --- body
  if (parts.length >= 3) {
    const [, yamlBlock, ...rest] = parts;
    const markdown = rest.join("---\n").trimStart();
    try {
      return { frontMatter: YAML.parse(yamlBlock) || {}, markdown };
    } catch {
      return { frontMatter: {}, markdown };
    }
  }

  // Default: treat the entire file as YAML
  try {
    return { frontMatter: YAML.parse(text) || {}, markdown: "" };
  } catch {
    return { frontMatter: {}, markdown: "" };
  }
}
