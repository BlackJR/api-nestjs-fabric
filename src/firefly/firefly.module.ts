import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FireFlyService } from './firefly.service';

@Module({
    imports: [HttpModule],
    providers: [FireFlyService],
    exports: [FireFlyService],
})
export class FireFlyModule { }
