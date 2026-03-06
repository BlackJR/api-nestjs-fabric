import { Controller, Post, Body, HttpException, HttpStatus, Logger, Get, Param, Res } from '@nestjs/common';
import { DiplomaService } from './diploma.service';
import type { Response } from 'express';

interface IssueDiplomaDto {
    org: string; // L'org qui signe (Généralement le Ministère ou l'Ecole)
    id: string;
    studentName: string;
    schoolName: string;
}

@Controller('diploma')
export class DiplomaController {
    private readonly logger = new Logger(DiplomaController.name);

    constructor(private readonly diplomaService: DiplomaService) { }

    @Post('issue')
    async issueDiploma(@Body() dto: IssueDiplomaDto) {
        if (!dto.org || !dto.id || !dto.studentName || !dto.schoolName) {
            throw new HttpException('Paramètres manquants (org, id, studentName, schoolName).', HttpStatus.BAD_REQUEST);
        }

        try {
            return await this.diplomaService.issueDiploma(dto.org, dto);
        } catch (error) {
            this.logger.error(`Erreur émission diplôme: ${error.message}`);
            throw new HttpException(
                { status: 'error', message: error.message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('view/:id')
    async viewDiplomaLocally(@Param('id') id: string, @Res() res: Response) {
        try {
            // Note: En mode prod GCP, on redirigerait vers le bucket, ou on retourne l'URL publique.
            // Pour démo/debug local sans GCP, on regénère le PDF à la volée.
            const { pdfBuffer } = await this.diplomaService.generateDiplomaPdf({
                id,
                studentName: 'Eleve Inconnu',
                schoolName: 'Verification System',
                date: new Date().toISOString().split('T')[0]
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="diploma-${id}.pdf"`);
            res.send(pdfBuffer);
        } catch (error) {
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Erreur lors de la génération du PDF');
        }
    }
}
