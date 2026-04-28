export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isTransientError(error: unknown) {
  if (error instanceof HttpError) {
    return [408, 425, 429, 500, 502, 503, 504].includes(error.status);
  }

  return error instanceof TypeError;
}
