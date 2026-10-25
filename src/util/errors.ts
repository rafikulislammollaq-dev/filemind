export class RBCError extends Error {
  constructor(message: string, public code: string = "ERROR") {
    super(message);
    this.name = "RBCError";
  }
}

export class PathNotAllowedError extends RBCError {
  constructor(message: string) { super(message, "PATH_NOT_ALLOWED"); }
}
export class FileTooLargeError extends RBCError {
  constructor(message: string) { super(message, "FILE_TOO_LARGE"); }
}
export class MissingDependencyError extends RBCError {
  constructor(message: string) { super(message, "MISSING_DEPENDENCY"); }
}
export class ValidationError extends RBCError {
  constructor(message: string) { super(message, "VALIDATION_ERROR"); }
}
