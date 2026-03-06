import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FabricModule } from './fabric/fabric.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FabricModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
