import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FireFlyModule } from './firefly/firefly.module';
import { DiplomaModule } from './diploma/diploma.module';
import { TranscriptModule } from './transcript/transcript.module';
import { EventsModule } from './events/events.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyThrottlerGuard } from './security/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 20,
    }]),
    FireFlyModule,
    DiplomaModule,
    TranscriptModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyThrottlerGuard,
    }
  ],
})
export class AppModule { }
