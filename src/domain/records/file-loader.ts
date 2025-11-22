// FILE: src/domain/records/file-loader.ts
// Helpers for loading records from YAML front matter + Markdown body.

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

// Very basic YAML front matter splitter. Replace with gray-matter if desired.
// Currently returns the YAML block as a raw string; you can parse it with js-yaml
// or inject a parser via dependency injection.
function splitFrontMatter(
  text: string
): { frontMatter: any; markdown: string } {
  const boundary = /^---\s*$/m;
  const parts = text.split(boundary);
  if (parts.length < 3) {
    return { frontMatter: {}, markdown: text };
  }
  const [, yamlBlock, ...rest] = parts;
  const markdown = rest.join("---\n");
  return { frontMatter: yamlBlock, markdown: markdown.trimStart() };
}
