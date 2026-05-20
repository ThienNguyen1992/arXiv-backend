// ... existing code ...

const path = require('path');
const express = require('@nestjs/express');
const swaggerUi = require('swagger-ui-express');

const config = require('../config/default.json');
const logger = require('./logger');

const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');

// ... existing code ...

const document = new DocumentBuilder().setTitle('API')
  .setDescription('This is API description')
  .setVersion('1.0')
  .build();

const swaggerDocument = SwaggerModule.createDocument(app, document);

const uiPath = path.join(__dirname, '..', 'swagger-ui');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));