import { NestFactory } from '@nestjs/core';
import * as import_common from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // Allow all origins
  app.useGlobalPipes(new import_common.ValidationPipe({ transform: true }));

  const config = new DocumentBuilder()
    .setTitle('arXiv Backend API')
    .setDescription(
      'NestJS backend for arXiv paper discovery. Auth uses JWT access tokens only. ' +
        'Swagger UI: /api',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
