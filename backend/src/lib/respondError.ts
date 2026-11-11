import { Response } from "express";
import { Prisma } from "@prisma/client";

/** True for failures of the database layer or the code itself: their messages hold SQL, file paths and server details. */
function isInternal(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientRustPanicError ||
    !(err instanceof Error)
  );
}

/**
 * Answers with the error's message when it is one of our own business errors ("Employee not found", "Only a draft payroll
 * run can be processed"...), with the given status. Anything else (a database failure, a bug) is passed on to the global
 * error handler, which logs it and answers a plain 500 without telling the client what went wrong inside.
 */
export function respondError(res: Response, status: number, err: unknown) {
  // two database outcomes that are really the client's doing: asking for a record that does not exist, and a duplicate
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return res.status(404).json({ error: "Not found" });
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return res.status(409).json({ error: "Already exists" });
  if (isInternal(err)) throw err;
  return res.status(status).json({ error: (err as Error).message });
}
