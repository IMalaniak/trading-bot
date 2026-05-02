import { Prisma } from './generated/client';
import { PrismaService } from './prisma.service';

export type PrismaDbClient = Prisma.TransactionClient | PrismaService;
