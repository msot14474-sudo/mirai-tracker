import { ForbiddenException } from '@nestjs/common';
import { JobStatus, UserRole } from '@prisma/client';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { SemesterImportService } from './semester-import.service';
import { demoSetupRows } from './semester-import.template';
import { setupColumns } from './semester-import.types';

const manager: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Program Manager',
  email: 'manager@mirai.local',
  roles: [{ role: UserRole.PROGRAM_MANAGER, campusId: null }],
  staffProfileId: null,
  studentProfile: null,
};

describe('SemesterImportService', () => {
  it('previews a file without writing to the database', async () => {
    const { service, prisma, access } = setup();
    const preview = await service.preview(validFile(), manager);

    expect(preview.valid).toBe(true);
    expect(preview.counts.subjects).toBe(1);
    expect(access.assertGlobalManager).toHaveBeenCalledWith(manager);
    expect(prisma.importJob.create).not.toHaveBeenCalled();
  });

  it('records row errors and does not start a transaction for an invalid file', async () => {
    const { service, prisma } = setup();
    prisma.importJob.create.mockResolvedValue({ id: 'job-invalid' });
    prisma.importJob.findUnique.mockResolvedValue({
      id: 'job-invalid',
      status: JobStatus.FAILED,
      errors: [{ rowNumber: 1 }],
    });

    const result = await service.execute(
      file('invalid.csv', 'campus_code,campus_name\nHI-TECH,Campus'),
      manager,
    );

    expect(result.preview?.valid).toBe(false);
    expect(prisma.importJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          totalRows: 1,
          failedRows: 1,
          errors: expect.any(Object),
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('upserts the complete relationship graph in one transaction', async () => {
    const { service, prisma, transaction, timetable } = setup();
    prisma.importJob.create.mockResolvedValue({ id: 'job-valid' });
    prisma.importJob.findUnique.mockResolvedValue({
      id: 'job-valid',
      status: JobStatus.COMPLETED,
      successfulRows: 1,
      errors: [],
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(transaction),
    );

    const result = await service.execute(validFile(), manager);

    expect(transaction.campus.upsert).toHaveBeenCalled();
    expect(transaction.semester.upsert).toHaveBeenCalled();
    expect(transaction.track.upsert).toHaveBeenCalled();
    expect(transaction.batch.upsert).toHaveBeenCalled();
    expect(transaction.subject.upsert).toHaveBeenCalled();
    expect(transaction.subjectOffering.upsert).toHaveBeenCalled();
    expect(transaction.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: JobStatus.COMPLETED }),
      }),
    );
    expect(transaction.auditEvent.create).toHaveBeenCalled();
    expect(timetable.regenerateSemester).toHaveBeenCalledWith(
      'semester-a',
      manager,
    );
    expect(result.counts?.offerings).toBe(1);
  });

  it('enforces the global academic-setup permission boundary', async () => {
    const { service, access } = setup();
    access.assertGlobalManager.mockImplementation(() => {
      throw new ForbiddenException();
    });
    await expect(service.preview(validFile(), manager)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

function setup() {
  const transaction = {
    campus: { upsert: jest.fn().mockResolvedValue({ id: 'campus-a' }) },
    track: { upsert: jest.fn().mockResolvedValue({ id: 'track-a' }) },
    semester: { upsert: jest.fn().mockResolvedValue({ id: 'semester-a' }) },
    batch: { upsert: jest.fn().mockResolvedValue({ id: 'batch-a' }) },
    subject: { upsert: jest.fn().mockResolvedValue({ id: 'subject-a' }) },
    subjectOffering: {
      upsert: jest.fn().mockResolvedValue({ id: 'offering-a' }),
    },
    calendarDayOverride: { upsert: jest.fn() },
    importJob: { update: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    importJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const access = { assertGlobalManager: jest.fn() };
  const timetable = {
    regenerateSemester: jest.fn().mockResolvedValue(undefined),
  };
  return {
    timetable,
    transaction,
    prisma,
    access,
    service: new SemesterImportService(
      prisma as unknown as PrismaService,
      access as unknown as AccessPolicyService,
      timetable as never,
    ),
  };
}

function validFile() {
  const source = [setupColumns, demoSetupRows()[0]!]
    .map((row) => row.join(','))
    .join('\r\n');
  return file('valid.csv', source);
}

function file(originalname: string, source: string) {
  const buffer = Buffer.from(source);
  return {
    originalname,
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
  };
}
