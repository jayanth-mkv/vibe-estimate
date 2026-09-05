export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "AppError";
  }
}
export const notFound = () => new AppError(404, "PROJECT_NOT_FOUND", "This project could not be found.");
