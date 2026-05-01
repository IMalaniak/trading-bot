import { Prisma } from './generated/client';

export type PrismaDecimal = Prisma.Decimal;
export type PrismaDecimalInput = PrismaDecimal | number | string;

export const toPrismaDecimal = (value: PrismaDecimalInput): PrismaDecimal =>
  new Prisma.Decimal(value);

export const zeroPrismaDecimal = (): PrismaDecimal => new Prisma.Decimal(0);

export const prismaDecimalToNumber = (value: PrismaDecimal): number =>
  value.toNumber();
