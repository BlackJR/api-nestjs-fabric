import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { WebhooksController } from './webhooks.controller';

@Module({
    controllers: [WebhooksController],
    providers: [EventsGateway],
    exports: [EventsGateway],
})
export class EventsModule { }
