// FILE: src/domain/workflow/loader.ts
import { AnyStateMachine, createMachine } from "xstate";
import { WorkflowBundle } from "./types";
import { loadYaml } from "../schema/loader-utils";

/**
 * Loads all workflow machines described in workflow/<schema-set>/manifest.yaml.
 * The manifest should look like:
 *
 * machines:
 *   - project.machine.yaml
 *   - experiment.machine.yaml
 *   - run.machine.yaml
 */
export async function loadWorkflowBundle(
  schemaSet: string
): Promise<WorkflowBundle> {
  const manifestPath = `workflow/${schemaSet}/manifest.yaml`;
  const manifest = (await loadYaml(manifestPath)) as { machines: string[] };

  const machines: { [recordType: string]: AnyStateMachine } = {};

  for (const fname of manifest.machines) {
    const path = `workflow/${schemaSet}/${fname}`;
    const config = (await loadYaml(path)) as any;
    // Derive recordType from filename, e.g. "experiment.machine.yaml" → "experiment"
    const recordType = fname.replace(/\.machine\.yaml$/, "");
    machines[recordType] = createMachine(config);
  }

  return {
    schemaSet,
    machines,
  };
}
