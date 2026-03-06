import { Injectable, Logger } from '@nestjs/common';
import { FabricService } from '../fabric/fabric.service';
import { Storage } from '@google-cloud/storage';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import PDFDocument = require('pdfkit');
import { Buffer } from 'buffer';

const BUCKET_NAME = 'diploma-exemple';

interface Grade {
    subject: string;
    score: number;
}

@Injectable()
export class TranscriptService {
    private readonly logger = new Logger(TranscriptService.name);
    private readonly storage = new Storage();

    constructor(private readonly fabricService: FabricService) { }

    /**
     * Génère le PDF de Bulletin de Notes en mémoire et calcule son Hash
     */
    async generateTranscriptPdf(data: { id: string; studentId: string; schoolName: string; grades: Grade[]; date: string; average: number }): Promise<{ pdfBuffer: Buffer; hash: string }> {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                const chunks: Buffer[] = [];

                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(chunks);
                    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
                    resolve({ pdfBuffer, hash });
                });

                // QR Code
                const verifyUrl = `https://hypertest.foo/verify/transcript/${data.id}`;
                const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { width: 120 });

                // Dessin du Bulletin
                doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke('#34495e');

                doc.font('Helvetica-Bold').fontSize(30).fillColor('#2980b9').text('BULLETIN ACADÉMIQUE', { align: 'center' });
                doc.moveDown(0.5);
                doc.font('Helvetica').fontSize(16).fillColor('#000000').text(`Établissement : ${data.schoolName}`, { align: 'center' });
                doc.moveDown(1.5);

                doc.font('Helvetica-Bold').fontSize(14).text(`Étudiant ID : ${data.studentId}`, 50);
                doc.text(`Identifiant Document : ${data.id}`, 50);
                doc.text(`Date d'émission : ${data.date}`, 50);

                doc.moveDown(2);
                doc.font('Helvetica-Bold').fontSize(18).fillColor('#34495e').text('Détail des notes', { underline: true });
                doc.moveDown(1);

                doc.font('Helvetica').fontSize(14).fillColor('#000');
                let y = doc.y;
                data.grades.forEach(g => {
                    doc.text(g.subject, 50, y);
                    doc.text(`${g.score}/20`, 400, y);
                    y += 25;
                });

                doc.y = y + 20;
                doc.font('Helvetica-Bold').fontSize(16).fillColor('#c0392b').text(`MOYENNE GÉNÉRALE : ${data.average.toFixed(2)}/20`, 50, doc.y);

                doc.image(qrCodeDataUrl, doc.page.width - 160, 50, { width: 100 });

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    async uploadToGcp(id: string, pdfBuffer: Buffer): Promise<string> {
        const bucket = this.storage.bucket(BUCKET_NAME);
        const file = bucket.file(`transcript-${id}.pdf`);

        await file.save(pdfBuffer, {
            contentType: 'application/pdf',
            metadata: {
                cacheControl: 'public, max-age=31536000',
            },
        });

        return `https://storage.googleapis.com/${BUCKET_NAME}/transcript-${id}.pdf`;
    }

    async issueTranscript(orgId: string, payload: { id: string; studentId: string; schoolName: string; grades: Grade[] }): Promise<any> {
        if (!payload.grades || payload.grades.length === 0) throw new Error("Aucune note fournie");

        // Calcul de la moyenne
        const total = payload.grades.reduce((sum, g) => sum + g.score, 0);
        const average = Number((total / payload.grades.length).toFixed(2));
        const date = new Date().toISOString().split('T')[0];

        this.logger.log(`[1/3] Génération du PDF Bulletin (Moyenne: ${average})...`);
        const { pdfBuffer, hash } = await this.generateTranscriptPdf({ ...payload, average, date });

        this.logger.log(`[2/3] Upload du PDF vers GCP Storage (Hash: ${hash})...`);
        let fileUrl = '';
        try {
            fileUrl = await this.uploadToGcp(payload.id, pdfBuffer);
        } catch (error) {
            this.logger.warn(`Impossible d'uploader sur GCP en local : ${error.message}`);
            fileUrl = `local-mode-no-gcp-upload/transcript-${payload.id}.pdf`;
        }

        this.logger.log(`[3/3] Inscription du Hash via ${orgId}...`);
        await this.fabricService.invokeLedger(
            orgId,
            'mychannel',
            'basic:TranscriptContract',
            'CreateTranscript',
            payload.id,
            payload.studentId,
            average.toString(),
            hash,
            date
        );

        return {
            status: 'success',
            message: 'Bulletin certifié et enregistré avec succès.',
            data: {
                id: payload.id,
                average: average,
                hash: hash,
                url: fileUrl,
            }
        };
    }
}
