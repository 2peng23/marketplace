export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
