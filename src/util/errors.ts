export class FileMindError extends Error {
  constructor(message: string, public code: string = "ERROR") {
    super(message);
    this.name = "FileMindError";
  }
}

export class PathNotAllowedError extends FileMindError {
  constructor(message: string) { super(message, "PATH_NOT_ALLOWED"); }
}
export class FileTooLargeError extends FileMindError {
  constructor(message: string) { super(message, "FILE_TOO_LARGE"); }
}
export class MissingDependencyError extends FileMindError {
  constructor(message: string) { super(message, "MISSING_DEPENDENCY"); }
}
export class ValidationError extends FileMindError {
  constructor(message: string) { super(message, "VALIDATION_ERROR"); }
}
