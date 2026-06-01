import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const BCRYPT_SALT_ROUNDS = 10;

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function main() {
  const email = normalizeEmail(
    getArg('--email') ?? process.env.ADMIN_EMAIL ?? '',
  );
  const password = getArg('--password') ?? process.env.ADMIN_PASSWORD ?? '';
  const name = (getArg('--name') ?? process.env.ADMIN_NAME ?? '').trim();

  if (!email || !password || !name) {
    console.error(
      'Usage: yarn create-admin --email <email> --password <password> --name <name>',
    );
    console.error(
      '   or: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... yarn create-admin',
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const existing = await prisma.admin.findUnique({
      where: { email },
    });

    if (existing) {
      console.error(`Admin already exists for email: ${email}`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const admin = await prisma.admin.create({
      data: {
        email,
        name,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    console.log('Admin created successfully:');
    console.log(`  id:    ${admin.id}`);
    console.log(`  email: ${admin.email}`);
    console.log(`  name:  ${admin.name}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to create admin:', error);
  process.exit(1);
});
