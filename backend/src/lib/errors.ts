export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'You do not have permission to perform this action') => new HttpError(403, message);
export const notFound = (message = 'Resource not found') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
