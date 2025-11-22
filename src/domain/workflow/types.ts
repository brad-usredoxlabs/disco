// FILE: src/domain/workflow/types.ts
import { AnyStateMachine } from "xstate";

export interface WorkflowBundle {
  schemaSet: string;
  machines: {
    [recordType: string]: AnyStateMachine;
  };
}
