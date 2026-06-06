import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';

interface HelloServiceGrpc {
  sayHello(data: { name: string }): Observable<{ message: string }>;
}

@Injectable()
export class HelloService implements OnModuleInit {
  private helloService: HelloServiceGrpc;

  constructor(@Inject('HELLO_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.helloService = this.client.getService<HelloServiceGrpc>('HelloService');
  }

  getHello(name: string): Observable<{ message: string }> {
    return this.helloService.sayHello({ name });
  }
}
