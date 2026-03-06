import { Injectable, Logger } from '@nestjs/common';
import { FabricService } from '../fabric/fabric.service';
import { Storage } from '@google-cloud/storage';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import PDFDocument = require('pdfkit');
import { Buffer } from 'buffer';

const BUCKET_NAME = 'diploma-exemple';

@Injectable()
export class DiplomaService {
    private readonly logger = new Logger(DiplomaService.name);
    private readonly storage = new Storage();

    constructor(private readonly fabricService: FabricService) { }

    /**
     * Génère le PDF en mémoire avec PDFKit, et retourne le Buffer et son Hash SHA-256
     */
    async generateDiplomaPdf(data: { id: string; studentName: string; schoolName: string; date: string }): Promise<{ pdfBuffer: Buffer; hash: string }> {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
                const chunks: Buffer[] = [];

                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(chunks);
                    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
                    resolve({ pdfBuffer, hash });
                });

                // QR Code
                const verifyUrl = `https://hypertest.foo/verify/${data.id}`;
                const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { width: 150 });

                // Dessin du Diplôme
                doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke('#2c3e50');
                doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).stroke('#e67e22');

                doc.font('Helvetica-Bold').fontSize(40).fillColor('#2c3e50').text('DIPLÔME DE RÉUSSITE', { align: 'center' });
                doc.moveDown(1);
                doc.font('Helvetica').fontSize(20).fillColor('#000000').text("Le Ministère de l'Éducation certifie que", { align: 'center' });
                doc.moveDown(1);
                doc.font('Helvetica-Bold').fontSize(35).fillColor('#e67e22').text(data.studentName, { align: 'center' });
                doc.moveDown(1);
                doc.font('Helvetica').fontSize(18).fillColor('#000000').text(`a validé avec succès son cursus au sein de ${data.schoolName}.`, { align: 'center' });

                doc.image(qrCodeDataUrl, doc.page.width - 180, doc.page.height - 180, { width: 120 });

                doc.fontSize(12).fillColor('#555555')
                    .text(`ID Blockchain: ${data.id}`, 50, doc.page.height - 120)
                    .text(`Date d'émission: ${data.date}`, 50, doc.page.height - 100);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Upload le Buffer PDF vers Cloud Storage
     */
    async uploadToGcp(id: string, pdfBuffer: Buffer): Promise<string> {
        const bucket = this.storage.bucket(BUCKET_NAME);
        const file = bucket.file(`${id}.pdf`);

        await file.save(pdfBuffer, {
            contentType: 'application/pdf',
            metadata: {
                cacheControl: 'public, max-age=31536000',
            },
        });

        // URL publique de Google Cloud Storage
        return `https://storage.googleapis.com/${BUCKET_NAME}/${id}.pdf`;
    }

    /**
     * Orchestre l'émission complète du diplôme : PDF -> GCP -> Fabric
     */
    async issueDiploma(orgId: string, payload: { id: string; studentName: string; schoolName: string }): Promise<any> {
        this.logger.log(`[1/3] Génération du PDF pour ${payload.studentName}...`);
        const date = new Date().toISOString().split('T')[0];
        const { pdfBuffer, hash } = await this.generateDiplomaPdf({ ...payload, date });

        this.logger.log(`[2/3] Upload du PDF vers GCP Storage (Hash: ${hash})...`);
        let fileUrl = '';
        try {
            fileUrl = await this.uploadToGcp(payload.id, pdfBuffer);
        } catch (error) {
            this.logger.warn(`Impossible d'uploader sur GCP (erreur credentials possibles en local) : ${error.message}`);
            // Pour le dev local, on continue même si l'upload GCP échoue si pas de clés
            fileUrl = `local-mode-no-gcp-upload/${payload.id}.pdf`;
        }

        this.logger.log(`[3/3] Inscription du Hash sur la Blockchain via ${orgId}...`);
        await this.fabricService.invokeLedger(
            orgId,
            'mychannel',
            'basic',               // Notre chaincode deployé sur mychannel s'appelle toujours "basic"
            'CreateDiploma',
            payload.id,
            payload.studentName,
            payload.schoolName,
            hash,
            date
        );

        return {
            status: 'success',
            message: 'Diplôme certifié et enregistré avec succès.',
            data: {
                id: payload.id,
                hash: hash,
                url: fileUrl,
            }
        };
    }
}
