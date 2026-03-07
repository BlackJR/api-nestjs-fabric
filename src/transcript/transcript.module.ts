import { Module } from '@nestjs/common';
import { TranscriptController } from './transcript.controller';
import { TranscriptService } from './transcript.service';
import { FireFlyModule } from '../firefly/firefly.module'; // Changement vers FireFly

@Module({
    imports: [FireFlyModule],
    controllers: [TranscriptController],
    providers: [TranscriptService],
    exports: [TranscriptService]
})
export class TranscriptModule { }
