// `parse(schema, req.body)` throws a ZodError that the central error handler maps to 400.
// Express 5 forwards rejected promises from async handlers to the error handler, so routes can
// simply `throw` — no try/catch or asyncHandler wrapper needed.
export const parse = (schema, input) => schema.parse(input);
