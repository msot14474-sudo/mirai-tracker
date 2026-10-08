import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { SafeHttpExceptionFilter } from './http-exception.filter';

function setup() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('SafeHttpExceptionFilter', () => {
  it('keeps intentional HTTP validation responses', () => {
    const { host, status, json } = setup();
    new SafeHttpExceptionFilter().catch(
      new BadRequestException(['A value is required.']),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['A value is required.'] }),
    );
  });

  it('hides unexpected exception details from clients', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = setup();
    new SafeHttpExceptionFilter().catch(
      new Error('database password was exposed here'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error.',
    });
  });
});
