/**
 * Base class for domain errors.
 *
 * Every expected failure produced by the domain/application layer extends
 * `DomainError`, so it can be handled uniformly (shown to the user, logged)
 * without being confused with programmer errors.
 *
 * `code` is a stable machine-readable identifier. UI/telemetry must rely on
 * `code`, never on `message` (the latter is for the developer).
 */
export abstract class DomainError extends Error {
  public abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
