import { Module } from '@nestjs/common';
import { DiplomaController } from './diploma.controller';
import { DiplomaService } from './diploma.service';
import { FireFlyModule } from '../firefly/firefly.module'; // Import du nouveau module HTTP FireFly

@Module({
    imports: [FireFlyModule], // Remplacement de l'ancien module
    controllers: [DiplomaController],
    providers: [DiplomaService],
    exports: [DiplomaService]
})
export class DiplomaModule { }
