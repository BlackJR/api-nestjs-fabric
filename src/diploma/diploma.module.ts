import { Module } from '@nestjs/common';
import { DiplomaService } from './diploma.service';
import { DiplomaController } from './diploma.controller';
import { FabricModule } from '../fabric/fabric.module';

@Module({
    imports: [FabricModule],
    controllers: [DiplomaController],
    providers: [DiplomaService],
})
export class DiplomaModule { }
