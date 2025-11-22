// FILE: src/domain/records/validator.ts
// Glue between loaded records and the validation engine (Zod, JSON Schema, etc.).

import { RecordSchemas } from "../schema/types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Validator {
  validate(recordType: string, frontMatter: any): ValidationResult;
}

// Placeholder implementation. Wire this up to Zod or JSON Schema
// based on your generated validators.
export class NoopValidator implements Validator {
  constructor(private readonly schemas: RecordSchemas) {}

  validate(recordType: string, frontMatter: any): ValidationResult {
    if (!this.schemas[recordType]) {
      console.warn(`No schema registered for recordType=${recordType}`);
    }
    // TODO: implement proper validation using Zod or JSON Schema.
    return { valid: true, errors: [] };
  }
}
