// FILE: src/domain/workflow/guards.ts
// Guard implementations referenced in machine YAML (e.g. \"validation.passed\")

import { Validator } from \"../records/validator\";
import { LoadedRecordFile } from \"../records/file-loader\";

export interface WorkflowContext {
  recordType: string;
  record: LoadedRecordFile;
  validator: Validator;
  // extend with user roles, signoff info, etc. as needed
}

// These signatures match XState guard functions: (ctx, event) => boolean
export const guards = {
  \"validation.passed\": (ctx: WorkflowContext, _event: any): boolean => {
    const result = ctx.validator.validate(ctx.recordType, ctx.record.frontMatter);
    return result.valid;
  },

  // Placeholder: check signoff fields in front matter
  \"signoff.atLeastOne\": (ctx: WorkflowContext, _event: any): boolean => {
    const fm = ctx.record.frontMatter || {};
    const signoff = fm.signoff || {};
    const anyFilled = Object.values(signoff).some((v) => !!v);
    return anyFilled;
  },
};
