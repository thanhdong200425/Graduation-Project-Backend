import { ForbiddenException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { GoogleProfile } from './interfaces/google-profile.interface';

/**
 * Unit coverage for the Google sign-in find-or-create/link logic. The OAuth
 * redirect handshake itself is owned by passport and can't be meaningfully
 * unit-tested, but this is where the real branching lives.
 */
describe('AuthService.loginWithGoogle', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    create: jest.Mock;
    toSafeUser: jest.Mock;
  };
  let prisma: {
    user: { update: jest.Mock };
    userActivity: { create: jest.Mock };
  };
  let jwtService: { signAsync: jest.Mock };

  const profile: GoogleProfile = {
    googleId: 'g-123',
    email: 'Teacher@School.edu', // intentionally mixed-case to assert normalization
    name: 'Jane Teacher',
    avatarUrl: 'http://pic/jane.png',
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      toSafeUser: jest.fn(
        (u: { id: string; email: string; name: string; role: UserRole }) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
        }),
      ),
    };
    prisma = {
      user: { update: jest.fn() },
      userActivity: { create: jest.fn().mockResolvedValue(undefined) },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('jwt-token') };

    service = new AuthService(
      usersService as never,
      jwtService as never,
      prisma as never,
      {} as never, // MailService - unused here
      {} as never, // ConfigService - unused here
    );
  });

  it('creates a new account with the carried STUDENT role and normalized email', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({
      id: 'u1',
      email: 'teacher@school.edu',
      name: 'Jane Teacher',
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
    });

    const res = await service.loginWithGoogle(profile, 'STUDENT');

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'teacher@school.edu',
        name: 'Jane Teacher',
        role: UserRole.STUDENT,
        googleId: 'g-123',
        avatarUrl: 'http://pic/jane.png',
      }),
    );
    // CREATE_ACCOUNT + LOGIN activity records.
    expect(prisma.userActivity.create).toHaveBeenCalledTimes(2);
    expect(res.accessToken).toBe('jwt-token');
  });

  it('defaults a new account to TEACHER when role is missing or unknown', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({
      id: 'u2',
      email: 'teacher@school.edu',
      name: 'Jane Teacher',
      role: UserRole.TEACHER,
      status: UserStatus.ACTIVE,
    });

    await service.loginWithGoogle(profile, undefined);

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.TEACHER }),
    );
  });

  it('auto-links an existing email/password account instead of creating a new one', async () => {
    const existing = {
      id: 'u3',
      email: 'teacher@school.edu',
      name: 'Jane',
      role: UserRole.TEACHER,
      status: UserStatus.ACTIVE,
      googleId: null,
      avatarUrl: null,
    };
    usersService.findByEmail.mockResolvedValue(existing);
    prisma.user.update.mockResolvedValue({
      ...existing,
      googleId: 'g-123',
      avatarUrl: 'http://pic/jane.png',
    });

    await service.loginWithGoogle(profile, 'STUDENT'); // role ignored for existing users

    expect(usersService.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u3' },
        data: { googleId: 'g-123', avatarUrl: 'http://pic/jane.png' },
      }),
    );
  });

  it('does not re-link a user that already has a googleId', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'u4',
      email: 'teacher@school.edu',
      name: 'Jane',
      role: UserRole.TEACHER,
      status: UserStatus.ACTIVE,
      googleId: 'g-existing',
      avatarUrl: null,
    });

    await service.loginWithGoogle(profile, undefined);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a suspended account', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'u5',
      status: UserStatus.SUSPENDED,
    });

    await expect(
      service.loginWithGoogle(profile, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersService.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
