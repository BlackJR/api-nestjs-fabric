import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FabricModule } from './fabric/fabric.module';
import { DiplomaModule } from './diploma/diploma.module';
import { TranscriptModule } from './transcript/transcript.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FabricModule,
    DiplomaModule,
    TranscriptModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
