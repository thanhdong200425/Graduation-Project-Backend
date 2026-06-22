import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MailService } from './../src/mail/mail.service';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Exercises the self-service "forgot password" flow end to end against the real
 * database. The SMTP transport is stubbed out via a mocked MailService so no
 * mail is actually sent.
 */
describe('Auth - forgot password (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const mailMock = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetRequestEmail: jest.fn().mockResolvedValue(undefined),
  };

  const email = `forgot-e2e-${Date.now()}@example.com`;
  const password = 'Password123!';
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mailMock)
      .compile();

    app = moduleFixture.createNestApplication();
    // Mirror the global pipe configured in main.ts so validation behaves the
    // same as in production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name: 'Forgot E2E' })
      .expect(201);
    userId = res.body.user.id;
  });

  afterAll(async () => {
    if (userId) {
      // Cascade deletes the user's password reset tokens.
      await prisma.user
        .delete({ where: { id: userId } })
        .catch(() => undefined);
    }
    await app.close();
  });

  beforeEach(() => {
    mailMock.sendPasswordResetRequestEmail.mockClear();
  });

  it('sends a reset link and creates an active token for a registered email', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);

    expect(res.body.message).toContain('password reset link');
    expect(mailMock.sendPasswordResetRequestEmail).toHaveBeenCalledTimes(1);
    // Email is sent to the normalized address with a reset link argument.
    expect(mailMock.sendPasswordResetRequestEmail).toHaveBeenCalledWith(
      email,
      'Forgot E2E',
      expect.stringContaining('/reset-password?token='),
    );

    const tokens = await prisma.passwordResetToken.findMany({
      where: { userId, usedAt: null },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns the same generic response for an unknown email and sends no mail', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: `nobody-${Date.now()}@example.com` })
      .expect(200);

    expect(res.body.message).toContain('password reset link');
    expect(mailMock.sendPasswordResetRequestEmail).not.toHaveBeenCalled();
  });

  it('invalidates the previous token when a new reset is requested', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);

    // Only the most-recently issued token remains active; older ones are used.
    const active = await prisma.passwordResetToken.findMany({
      where: { userId, usedAt: null },
    });
    expect(active).toHaveLength(1);
  });

  it('rejects a malformed email with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(mailMock.sendPasswordResetRequestEmail).not.toHaveBeenCalled();
  });
});
