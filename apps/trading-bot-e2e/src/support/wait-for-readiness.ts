import { verifySystemReady } from './system-readiness';

const main = async (): Promise<void> => {
  await verifySystemReady();
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
