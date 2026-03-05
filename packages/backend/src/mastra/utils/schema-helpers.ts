import {
  createTool,
  type ToolAction,
  type ToolExecutionContext,
} from '@mastra/core/tools';
import { z } from 'zod';

type ZodTypeAny = z.ZodType;

function getSchemaType(schema: ZodTypeAny): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._zod?.def ?? (schema as any).def;
  return def?.type ?? '';
}

function getInnerType(schema: ZodTypeAny): ZodTypeAny | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._zod?.def ?? (schema as any).def;

  if (def?.innerType) {
    return def.innerType as ZodTypeAny;
  }

  if (def?.out) {
    return def.out as ZodTypeAny;
  }

  return null;
}

function getObjectShape(schema: ZodTypeAny): Record<string, ZodTypeAny> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._zod?.def ?? (schema as any).def;

  if (def?.type === 'object' && def?.shape) {
    return def.shape as Record<string, ZodTypeAny>;
  }

  return null;
}

function getArrayElementType(schema: ZodTypeAny): ZodTypeAny | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._zod?.def ?? (schema as any).def;

  if (def?.type === 'array' && def?.element) {
    return def.element as ZodTypeAny;
  }

  return null;
}

function isNullable(schema: ZodTypeAny): boolean {
  const type = getSchemaType(schema);

  if (type === 'nullable' || type === 'null') {
    return true;
  }

  if (type === 'optional') {
    const inner = getInnerType(schema);
    return inner ? isNullable(inner) : false;
  }

  if (type === 'default' || type === 'prefault') {
    const inner = getInnerType(schema);
    return inner ? isNullable(inner) : false;
  }

  if (type === 'pipe') {
    const inner = getInnerType(schema);
    return inner ? isNullable(inner) : false;
  }

  return false;
}

function isOptional(schema: ZodTypeAny): boolean {
  const type = getSchemaType(schema);

  if (type === 'optional' || type === 'undefined') {
    return true;
  }

  if (type === 'nullable') {
    const inner = getInnerType(schema);
    return inner ? isOptional(inner) : false;
  }

  if (type === 'default' || type === 'prefault') {
    const inner = getInnerType(schema);
    return inner ? isOptional(inner) : false;
  }

  if (type === 'pipe') {
    const inner = getInnerType(schema);
    return inner ? isOptional(inner) : false;
  }

  return false;
}

function getObjectSchema(schema: ZodTypeAny): ZodTypeAny | null {
  const type = getSchemaType(schema);

  if (type === 'object') {
    return schema;
  }

  if (type === 'pipe' || type === 'optional' || type === 'nullable') {
    const inner = getInnerType(schema);
    return inner ? getObjectSchema(inner) : null;
  }

  return null;
}

function convertNullToUndefinedSmart(
  value: unknown,
  schema: ZodTypeAny
): unknown {
  if (value === null) {
    if (isNullable(schema)) {
      return null;
    }
    if (isOptional(schema)) {
      return undefined;
    }
    return null;
  }

  if (Array.isArray(value)) {
    const elementType = getArrayElementType(schema);
    if (elementType) {
      return value.map((item) =>
        convertNullToUndefinedSmart(item, elementType)
      );
    }
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    const objectSchema = getObjectSchema(schema);
    if (objectSchema) {
      const shape = getObjectShape(objectSchema);
      if (shape) {
        return Object.fromEntries(
          Object.entries(value).map(([key, val]) => {
            const fieldSchema = shape[key];
            if (fieldSchema) {
              return [key, convertNullToUndefinedSmart(val, fieldSchema)];
            }
            return [key, val];
          })
        );
      }
    }
    return value;
  }

  return value;
}

export function withNullToUndefined<T extends ZodTypeAny>(schema: T) {
  return z.preprocess(
    (input) => convertNullToUndefinedSmart(input, schema),
    schema
  );
}

/**
 * A wrapper around Mastra's createTool that automatically applies the
 * null -> undefined fix for optional fields in the input schema.
 *
 * @see https://github.com/mastra-ai/mastra/pull/11469
 */
export function createCapTool<
  TId extends string = string,
  TSchemaIn = unknown,
  TSchemaOut = unknown,
  TSuspend = unknown,
  TResume = unknown,
  TContext extends ToolExecutionContext<
    TSuspend,
    TResume
  > = ToolExecutionContext<TSuspend, TResume>
>(opts: ToolAction<TSchemaIn, TSchemaOut, TSuspend, TResume, TContext, TId>) {
  const wrappedInputSchema = opts.inputSchema
    ? withNullToUndefined(opts.inputSchema as ZodTypeAny)
    : undefined;

  return createTool({
    ...opts,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: wrappedInputSchema as any,
  });
}
