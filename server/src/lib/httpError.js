// Throw these from routes/services; the central error handler turns them into JSON.
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message) => new HttpError(409, 'CONFLICT', message);
export const tooManyRequests = (message) => new HttpError(429, 'TOO_MANY_REQUESTS', message);

/** Route handler for backlog items that are not built yet. */
export const notImplemented = (backlogId) => () => {
  throw new HttpError(501, 'NOT_IMPLEMENTED', `${backlogId} is not implemented yet`);
};
