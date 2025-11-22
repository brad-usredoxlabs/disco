// Utilities for loading YAML files in a browser-based environment.
// Requires js-yaml to be available: `npm install js-yaml`.

import * as yaml from "js-yaml";

export async function loadYaml(path: string): Promise<any> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(
      `Failed to load YAML from ${path}: ${res.status} ${res.statusText}`
    );
  }
  const text = await res.text();
  return yaml.load(text);
}
