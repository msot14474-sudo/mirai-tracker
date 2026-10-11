import { UserRole } from '@prisma/client';

export type UserRoleAssignment = {
  role: UserRole;
  campusId: string | null;
};

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  notificationEmail?: string | null;
  roles: UserRoleAssignment[];
  staffProfileId: string | null;
  studentProfile: {
    id: string;
    batchId: string;
  } | null;
};

export type AuthenticatedRequest = {
  headers: { cookie?: string };
  user?: AuthenticatedUser;
  sessionToken?: string;
};
