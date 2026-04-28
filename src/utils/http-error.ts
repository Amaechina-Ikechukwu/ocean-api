export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = "Authentication required"): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = "Insufficient permissions"): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = "Resource not found"): HttpError {
  return new HttpError(404, message);
}
