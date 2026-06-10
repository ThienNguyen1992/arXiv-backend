import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger(NotificationGateway.name);
  private userSockets = new Map<string, string>(); // userId -> socketId

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    this.userSockets.set(userId, client.id);
    this.logger.log(`Client connected: ${client.id}, userId: ${userId}`);
  }

  handleDisconnect(client: Socket) {
    const userId = Array.from(this.userSockets.entries())
      .find(([_, socketId]) => socketId === client.id)?.[0];
    
    if (userId) {
      this.userSockets.delete(userId);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Gửi notification đến tất cả users
  sendNotification(notification: any) {
    this.server.emit('notification', notification);
    this.logger.log('Notification sent to all clients');
  }

  // Gửi notification đến user cụ thể
  sendToUser(userId: string, notification: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('notification', notification);
      this.logger.log(`Notification sent to user ${userId}`);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, data: { userId: string }) {
    this.userSockets.set(data.userId, client.id);
    return { success: true };
  }
}
