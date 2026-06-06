import { Controller, Get, Query } from '@nestjs/common';
import { HelloService } from './hello.service';

@Controller('test-microservice')
export class HelloController {
  constructor(private readonly helloService: HelloService) {}

  @Get()
  getHello(@Query('name') name: string) {
    const requestName = name || 'NestJS User';
    return this.helloService.getHello(requestName);
  }
}
