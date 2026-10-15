import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Query,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { exportRequestSchema } from './export.schemas';
import { ExportService } from './export.service';

@Controller('exports')
@Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER)
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get()
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('campusId') campusId?: string,
  ) {
    return this.exports.history(
      user,
      campusId ? parse(z.string().uuid(), campusId) : undefined,
    );
  }

  @Post()
  async generate(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const request = parse(exportRequestSchema, body);
    const generated = await this.exports.generate(request, user);
    return new StreamableFile(generated.content, {
      type: generated.contentType,
      disposition: `attachment; filename="${generated.filename}"`,
      length: generated.content.length,
    });
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message),
    );
  }
  return result.data;
}
