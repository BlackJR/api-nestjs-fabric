import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FabricModule } from './fabric/fabric.module';
import { DiplomaModule } from './diploma/diploma.module';
import { TranscriptModule } from './transcript/transcript.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyThrottlerGuard } from './security/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000, // Durée en millisecondes (1 minute)
      limit: 20, // 20 requêtes par minute par IP maximum
    }]),
    FabricModule,
    DiplomaModule,
    TranscriptModule,
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
