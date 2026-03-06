import { Controller, Post, Body, HttpException, HttpStatus, Logger, Get, Param, Res } from '@nestjs/common';
import { TranscriptService } from './transcript.service';
import type { Response } from 'express';

interface Grade {
    subject: string;
    score: number;
}

interface IssueTranscriptDto {
    org: string; // Doit être 'org2' ou 'org3'
    id: string;
    studentId: string;
    schoolName: string;
    grades: Grade[];
}

@Controller('transcript')
export class TranscriptController {
    private readonly logger = new Logger(TranscriptController.name);

    constructor(private readonly transcriptService: TranscriptService) { }

    @Post('issue')
    async issueTranscript(@Body() dto: IssueTranscriptDto) {
        if (!dto.org || !dto.id || !dto.studentId || !dto.schoolName || !dto.grades) {
            throw new HttpException('Paramètres manquants (org, id, studentId, schoolName, grades).', HttpStatus.BAD_REQUEST);
        }

        try {
            return await this.transcriptService.issueTranscript(dto.org, dto);
        } catch (error) {
            this.logger.error(`Erreur émission bulletin: ${error.message}`);
            throw new HttpException(
                { status: 'error', message: error.message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('view/:id')
    async viewTranscriptLocally(@Param('id') id: string, @Res() res: Response) {
        try {
            const { pdfBuffer } = await this.transcriptService.generateTranscriptPdf({
                id,
                studentId: 'STD-000',
                schoolName: 'Verification System',
                grades: [],
                date: new Date().toISOString().split('T')[0],
                average: 0
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="transcript-${id}.pdf"`);
            res.send(pdfBuffer);
        } catch (error) {
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Erreur lors de la génération du PDF');
        }
    }
}
