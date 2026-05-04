import { Prisma } from './generated/client';

export const isUniqueConstraintViolation = (
  error: unknown,
  target?: string,
): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  if (!target) {
    return true;
  }

  const targetFields = Array.isArray(error.meta?.['target'])
    ? error.meta?.['target'].map(String)
    : [];

  return targetFields.includes(target);
};
