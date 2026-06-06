import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HelloController } from './hello.controller';
import { HelloService } from './hello.service';
import { join } from 'path';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'HELLO_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'hello',
          protoPath: join(__dirname, '../../../proto/hello.proto'),
          url: 'localhost:50051', // Python gRPC server URL
        },
      },
    ]),
  ],
  controllers: [HelloController],
  providers: [HelloService],
})
export class HelloModule {}
