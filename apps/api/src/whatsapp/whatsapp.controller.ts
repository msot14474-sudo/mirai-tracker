import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
type Request = { headers: Record<string, string | string[] | undefined> };
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { WhatsAppService } from './whatsapp.service';
import { validSignature } from './whatsapp.parser';
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}
  @Get('account')
  @Roles('FACULTY')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.whatsapp.status(user);
  }
  @Post('account/link')
  @Roles('FACULTY')
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { phone?: string },
  ) {
    if (typeof body?.phone !== 'string')
      throw new BadRequestException('Enter your WhatsApp number.');
    return this.whatsapp.link(user, body.phone);
  }
  @Delete('account/link')
  @Roles('FACULTY')
  unlink(@CurrentUser() user: AuthenticatedUser) {
    return this.whatsapp.unlink(user);
  }
  @Get('webhook')
  @Public()
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (
      mode !== 'subscribe' ||
      !process.env.WHATSAPP_VERIFY_TOKEN ||
      token !== process.env.WHATSAPP_VERIFY_TOKEN ||
      !/^\d{1,100}$/.test(challenge || '')
    )
      throw new ForbiddenException();
    return challenge;
  }
  @Post('webhook')
  @Public()
  @HttpCode(200)
  receive(@Req() request: RawBodyRequest<Request>, @Body() body: unknown) {
    if (
      !validSignature(
        request.rawBody,
        request.headers['x-hub-signature-256'] as string,
        process.env.WHATSAPP_APP_SECRET,
      )
    )
      throw new ForbiddenException('Invalid webhook signature.');
    return this.whatsapp.receive(body);
  }
}
