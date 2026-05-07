import { Prisma } from './generated/client';

Prisma.Decimal.set({ precision: 40 });

export type PrismaDecimal = Prisma.Decimal;
export type PrismaDecimalInput = PrismaDecimal | number | string;

export const toPrismaDecimal = (value: PrismaDecimalInput): PrismaDecimal =>
  new Prisma.Decimal(value);

export const prismaDecimalToString = (value: PrismaDecimalInput): string =>
  toPrismaDecimal(value).toString();
