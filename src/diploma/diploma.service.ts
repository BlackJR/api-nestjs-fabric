import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import PDFDocument = require('pdfkit');
import { Buffer } from 'buffer';
import { FireFlyService } from '../firefly/firefly.service';

const BUCKET_NAME = 'diploma-exemple';

@Injectable()
export class DiplomaService {
    private readonly logger = new Logger(DiplomaService.name);
    private readonly storage = new Storage();

    constructor(private readonly fireflyService: FireFlyService) { }

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

        // URL publique de Google Cloud Storage chargée de manière plus sécurisée
        const storageBaseUrl = process.env.GCP_STORAGE_URL || 'https://storage.googleapis.com';
        return `${storageBaseUrl}/${BUCKET_NAME}/${id}.pdf`;
    }

    /**
     * Orchestre l'émission complète du diplôme : PDF -> GCP -> Fabric via FireFly
     */
    async issueDiploma(orgId: string, payload: { id: string; studentName: string; schoolName: string }): Promise<any> {
        this.logger.log(`[1/3] Génération du PDF pour ${payload.studentName}...`);
        const date = new Date().toISOString().split('T')[0];
        const { pdfBuffer, hash } = await this.generateDiplomaPdf({ ...payload, date });

        this.logger.log(`[2/3] Upload du PDF vers GCP Storage (Hash: ${hash})...`);
        let fileUrl = '';
        try {
            fileUrl = await this.uploadToGcp(payload.id, pdfBuffer);
        } catch (error: any) {
            this.logger.warn(`Impossible d'uploader sur GCP (erreur credentials possibles en local) : ${error.message}`);
            // Pour le dev local, on continue même si l'upload GCP échoue si pas de clés
            fileUrl = `local-mode-no-gcp-upload/${payload.id}.pdf`;
        }

        this.logger.log(`[3/3] Inscription sur la Blockchain via FireFly...`);
        // On map les champs du diplôme vers le smart contract "asset-transfer-basic" standard
        // => 2. Enregistrement asynchrone sur la blockchain via FireFly
        const currentDate = new Date().toISOString();
        const fireflyResponse = await this.fireflyService.createDocument(
            payload.id,
            'DIPLOMA',
            payload.studentName,
            hash,
            'Org1MSP', // Par défaut
            currentDate
        );

        return {
            message: 'Diplôme généré et soumis à la blockchain (FireFly)',
            diplomaId: payload.id,
            documentHash: hash,
            publicUrl: fileUrl,
            fireflyTxId: fireflyResponse.id,
        };
    }

    async revokeDiploma(id: string) {
        this.logger.log(`Demande de révocation pour le document ${id}`);
        // 1. Demande asynchrone Firestore
        const fireflyResponse = await this.fireflyService.revokeDocument(id);

        return {
            message: 'Requête de révocation envoyée à la blockchain.',
            fireflyTxId: fireflyResponse.id
        }
    }

    async replaceDiploma(payload: { oldId: string, newId: string, studentName: string, schoolName: string }) {
        this.logger.log(`Demande de remplacement de ${payload.oldId} par ${payload.newId}`);
        // 1. Génération du nouveau PDF 
        const { pdfBuffer, hash } = await this.generateDiplomaPdf({
            id: payload.newId,
            studentName: payload.studentName,
            schoolName: payload.schoolName,
            date: new Date().toISOString().split('T')[0] // Utilise la date d'aujourd'hui
        });

        // 2. Upload vers Google Cloud Storage
        let fileUrl = '';
        try {
            fileUrl = await this.uploadToGcp(`diploma-${payload.newId}.pdf`, pdfBuffer);
            this.logger.log(`Nouveau PDF de reemplécement uploadé sur GCP: ${fileUrl}`);
        } catch (error) {
            this.logger.warn(`L'upload GCP a échoué (mode dev ?). On continue le process blockchain.`);
            fileUrl = `local-mode-no-gcp-upload/diploma-${payload.newId}.pdf`;
        }

        // 3. Appel blockchain asynchrone
        const currentDate = new Date().toISOString();
        const fireflyResponse = await this.fireflyService.replaceDocument(
            payload.oldId,
            payload.newId,
            'DIPLOMA',
            payload.studentName,
            hash,
            'Org1MSP', // Issuer par défaut
            currentDate
        );

        return {
            message: 'Diplôme de remplacement soumis à la blockchain.',
            newDiplomaId: payload.newId,
            newDocumentHash: hash,
            publicUrl: fileUrl,
            fireflyTxId: fireflyResponse.id
        };
    }

    async getAllDiplomas() {
        return this.fireflyService.getAllDiplomas();
    }
}
