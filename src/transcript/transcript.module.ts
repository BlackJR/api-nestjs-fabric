import { Module } from '@nestjs/common';
import { TranscriptService } from './transcript.service';
import { TranscriptController } from './transcript.controller';
import { FabricModule } from '../fabric/fabric.module';

@Module({
    imports: [FabricModule],
    controllers: [TranscriptController],
    providers: [TranscriptService],
})
export class TranscriptModule { }
