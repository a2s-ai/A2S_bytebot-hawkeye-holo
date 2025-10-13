import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksGateway } from './tasks.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesModule } from '../messages/messages.module';
import { FileStorageService } from './file-storage.service';
import { TaskArchivalService } from './task-archival.service';

@Module({
  imports: [PrismaModule, MessagesModule],
  controllers: [TasksController],
  providers: [TasksService, TasksGateway, FileStorageService, TaskArchivalService],
  exports: [TasksService, TasksGateway, FileStorageService, TaskArchivalService],
})
export class TasksModule {}
